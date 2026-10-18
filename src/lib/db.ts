import Dexie, { type EntityTable } from 'dexie';
import type { Company, Geocode, Home, Job, JobDocument, Location, Route, Setting, Travel } from './types';

/**
 * Hauptdatenbank: Unternehmensverzeichnis (companies, locations) und
 * Stellenverzeichnis (jobs, documents) sowie nutzerbezogene Daten (homes, settings).
 * Alle IDs sind UUIDs, damit später Dexie Cloud ohne Umbau angebunden werden kann.
 */
export const db = new Dexie('switchtracker') as Dexie & {
  companies: EntityTable<Company, 'id'>;
  locations: EntityTable<Location, 'id'>;
  jobs: EntityTable<Job, 'id'>;
  documents: EntityTable<JobDocument, 'id'>;
  homes: EntityTable<Home, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

db.version(1).stores({
  companies: 'id, name',
  locations: 'id, companyId',
  jobs: 'id, companyId, locationId, status',
  documents: 'id, jobId',
  homes: 'id',
  settings: 'key',
});

/**
 * Abgeleitete Geodaten in einer eigenen Datenbank. Sie lässt sich jederzeit
 * leeren, ohne Unternehmen oder Stellen zu berühren.
 */
export const geoDb = new Dexie('switchtracker-geo') as Dexie & {
  geocodes: EntityTable<Geocode, 'key'>;
  travel: EntityTable<Travel, 'key'>;
  routes: EntityTable<Route, 'key'>;
};

geoDb.version(1).stores({
  geocodes: 'key',
  travel: 'key',
  routes: 'key',
});

export const newId = () => crypto.randomUUID();
