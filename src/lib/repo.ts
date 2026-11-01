import { db, newId } from './db';
import type { ProcessedFile } from './documents';
import type { Company, Home, Job, JobDocument, Location } from './types';

/**
 * Einzige Stelle, an der die Oberfläche Daten schreibt. Beim späteren
 * Umstieg auf Dexie Cloud wird hier angepasst, nicht in den Komponenten.
 */

const now = () => Date.now();

// ---------- Unternehmen und Standorte ----------

export function emptyCompany(): Company {
  return { id: newId(), name: '', industry: '', rating: 0, website: '', notes: '', createdAt: now(), updatedAt: now() };
}

export function emptyLocation(companyId: string): Location {
  return { id: newId(), companyId, label: '', street: '', zip: '', city: '', state: '', country: 'DE', createdAt: now(), updatedAt: now() };
}

/** Das Verzeichnis (Realm) bestimmt der Aufrufer über `c.realmId`; ohne realmId ist es privat. */
export async function saveCompany(c: Company) {
  await db.companies.put({ ...c, updatedAt: now() });
}

/** Standorte liegen immer im selben Verzeichnis wie ihr Unternehmen. */
export async function saveLocation(l: Location) {
  const company = await db.companies.get(l.companyId);
  const { realmId: _old, ...rest } = l;
  await db.locations.put({ ...rest, ...(company?.realmId ? { realmId: company.realmId } : {}), updatedAt: now() });
}

/** Verschiebt ein Unternehmen samt Standorten in ein anderes Verzeichnis. */
export async function moveCompany(id: string, realmId: string) {
  await db.transaction('rw', db.companies, db.locations, async () => {
    await db.companies.update(id, { realmId, updatedAt: now() });
    await db.locations.where('companyId').equals(id).modify({ realmId, updatedAt: now() });
  });
}

/** Legt eine unabhängige Kopie samt Standorten in einem anderen Verzeichnis an; liefert die neue ID. */
export async function copyCompany(id: string, realmId: string | undefined): Promise<string> {
  const c = await db.companies.get(id);
  if (!c) throw new Error('Unternehmen nicht gefunden.');
  const t = now();
  const realm = realmId ? { realmId } : {};
  const { realmId: _r, owner: _o, ...base } = c as Company & { owner?: string };
  const copy: Company = { ...base, ...realm, id: newId(), createdAt: t, updatedAt: t };
  const locations = (await db.locations.where('companyId').equals(id).toArray()).map(l => {
    const { realmId: _lr, owner: _lo, ...lb } = l as Location & { owner?: string };
    return { ...lb, ...realm, id: newId(), companyId: copy.id, createdAt: t, updatedAt: t };
  });
  await db.transaction('rw', db.companies, db.locations, async () => {
    await db.companies.add(copy);
    await db.locations.bulkAdd(locations);
  });
  return copy.id;
}

/** Löscht den Standort und löst die Verknüpfung betroffener Stellen. */
export async function deleteLocation(id: string) {
  await db.transaction('rw', db.locations, db.jobs, async () => {
    await db.jobs.where('locationId').equals(id).modify({ locationId: null, updatedAt: now() });
    await db.locations.delete(id);
  });
}

/** Löscht Unternehmen samt Standorten; Stellen bleiben erhalten, nur ohne Verknüpfung. */
export async function deleteCompany(id: string) {
  await db.transaction('rw', db.companies, db.locations, db.jobs, async () => {
    await db.jobs.where('companyId').equals(id).modify({ companyId: null, locationId: null, updatedAt: now() });
    await db.locations.where('companyId').equals(id).delete();
    await db.companies.delete(id);
  });
}

// ---------- Stellen und Dokumente ----------

export function emptyJob(): Job {
  return {
    id: newId(), title: '', reference: '', url: '', companyId: null, locationId: null, workModel: '',
    status: 'interessant', relevance: 0, deadline: '', followUp: '', notes: '',
    createdAt: now(), updatedAt: now(),
  };
}

export async function saveJob(j: Job) {
  await db.jobs.put({ ...j, updatedAt: now() });
}

export async function deleteJob(id: string) {
  await db.transaction('rw', db.jobs, db.documents, async () => {
    await db.documents.where('jobId').equals(id).delete();
    await db.jobs.delete(id);
  });
}

export async function addDocument(jobId: string, f: ProcessedFile) {
  const doc: JobDocument = {
    id: newId(), jobId, name: f.name, type: f.type, size: f.blob.size, blob: f.blob, createdAt: now(),
    originalSize: f.originalSize, compressed: f.compressed, text: f.text, ocr: f.ocr,
  };
  await db.documents.add(doc);
}

export async function deleteDocument(id: string) {
  await db.documents.delete(id);
}

// ---------- Heimadressen und Einstellungen ----------

export async function saveHome(h: Pick<Home, 'name' | 'address'> & { id?: string }): Promise<string> {
  const existing = h.id ? await db.homes.get(h.id) : undefined;
  const id = existing?.id ?? newId();
  await db.homes.put({ id, name: h.name.trim(), address: h.address.trim(), createdAt: existing?.createdAt ?? now(), updatedAt: now() });
  return id;
}

export async function deleteHome(id: string) {
  await db.homes.delete(id);
  const active = await db.settings.get('activeHomeId');
  if (active?.value === id) await db.settings.delete('activeHomeId');
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
