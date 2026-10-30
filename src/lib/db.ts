import Dexie, { type EntityTable } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
import type { Company, Geocode, Home, Job, JobDocument, Location, Route, Setting, Travel } from './types';

/**
 * Adresse der Dexie-Cloud-Datenbank (nicht geheim). Ohne sie läuft die App
 * nur im Gastmodus; Anmeldung und Synchronisation sind dann ausgeblendet.
 */
export const CLOUD_URL: string = import.meta.env.VITE_DEXIE_CLOUD_URL ?? '';

/**
 * Hauptdatenbank: Unternehmensverzeichnis (companies, locations) und
 * Stellenverzeichnis (jobs, documents) sowie nutzerbezogene Daten (homes, settings).
 * Alle IDs sind UUIDs, damit Dexie Cloud sie unverändert synchronisieren kann.
 */
export const db = new Dexie('switchtracker', { addons: CLOUD_URL ? [dexieCloud] : [] }) as Dexie & {
  companies: EntityTable<Company, 'id'>;
  locations: EntityTable<Location, 'id'>;
  jobs: EntityTable<Job, 'id'>;
  documents: EntityTable<JobDocument, 'id'>;
  homes: EntityTable<Home, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

const stores = {
  companies: 'id, name',
  locations: 'id, companyId',
  jobs: 'id, companyId, locationId, status',
  documents: 'id, jobId',
  homes: 'id',
  settings: 'key',
};
db.version(1).stores(stores);
// Version 2: gleiches Schema; mit Dexie Cloud kommen dessen interne Tabellen hinzu
db.version(2).stores(stores);

if (CLOUD_URL) {
  db.cloud.configure({
    databaseUrl: CLOUD_URL,
    // Gastmodus bleibt ohne Anmeldung nutzbar; beim ersten Anmelden werden die Gastdaten übernommen
    requireAuth: false,
    // gleiche IndexedDB wie im Gastmodus weiterverwenden, sonst begänne man mit einer leeren Datenbank
    nameSuffix: false,
    // Einstellungen (Schlüssel wie „activeHomeId“) sind gerätebezogen und würden zwischen Nutzern kollidieren
    unsyncedTables: ['settings'],
    // Dokumente erst laden, wenn sie geöffnet werden (spart Speicher und Datenvolumen)
    blobMode: 'lazy',
  });
}

/**
 * Abgeleitete Geodaten in einer eigenen Datenbank. Sie lässt sich jederzeit
 * leeren, ohne Unternehmen oder Stellen zu berühren, und wird nie synchronisiert.
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
