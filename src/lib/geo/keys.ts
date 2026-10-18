import type { Feature, Polygon } from 'geojson';
import type { Coord, Location } from '../types';
import { countryLabel } from '../types';

/** Lesbare Adresse eines Standorts, so wie sie an das Geocoding geht. */
export function locationAddress(l: Pick<Location, 'street' | 'zip' | 'city' | 'country'>): string {
  return [l.street, [l.zip, l.city].filter(Boolean).join(' '), l.country ? countryLabel(l.country) : '']
    .map(s => s.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Normalisierte Adresse als Cache-Schlüssel: Schreibweisen wie „Str.“/„Strasse“,
 * Groß-/Kleinschreibung und Leerzeichen sollen keine doppelte Anfrage auslösen.
 */
export function addressKey(address: string): string {
  return address
    .normalize('NFC')
    .toLowerCase()
    .replace(/strasse\b/g, 'straße')
    .replace(/str\.(?=\s|,|\d|$)/g, 'straße')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/[.,\s]+$/, '')
    .trim();
}

/** Eine Adresssuche: Cache-Schlüssel plus die Felder, mit denen gesucht wird. */
export interface GeoRequest {
  key: string;
  /** Freitext, z. B. für Heimadressen oder als Rückfall */
  query: string;
  /** strukturierte Suche für Standorte (genauer, Land über ISO-Code) */
  structured?: { street: string; postalcode: string; city: string; countrycodes: string };
}

export function locationGeoRequest(l: Pick<Location, 'street' | 'zip' | 'city' | 'country'>): GeoRequest {
  return {
    key: addressKey(locationAddress(l)),
    query: [l.street, [l.zip, l.city].filter(Boolean).join(' ')].map(s => s.trim()).filter(Boolean).join(', '),
    structured: { street: l.street.trim(), postalcode: l.zip.trim(), city: l.city.trim(), countrycodes: l.country.toLowerCase() },
  };
}

export function homeGeoRequest(address: string): GeoRequest {
  return { key: addressKey(address), query: address.trim() };
}

const round = (n: number) => n.toFixed(5);

/** Schlüssel für Fahrzeit und Route: Start + Ziel (auf ~1 m gerundet) + Profil. */
export function travelKey(from: Coord, to: Coord, profile = 'driving-car'): string {
  return `${round(from.lat)},${round(from.lon)}>${round(to.lat)},${round(to.lon)}|${profile}`;
}

/** Luftlinie in km. */
export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kreis als GeoJSON-Polygon für die Radius-Anzeige auf der Karte. */
export function circlePolygon(center: Coord, radiusKm: number, steps = 96): Feature<Polygon> {
  const coords: [number, number][] = [];
  const latR = radiusKm / 110.574;
  const lonR = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([center.lon + lonR * Math.cos(t), center.lat + latR * Math.sin(t)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}
