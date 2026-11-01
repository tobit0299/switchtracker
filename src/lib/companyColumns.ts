import type { LocationRow } from './store.svelte';

/** Spalten der kompakten Tabelle der Unternehmenskarte (eine Zeile je Standort). */
export type CompanyColumnKey =
  | 'company' | 'location' | 'city' | 'state' | 'country' | 'industry' | 'rating' | 'jobs' | 'air' | 'travel';

export interface CompanyColumnDef {
  key: CompanyColumnKey;
  label: string;
  num?: boolean;
  /** Sortierung startet absteigend (z. B. Sterne: beste zuerst) */
  descFirst?: boolean;
}

export const COMPANY_COLUMNS: CompanyColumnDef[] = [
  { key: 'company', label: 'Unternehmen' },
  { key: 'location', label: 'Standort' },
  { key: 'city', label: 'Ort' },
  { key: 'state', label: 'Bundesland' },
  { key: 'country', label: 'Land' },
  { key: 'industry', label: 'Branche' },
  { key: 'rating', label: 'Bewertung', descFirst: true },
  { key: 'jobs', label: 'Stellen', num: true, descFirst: true },
  { key: 'air', label: 'Luftlinie', num: true },
  { key: 'travel', label: 'Fahrzeit', num: true },
];

export const companyColumnByKey = new Map(COMPANY_COLUMNS.map(c => [c.key, c]));

/** Standardspalten der Unternehmenskarte */
export const DEFAULT_COMPANY_MAP_COLUMNS: CompanyColumnKey[] = ['company', 'city', 'rating'];

/** Sortierwert; null = leer, landet unabhängig von der Richtung immer am Ende. */
export function locationSortValue(r: LocationRow, k: CompanyColumnKey): string | number | null {
  switch (k) {
    case 'company': return r.company?.name ?? null;
    case 'location': return r.location.label || null;
    case 'city': return r.location.city || null;
    case 'state': return r.state || null;
    case 'country': return r.location.country || null;
    case 'industry': return r.company?.industry || null;
    case 'rating': return r.company?.rating || null;
    case 'jobs': return r.jobCount || null;
    case 'air': return r.airKm;
    case 'travel': return r.travel?.reachable ? r.travel.durationS : null;
  }
}

export function compareLocationRows(a: LocationRow, b: LocationRow, k: CompanyColumnKey, asc: boolean): number {
  const va = locationSortValue(a, k);
  const vb = locationSortValue(b, k);
  if (va == null) return vb == null ? 0 : 1;
  if (vb == null) return -1;
  const d = typeof va === 'number' ? va - (vb as number) : va.localeCompare(vb as string, 'de');
  return asc ? d : -d;
}
