import type { LineString } from 'geojson';
import { geoDb } from '../db';
import { prefs, store } from '../store.svelte';
import type { Coord, Geocode, Route } from '../types';
import { travelKey, type GeoRequest } from './keys';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const ORS = 'https://api.openrouteservice.org/v2';
const PROFILE = 'driving-car';
/** ORS-Matrix: 1 Start + bis zu 49 Ziele pro Anfrage */
const MATRIX_BATCH = 49;

export const geoStatus = $state({ geocodePending: 0, travelPending: 0, error: '' });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------- Geocoding: Warteschlange mit max. 1 Anfrage pro Sekunde ----------

const queue = new Map<string, GeoRequest>();
let geocoding = false;

/** Fordert Koordinaten für Adressen an, die noch nicht im Cache stehen. */
export function requestGeocodes(requests: GeoRequest[]) {
  for (const r of requests) {
    if (!r.query.trim() || store.geocodeByKey.has(r.key) || queue.has(r.key)) continue;
    queue.set(r.key, r);
  }
  geoStatus.geocodePending = queue.size;
  if (queue.size) void runGeocodeQueue();
}

async function runGeocodeQueue() {
  if (geocoding) return;
  geocoding = true;
  try {
    while (queue.size) {
      const [key, req] = queue.entries().next().value!;
      // kann inzwischen von einem anderen Tab o. Ä. gefüllt worden sein
      if (!(await geoDb.geocodes.get(key))) await geoDb.geocodes.put(await geocode(req));
      queue.delete(key);
      geoStatus.geocodePending = queue.size;
    }
    if (geoStatus.error.startsWith('Adresssuche')) geoStatus.error = '';
  } catch (e) {
    // Netzwerk- oder Serverfehler: nichts zwischenspeichern, Warteschlange anhalten
    queue.clear();
    geoStatus.geocodePending = 0;
    geoStatus.error = 'Adresssuche fehlgeschlagen: ' + (e as Error).message;
  } finally {
    geocoding = false;
  }
}

type NominatimHit = { lat: string; lon: string; display_name: string; address?: Record<string, string> };

/** Eine Nominatim-Anfrage, danach Pause gemäß Nutzungsregel (max. 1/s). */
async function nominatim(params: Record<string, string>): Promise<NominatimHit | undefined> {
  const url = NOMINATIM + '?' + new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '1', ...params });
  const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const [hit] = (await res.json()) as NominatimHit[];
  await sleep(1100);
  return hit;
}

// Stadtstaaten haben bei Nominatim kein eigenes „state“-Feld
const CITY_STATES = ['Berlin', 'Hamburg', 'Bremen', 'Wien'];

async function geocode(req: GeoRequest): Promise<Geocode> {
  const s = req.structured;
  let hit: NominatimHit | undefined;
  if (s && s.city) {
    hit = await nominatim(Object.fromEntries(Object.entries(s).filter(([, v]) => v)));
    // Rückfall: Freitext innerhalb des Landes (hilft bei ungewöhnlichen Schreibweisen)
    if (!hit) hit = await nominatim({ q: req.query, ...(s.countrycodes ? { countrycodes: s.countrycodes } : {}) });
  } else {
    hit = await nominatim({ q: req.query });
  }
  const a = hit?.address ?? {};
  return {
    key: req.key, query: req.query, found: !!hit,
    lat: hit ? +hit.lat : 0, lon: hit ? +hit.lon : 0,
    label: hit?.display_name ?? '',
    state: a.state ?? (CITY_STATES.includes(a.city) ? a.city : ''),
    countryCode: (a.country_code ?? '').toUpperCase(),
    manual: false, fetchedAt: Date.now(),
  };
}

/** Verwirft das gespeicherte Ergebnis einer Adresse und sucht sie erneut. */
export async function regeocode(req: GeoRequest) {
  await geoDb.geocodes.delete(req.key);
  queue.delete(req.key);
  setTimeout(() => requestGeocodes([req]), 50);
}

/** Speichert eine von Hand korrigierte Position (wird nie automatisch überschrieben). */
export async function setManualPosition(req: GeoRequest, coord: Coord) {
  const old = await geoDb.geocodes.get(req.key);
  await geoDb.geocodes.put({
    key: req.key, query: req.query, found: true, lat: coord.lat, lon: coord.lon,
    label: old?.label ?? req.query, state: old?.state ?? '', countryCode: old?.countryCode ?? '',
    manual: true, fetchedAt: Date.now(),
  });
}

// ---------- OpenRouteService ----------

async function orsPost<T>(path: string, body: unknown): Promise<T> {
  if (!prefs.orsKey) throw new Error('Kein OpenRouteService-Schlüssel hinterlegt');
  const res = await fetch(ORS + path, {
    method: 'POST',
    headers: { Authorization: prefs.orsKey, 'Content-Type': 'application/json', Accept: 'application/json, application/geo+json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error ?? res.statusText;
    throw new Error(`HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return data as T;
}

let travelRunning = false;

/**
 * Berechnet Fahrzeiten vom Start zu allen Zielen, für die es noch keinen
 * Eintrag gibt. Vorhandene Kombinationen werden nie erneut angefragt.
 */
export async function requestTravel(from: Coord, targets: Coord[]) {
  if (!prefs.orsKey || travelRunning) return;
  const seen = new Set<string>();
  const missing = targets.filter(t => {
    const k = travelKey(from, t, PROFILE);
    if (store.travelByKey.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!missing.length) return;

  travelRunning = true;
  geoStatus.travelPending = missing.length;
  try {
    for (let i = 0; i < missing.length; i += MATRIX_BATCH) {
      const batch = missing.slice(i, i + MATRIX_BATCH);
      const data = await orsPost<{ durations: (number | null)[][]; distances: (number | null)[][] }>(`/matrix/${PROFILE}`, {
        locations: [[from.lon, from.lat], ...batch.map(t => [t.lon, t.lat])],
        sources: [0],
        destinations: batch.map((_, j) => j + 1),
        metrics: ['duration', 'distance'],
        units: 'km',
      });
      await geoDb.travel.bulkPut(batch.map((t, j) => {
        const d = data.durations[0][j];
        const km = data.distances[0][j];
        return { key: travelKey(from, t, PROFILE), reachable: d != null, durationS: d ?? 0, distanceKm: km ?? 0, computedAt: Date.now() };
      }));
      geoStatus.travelPending = Math.max(0, missing.length - i - batch.length);
    }
    if (geoStatus.error.startsWith('Fahrzeit')) geoStatus.error = '';
  } catch (e) {
    geoStatus.error = 'Fahrzeitberechnung fehlgeschlagen: ' + (e as Error).message;
  } finally {
    travelRunning = false;
    geoStatus.travelPending = 0;
  }
}

/** Route als Linie: aus dem Cache oder einmalig von ORS. */
export async function getRoute(from: Coord, to: Coord): Promise<Route> {
  const key = travelKey(from, to, PROFILE);
  const cached = await geoDb.routes.get(key);
  if (cached) return cached;
  const data = await orsPost<{ features: { geometry: LineString; properties: { summary: { duration: number; distance: number } } }[] }>(
    `/directions/${PROFILE}/geojson`,
    { coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
  );
  const f = data.features[0];
  const route: Route = {
    key, geometry: f.geometry,
    durationS: f.properties.summary.duration, distanceKm: f.properties.summary.distance / 1000,
    computedAt: Date.now(),
  };
  await geoDb.routes.put(route);
  return route;
}

/** Löscht alle abgeleiteten Geodaten außer von Hand korrigierten Positionen. */
export async function clearGeoCache() {
  await geoDb.transaction('rw', geoDb.geocodes, geoDb.travel, geoDb.routes, async () => {
    await geoDb.geocodes.filter(g => !g.manual).delete();
    await geoDb.travel.clear();
    await geoDb.routes.clear();
  });
}
