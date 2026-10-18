import { liveQuery } from 'dexie';
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
}

// ---------- Nur lokal gespeicherte Werte (nicht im Backup, nie synchronisiert) ----------

const ORS_KEY = 'switchtracker.orsKey';

function readLocal(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

class LocalPrefs {
  orsKey = $state(readLocal(ORS_KEY));

  setOrsKey(value: string) {
    this.orsKey = value.trim();
    try { localStorage.setItem(ORS_KEY, this.orsKey); } catch { /* privater Modus */ }
  }
}

export const prefs = new LocalPrefs();
