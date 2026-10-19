import type { JobRow } from './store.svelte';
import { STATUSES } from './types';

/** Spalten der Stellentabellen (Übersicht und Reiter „Stellen“). */
export type ColumnKey =
  | 'title' | 'company' | 'city' | 'state' | 'country' | 'status' | 'relevance' | 'rating'
  | 'deadline' | 'followUp' | 'air' | 'travel' | 'workModel' | 'industry';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  num?: boolean;
  /** Sortierung startet absteigend (z. B. Sterne: beste zuerst) */
  descFirst?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'title', label: 'Titel' },
  { key: 'company', label: 'Unternehmen' },
  { key: 'city', label: 'Ort' },
  { key: 'state', label: 'Bundesland' },
  { key: 'country', label: 'Land' },
  { key: 'status', label: 'Status' },
  { key: 'relevance', label: 'Relevanz Stelle', descFirst: true },
  { key: 'rating', label: 'Bewertung Unternehmen', descFirst: true },
  { key: 'deadline', label: 'Frist', num: true },
  { key: 'followUp', label: 'Wiedervorlage', num: true },
  { key: 'air', label: 'Luftlinie', num: true },
  { key: 'travel', label: 'Fahrzeit', num: true },
  { key: 'workModel', label: 'Arbeitsmodell' },
  { key: 'industry', label: 'Branche' },
];

export const columnByKey = new Map(COLUMNS.map(c => [c.key, c]));

/** Standardspalten der kompakten Tabelle in der Übersicht */
export const DEFAULT_OVERVIEW_COLUMNS: ColumnKey[] = ['title', 'status', 'deadline'];

const statusOrder = new Map(STATUSES.map((s, i) => [s.value, i]));

/** Sortierwert; null = leer, landet unabhängig von der Richtung immer am Ende. */
export function sortValue(r: JobRow, k: ColumnKey): string | number | null {
  switch (k) {
    case 'title': return r.job.title;
    case 'company': return r.company?.name ?? null;
    case 'city': return r.location?.city ?? null;
    case 'state': return r.state || null;
    case 'country': return r.location?.country ?? null;
    case 'status': return statusOrder.get(r.job.status) ?? 0;
    case 'relevance': return r.job.relevance || null;
    case 'rating': return r.company?.rating || null;
    case 'deadline': return r.job.deadline || null;
    case 'followUp': return r.job.followUp || null;
    case 'air': return r.airKm;
    case 'travel': return r.travel?.reachable ? r.travel.durationS : null;
    case 'workModel': return r.job.workModel || null;
    case 'industry': return r.company?.industry || null;
  }
}

export function compareRows(a: JobRow, b: JobRow, k: ColumnKey, asc: boolean): number {
  const va = sortValue(a, k);
  const vb = sortValue(b, k);
  if (va == null) return vb == null ? 0 : 1;
  if (vb == null) return -1;
  const d = typeof va === 'number' ? va - (vb as number) : va.localeCompare(vb as string, 'de');
  return asc ? d : -d;
}
