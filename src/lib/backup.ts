import { db, geoDb } from './db';
import type { Company, Geocode, Home, Job, JobDocument, Location, Setting, Travel } from './types';

const FORMAT = 'switchtracker-backup';
const SCHEMA_VERSION = 1;

type StoredDocument = Omit<JobDocument, 'blob'> & { dataUrl: string };

export interface Backup {
  format: typeof FORMAT;
  schemaVersion: number;
  exportedAt: string;
  companies: Company[];
  locations: Location[];
  jobs: Job[];
  documents: StoredDocument[];
  homes: Home[];
  settings: Setting[];
  geocodes: Geocode[];
  travel: Travel[];
}

const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

/** Vollständiges Backup aller Daten. Der ORS-Schlüssel ist nicht enthalten. */
export async function createBackup(includeDocuments: boolean): Promise<Backup> {
  const docs = includeDocuments ? await db.documents.toArray() : [];
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    companies: await db.companies.toArray(),
    locations: await db.locations.toArray(),
    jobs: await db.jobs.toArray(),
    documents: await Promise.all(docs.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) }))),
    homes: await db.homes.toArray(),
    settings: await db.settings.toArray(),
    geocodes: await geoDb.geocodes.toArray(),
    travel: await geoDb.travel.toArray(),
  };
}

export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Liest und prüft eine Backup-Datei, ohne etwas zu verändern. */
export async function parseBackup(file: File): Promise<Backup> {
  let data: Partial<Backup>;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (data.format !== FORMAT) throw new Error('Die Datei ist kein SwitchTracker-Backup.');
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Das Backup stammt aus einer neueren Version der App.');
  }
  for (const k of ['companies', 'locations', 'jobs', 'documents', 'homes', 'settings', 'geocodes', 'travel'] as const) {
    if (data[k] !== undefined && !Array.isArray(data[k])) throw new Error(`Ungültiger Abschnitt „${k}“ im Backup.`);
    data[k] ??= [] as never;
  }
  return data as Backup;
}

/** Ersetzt alle vorhandenen Daten durch das Backup. */
export async function restoreBackup(b: Backup) {
  const documents: JobDocument[] = await Promise.all(
    b.documents.map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await (await fetch(dataUrl)).blob() })),
  );
  await db.transaction('rw', [db.companies, db.locations, db.jobs, db.documents, db.homes, db.settings], async () => {
    await Promise.all([db.companies.clear(), db.locations.clear(), db.jobs.clear(), db.documents.clear(), db.homes.clear(), db.settings.clear()]);
    await db.companies.bulkPut(b.companies);
    await db.locations.bulkPut(b.locations);
    await db.jobs.bulkPut(b.jobs);
    await db.documents.bulkPut(documents);
    await db.homes.bulkPut(b.homes);
    await db.settings.bulkPut(b.settings);
  });
  // Geodaten nur ergänzen: vorhandene Einträge sind genauso gültig
  await geoDb.geocodes.bulkPut(b.geocodes);
  await geoDb.travel.bulkPut(b.travel);
}

/** Löscht alle Unternehmen, Stellen, Dokumente, Heimadressen und Einstellungen. */
export async function deleteAllData() {
  await db.transaction('rw', [db.companies, db.locations, db.jobs, db.documents, db.homes, db.settings], async () => {
    await Promise.all([db.companies.clear(), db.locations.clear(), db.jobs.clear(), db.documents.clear(), db.homes.clear(), db.settings.clear()]);
  });
}
