import { liveQuery } from 'dexie';
import { columnByKey, DEFAULT_OVERVIEW_COLUMNS, type ColumnKey } from './columns';
import { companyColumnByKey, DEFAULT_COMPANY_MAP_COLUMNS, type CompanyColumnKey } from './companyColumns';
import { db, geoDb } from './db';
import { addressKey, haversineKm, locationAddress, travelKey } from './geo/keys';
import type { Company, Coord, Geocode, Home, Job, Location, Profile, Travel } from './types';

/**
 * Zentraler, reaktiver Datenstand. Dexie-liveQuerys halten ihn automatisch
 * aktuell; Komponenten lesen nur hier und schreiben über repo.ts.
 */
class Store {
  companies = $state.raw<Company[]>([]);
  locations = $state.raw<Location[]>([]);
  jobs = $state.raw<Job[]>([]);
  homes = $state.raw<Home[]>([]);
  settings = $state.raw<Record<string, unknown>>({});
  geocodes = $state.raw<Geocode[]>([]);
  travel = $state.raw<Travel[]>([]);
  loaded = $state(false);

  companyById = $derived(new Map(this.companies.map(c => [c.id, c])));
  locationById = $derived(new Map(this.locations.map(l => [l.id, l])));
  geocodeByKey = $derived(new Map(this.geocodes.map(g => [g.key, g])));
  travelByKey = $derived(new Map(this.travel.map(t => [t.key, t])));

  activeHomeId = $derived((this.settings.activeHomeId as string | undefined) ?? this.homes[0]?.id ?? null);
  activeHome = $derived(this.homes.find(h => h.id === this.activeHomeId) ?? null);
  activeHomeCoord = $derived(this.activeHome ? this.coordForAddress(this.activeHome.address) : null);
  /** Suchradius in km, null = kein Radiusfilter */
  radiusKm = $derived((this.settings.radiusKm as number | null | undefined) ?? null);
  profile = $derived((this.settings.profile as Profile | undefined) ?? { name: '', email: '' });
  /** Dokument-Aufbereitung beim Upload, beides standardmäßig an */
  docCompress = $derived(this.settings.docCompress !== false);
  docOcr = $derived(this.settings.docOcr !== false);
  /** Text aller Dokumente je Stelle, für die Volltextsuche */
  docTextByJob = $state.raw<Map<string, string>>(new Map());
  /** „Position korrigieren“ (Marker ziehen) ist standardmäßig aus */
  allowPositionCorrection = $derived(this.settings.allowPositionCorrection === true);
  /** alle Heimadressen auf der Karte zeigen (sonst nur die aktive) */
  showAllHomes = $derived(this.settings.showAllHomes === true);
  /** Heimadressen mit Koordinaten für die Karte */
  homeMarkers = $derived(this.homes.flatMap(h => {
    const coord = this.coordForAddress(h.address);
    const active = h.id === this.activeHomeId;
    return coord && (active || this.showAllHomes) ? [{ id: h.id, coord, name: h.name, active }] : [];
  }));
  /** sichtbare Spalten der kompakten Tabelle der Unternehmenskarte */
  companyMapColumns = $derived.by<CompanyColumnKey[]>(() => {
    const v = this.settings.companyMapColumns;
    const valid = Array.isArray(v) ? (v as CompanyColumnKey[]).filter(k => companyColumnByKey.has(k)) : [];
    return valid.length ? valid : DEFAULT_COMPANY_MAP_COLUMNS;
  });
  /** sichtbare Spalten der kompakten Tabelle in der Übersicht, in Anzeigereihenfolge */
  overviewColumns = $derived.by<ColumnKey[]>(() => {
    const v = this.settings.overviewColumns;
    const valid = Array.isArray(v) ? (v as ColumnKey[]).filter(k => columnByKey.has(k)) : [];
    return valid.length ? valid : DEFAULT_OVERVIEW_COLUMNS;
  });

  coordForAddress(address: string): Coord | null {
    const g = this.geocodeByKey.get(addressKey(address));
    return g?.found ? { lat: g.lat, lon: g.lon } : null;
  }

  geocodeForLocation(l: Location): Geocode | undefined {
    return this.geocodeByKey.get(addressKey(locationAddress(l)));
  }

  coordForLocation(l: Location | null | undefined): Coord | null {
    if (!l) return null;
    const g = this.geocodeForLocation(l);
    return g?.found ? { lat: g.lat, lon: g.lon } : null;
  }

  /** Bundesland: manuell gepflegt oder aus dem Geocoding */
  stateForLocation(l: Location | null | undefined): string {
    if (!l) return '';
    return l.state || this.geocodeForLocation(l)?.state || '';
  }

  airKmForLocation(l: Location | null | undefined): number | null {
    const from = this.activeHomeCoord;
    const to = this.coordForLocation(l);
    return from && to ? haversineKm(from, to) : null;
  }

  travelForLocation(l: Location | null | undefined): Travel | null {
    const from = this.activeHomeCoord;
    const to = this.coordForLocation(l);
    return from && to ? (this.travelByKey.get(travelKey(from, to)) ?? null) : null;
  }

  /** Stellen mit aufgelösten Verknüpfungen und Entfernungen zur aktiven Heimadresse */
  rows = $derived<JobRow[]>(this.jobs.map(job => {
    const company = job.companyId ? (this.companyById.get(job.companyId) ?? null) : null;
    const location = job.locationId ? (this.locationById.get(job.locationId) ?? null) : null;
    return {
      job, company, location,
      coord: this.coordForLocation(location),
      state: this.stateForLocation(location),
      airKm: this.airKmForLocation(location),
      travel: this.travelForLocation(location),
    };
  }));

  /** Standorte des Unternehmensverzeichnisses für die Unternehmenskarte */
  locationRows = $derived.by<LocationRow[]>(() => {
    const jobsPerLocation = new Map<string, number>();
    for (const j of this.jobs) if (j.locationId) jobsPerLocation.set(j.locationId, (jobsPerLocation.get(j.locationId) ?? 0) + 1);
    return this.locations.map(location => ({
      location,
      company: this.companyById.get(location.companyId) ?? null,
      coord: this.coordForLocation(location),
      state: this.stateForLocation(location),
      airKm: this.airKmForLocation(location),
      travel: this.travelForLocation(location),
      jobCount: jobsPerLocation.get(location.id) ?? 0,
    }));
  });
}

export interface LocationRow {
  location: Location;
  company: Company | null;
  coord: Coord | null;
  state: string;
  airKm: number | null;
  travel: Travel | null;
  /** Anzahl eigener Stellen an diesem Standort */
  jobCount: number;
}

export interface JobRow {
  job: Job;
  company: Company | null;
  location: Location | null;
  coord: Coord | null;
  state: string;
  airKm: number | null;
  travel: Travel | null;
}

export const store = new Store();

function bind<T>(query: () => Promise<T>, assign: (v: T) => void) {
  liveQuery(query).subscribe({ next: assign, error: e => console.error('liveQuery', e) });
}

export function startStore() {
  let pending = 7;
  const done = () => { if (--pending === 0) store.loaded = true; };
  const once = <T>(assign: (v: T) => void) => { let first = true; return (v: T) => { assign(v); if (first) { first = false; done(); } }; };

  bind(() => db.companies.toArray(), once(v => (store.companies = v.sort((a, b) => a.name.localeCompare(b.name, 'de')))));
  bind(() => db.locations.toArray(), once(v => (store.locations = v)));
  bind(() => db.jobs.toArray(), once(v => (store.jobs = v)));
  bind(() => db.homes.toArray(), once(v => (store.homes = v.sort((a, b) => a.createdAt - b.createdAt))));
  bind(() => db.settings.toArray(), once(v => (store.settings = Object.fromEntries(v.map(s => [s.key, s.value])))));
  bind(() => geoDb.geocodes.toArray(), once(v => (store.geocodes = v)));
  bind(() => geoDb.travel.toArray(), once(v => (store.travel = v)));
  // nur Name und Text, die Dateiinhalte (Blobs) werden dafür nicht gebraucht
  liveQuery(async () => {
    const map = new Map<string, string>();
    await db.documents.each(d => map.set(d.jobId, `${map.get(d.jobId) ?? ''} ${d.name} ${d.text ?? ''}`));
    return map;
  }).subscribe({ next: v => (store.docTextByJob = v), error: e => console.error('liveQuery', e) });
}

// ---------- Nur lokal gespeicherte Werte (nicht im Backup, nie synchronisiert) ----------

const ORS_KEY = 'switchtracker.orsKey';
const NEW_COMPANY_DIR_KEY = 'switchtracker.newCompanyDirectory';

function readLocal(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

class LocalPrefs {
  orsKey = $state(readLocal(ORS_KEY));
  /** Verzeichnis, in das neue Unternehmen standardmäßig kommen (zuletzt gewähltes) */
  newCompanyDirectory = $state<'private' | 'shared'>(readLocal(NEW_COMPANY_DIR_KEY) === 'shared' ? 'shared' : 'private');

  setNewCompanyDirectory(value: 'private' | 'shared') {
    this.newCompanyDirectory = value;
    try { localStorage.setItem(NEW_COMPANY_DIR_KEY, value); } catch { /* privater Modus */ }
  }

  setOrsKey(value: string) {
    this.orsKey = value.trim();
    try { localStorage.setItem(ORS_KEY, this.orsKey); } catch { /* privater Modus */ }
  }
}

export const prefs = new LocalPrefs();
