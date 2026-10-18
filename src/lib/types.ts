import type { LineString } from 'geojson';

// ---------- Unternehmensverzeichnis (später zwischen Nutzern geteilt) ----------

export interface Company {
  id: string;
  name: string;
  industry: string;
  /** Bewertung 0–5 Sterne, 0 = nicht bewertet */
  rating: number;
  website: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Location {
  id: string;
  companyId: string;
  /** z. B. „Zentrale“ oder „Werk Nord“ */
  label: string;
  street: string;
  zip: string;
  city: string;
  /** Bundesland; leer = aus dem Geocoding übernehmen */
  state: string;
  /** ISO-Ländercode, z. B. DE, NL, AT */
  country: string;
  createdAt: number;
  updatedAt: number;
}

// ---------- Stellenverzeichnis (pro Nutzer) ----------

export type JobStatus =
  | 'interessant'
  | 'in_arbeit'
  | 'beworben'
  | 'gespraech'
  | 'angebot'
  | 'absage'
  | 'zurueckgezogen';

export type WorkModel = '' | 'vor_ort' | 'hybrid' | 'homeoffice';

export interface Job {
  id: string;
  title: string;
  url: string;
  companyId: string | null;
  locationId: string | null;
  workModel: WorkModel;
  status: JobStatus;
  /** Relevanz 0–5 Sterne, 0 = nicht bewertet */
  relevance: number;
  /** ISO-Datum (YYYY-MM-DD) oder leer */
  deadline: string;
  followUp: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface JobDocument {
  id: string;
  jobId: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface Home {
  id: string;
  name: string;
  address: string;
  createdAt: number;
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Profile {
  name: string;
  email: string;
}

// ---------- Geodaten und Routen (abgeleitet, eigene Datenbank) ----------

export interface Coord {
  lat: number;
  lon: number;
}

export interface Geocode {
  /** normalisierte Adresse */
  key: string;
  query: string;
  found: boolean;
  lat: number;
  lon: number;
  label: string;
  state: string;
  countryCode: string;
  /** von Hand korrigiert: wird nie automatisch überschrieben */
  manual: boolean;
  fetchedAt: number;
}

export interface Travel {
  /** Start + Ziel + Profil, siehe travelKey() */
  key: string;
  reachable: boolean;
  durationS: number;
  distanceKm: number;
  computedAt: number;
}

export interface Route {
  key: string;
  geometry: LineString;
  durationS: number;
  distanceKm: number;
  computedAt: number;
}

// ---------- Anzeige-Konstanten ----------

export const STATUSES: { value: JobStatus; label: string; closed?: boolean }[] = [
  { value: 'interessant', label: 'Interessant' },
  { value: 'in_arbeit', label: 'Bewerbung in Arbeit' },
  { value: 'beworben', label: 'Beworben' },
  { value: 'gespraech', label: 'Gespräch' },
  { value: 'angebot', label: 'Angebot' },
  { value: 'absage', label: 'Absage', closed: true },
  { value: 'zurueckgezogen', label: 'Zurückgezogen', closed: true },
];

export const WORK_MODELS: { value: WorkModel; label: string }[] = [
  { value: 'vor_ort', label: 'Vor Ort' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'homeoffice', label: 'Homeoffice' },
];

export const COUNTRIES: { value: string; label: string }[] = [
  { value: 'DE', label: 'Deutschland' },
  { value: 'NL', label: 'Niederlande' },
  { value: 'AT', label: 'Österreich' },
  { value: 'CH', label: 'Schweiz' },
  { value: 'BE', label: 'Belgien' },
  { value: 'LU', label: 'Luxemburg' },
];

export const statusLabel = (s: JobStatus) => STATUSES.find(x => x.value === s)?.label ?? s;
export const workModelLabel = (w: WorkModel) => WORK_MODELS.find(x => x.value === w)?.label ?? '';
export const countryLabel = (c: string) => COUNTRIES.find(x => x.value === c)?.label ?? c;
