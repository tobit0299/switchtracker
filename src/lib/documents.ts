import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Worker as OcrWorker } from 'tesseract.js';

/**
 * Aufbereitung beim Hochladen: Komprimierung und Texterkennung (OCR).
 * Alles läuft im Browser; Dokumente verlassen das Gerät dabei nicht.
 * Die schweren Bibliotheken (pdf.js, pdf-lib, tesseract.js) werden erst
 * beim ersten Upload nachgeladen. Tesseract lädt dabei seine Sprachmodelle
 * (Deutsch, Englisch) einmalig aus dem Netz.
 */

export interface ProcessedFile {
  blob: Blob;
  name: string;
  type: string;
  originalSize: number;
  compressed: boolean;
  /** erkannter bzw. ausgelesener Text, leer wenn keiner */
  text: string;
  /** Text stammt aus Texterkennung (nicht aus der Textebene des PDFs) */
  ocr: boolean;
}

export interface ProcessOptions {
  compress: boolean;
  ocr: boolean;
}

export type ProgressFn = (message: string) => void;

/** Unter so vielen Zeichen pro Seite gilt ein PDF als gescannt (keine Textebene). */
const SCANNED_CHARS_PER_PAGE = 40;
/** Auflösung beim Rastern gescannter Seiten */
const RENDER_DPI = 150;
const JPEG_QUALITY = 0.72;
const MAX_IMAGE_EDGE = 2200;
/** Komprimiertes Ergebnis wird nur übernommen, wenn es spürbar kleiner ist */
const MIN_SAVING = 0.9;

export async function processUpload(file: File, opts: ProcessOptions, progress: ProgressFn): Promise<ProcessedFile> {
  const base: ProcessedFile = { blob: file, name: file.name, type: file.type, originalSize: file.size, compressed: false, text: '', ocr: false };
  try {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return await processPdf(file, opts, progress, base);
    if (/^image\/(jpeg|png|webp|bmp)$/.test(file.type)) return await processImage(file, opts, progress, base);
  } catch (e) {
    // Aufbereitung ist ein Extra: bei Fehlern (z. B. verschlüsseltes PDF) das Original speichern
    console.warn('Dokument-Aufbereitung fehlgeschlagen', e);
    progress(`Aufbereitung von „${file.name}“ nicht möglich, Original wird gespeichert.`);
  }
  return base;
}

// ---------- PDF ----------

async function processPdf(file: File, opts: ProcessOptions, progress: ProgressFn, base: ProcessedFile): Promise<ProcessedFile> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = new Uint8Array(await file.arrayBuffer());
  // pdf.js übernimmt den Puffer, daher eine Kopie übergeben
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const pages = doc.numPages;

  progress(`„${file.name}“: Text wird ausgelesen …`);
  const pageTexts: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map(it => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  const textChars = pageTexts.reduce((n, t) => n + t.length, 0);
  const scanned = textChars < SCANNED_CHARS_PER_PAGE * pages;

  let result: ProcessedFile = { ...base, text: pageTexts.join('\n\n') };

  if (!scanned) {
    // Textbasiertes PDF: verlustfrei neu speichern (Objekt-Streams), Inhalt bleibt unverändert
    if (opts.compress) {
      progress(`„${file.name}“: wird komprimiert …`);
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      const out = await pdf.save({ useObjectStreams: true });
      if (out.byteLength < file.size * MIN_SAVING) {
        result = { ...result, blob: new Blob([out as BlobPart], { type: 'application/pdf' }), type: 'application/pdf', compressed: true };
      }
    }
    await task.destroy();
    return result;
  }

  // Gescanntes PDF: Seiten rastern, daraus OCR und ggf. ein kleineres Bild-PDF erzeugen
  const worker = opts.ocr ? await createOcrWorker(progress) : null;
  const { PDFDocument } = opts.compress ? await import('pdf-lib') : { PDFDocument: null };
  const outPdf = PDFDocument ? await PDFDocument.create() : null;
  const ocrTexts: string[] = [];
  try {
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const base1 = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_DPI / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      if (worker) {
        progress(`„${file.name}“: Texterkennung Seite ${i} von ${pages} …`);
        const { data } = await worker.recognize(canvas);
        ocrTexts.push(data.text.trim());
      }
      if (outPdf) {
        progress(`„${file.name}“: Seite ${i} von ${pages} wird komprimiert …`);
        const jpg = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
        const img = await outPdf.embedJpg(await jpg.arrayBuffer());
        outPdf.addPage([base1.width, base1.height]).drawImage(img, { x: 0, y: 0, width: base1.width, height: base1.height });
      }
      canvas.width = canvas.height = 0; // Speicher freigeben
    }
  } finally {
    await worker?.terminate();
    await task.destroy();
  }

  if (ocrTexts.some(Boolean)) result = { ...result, text: ocrTexts.join('\n\n'), ocr: true };
  if (outPdf) {
    const out = await outPdf.save({ useObjectStreams: true });
    if (out.byteLength < file.size * MIN_SAVING) {
      result = { ...result, blob: new Blob([out as BlobPart], { type: 'application/pdf' }), type: 'application/pdf', compressed: true };
    }
  }
  return result;
}

// ---------- Bilder ----------

async function processImage(file: File, opts: ProcessOptions, progress: ProgressFn, base: ProcessedFile): Promise<ProcessedFile> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let result = base;
  if (opts.ocr) {
    const worker = await createOcrWorker(progress);
    try {
      progress(`„${file.name}“: Texterkennung …`);
      const { data } = await worker.recognize(canvas);
      if (data.text.trim()) result = { ...result, text: data.text.trim(), ocr: true };
    } finally {
      await worker.terminate();
    }
  }
  if (opts.compress) {
    progress(`„${file.name}“: wird komprimiert …`);
    const jpg = await canvasToBlob(canvas, 'image/jpeg', 0.8);
    if (jpg.size < file.size * MIN_SAVING) {
      result = { ...result, blob: jpg, type: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '') + '.jpg', compressed: true };
    }
  }
  return result;
}

// ---------- Hilfsfunktionen ----------

async function createOcrWorker(progress: ProgressFn): Promise<OcrWorker> {
  progress('Texterkennung wird vorbereitet …');
  const { createWorker } = await import('tesseract.js');
  // Beim ersten Mal lädt Tesseract Programmkern und Sprachdaten (mehrere MB) und speichert sie im Browser
  return createWorker(['deu', 'eng'], undefined, {
    logger: m => {
      if (m.status === 'loading language traineddata' && m.progress < 1) {
        progress(`Sprachdaten für die Texterkennung werden geladen (nur beim ersten Mal): ${Math.round(m.progress * 100)} %`);
      }
    },
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality),
  );
}
