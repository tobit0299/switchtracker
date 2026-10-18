import { db, newId } from './db';
import type { Company, Home, Job, Location } from './types';

/**
 * Beispieldaten: erfundene Unternehmen an öffentlichen Adressen (Rathäuser u. Ä.),
 * damit Geocoding und Karte sofort etwas zeigen.
 */
export async function loadSampleData() {
  const t = Date.now();
  const inDays = (d: number) => new Date(t + d * 86_400_000).toLocaleDateString('sv-SE');

  const company = (name: string, industry: string, rating: number, website = ''): Company =>
    ({ id: newId(), name, industry, rating, website, notes: '', createdAt: t, updatedAt: t });
  const location = (c: Company, label: string, street: string, zip: string, city: string, country = 'DE'): Location =>
    ({ id: newId(), companyId: c.id, label, street, zip, city, state: '', country, createdAt: t, updatedAt: t });
  const job = (title: string, c: Company | null, l: Location | null, p: Partial<Job>): Job => ({
    id: newId(), title, url: '', companyId: c?.id ?? null, locationId: l?.id ?? null, workModel: 'hybrid',
    status: 'interessant', relevance: 3, deadline: '', followUp: '', notes: '', createdAt: t, updatedAt: t, ...p,
  });

  const nordlicht = company('Nordlicht Logistik GmbH (Beispiel)', 'Logistik', 4);
  const isar = company('Isar Analytics AG (Beispiel)', 'IT / Software', 5);
  const rhein = company('Rheinwerk Energie GmbH (Beispiel)', 'Energie', 3);
  const main = company('Mainfinanz Bank AG (Beispiel)', 'Finanzen', 2);
  const grachten = company('Grachten Data B.V. (Beispiel)', 'IT / Software', 4);
  const donau = company('Donau Consulting GmbH (Beispiel)', 'Beratung', 3);

  const lHamburg = location(nordlicht, 'Zentrale', 'Rathausmarkt 1', '20095', 'Hamburg');
  const lDortmund = location(nordlicht, 'Lager West', 'Friedensplatz 1', '44135', 'Dortmund');
  const lMuenchen = location(isar, 'Hauptsitz', 'Marienplatz 8', '80331', 'München');
  const lDuesseldorf = location(rhein, 'Verwaltung', 'Marktplatz 2', '40213', 'Düsseldorf');
  const lBonn = location(rhein, 'Technik', 'Markt 2', '53111', 'Bonn');
  const lFrankfurt = location(main, 'Zentrale', 'Römerberg 23', '60311', 'Frankfurt am Main');
  const lAmsterdam = location(grachten, 'Office', 'Dam 1', '1012 JS', 'Amsterdam', 'NL');
  const lWien = location(donau, 'Büro Wien', 'Stephansplatz 1', '1010', 'Wien', 'AT');

  const jobs: Job[] = [
    job('Data Engineer (m/w/d)', isar, lMuenchen, { status: 'beworben', relevance: 5, deadline: inDays(5), followUp: inDays(10) }),
    job('Projektmanager Digitalisierung', nordlicht, lHamburg, { status: 'gespraech', relevance: 4, followUp: inDays(2) }),
    job('Business Analyst', rhein, lDuesseldorf, { status: 'in_arbeit', relevance: 4, deadline: inDays(12), workModel: 'vor_ort' }),
    job('IT-Systemadministrator', rhein, lBonn, { status: 'interessant', relevance: 3, deadline: inDays(-2) }),
    job('Supply Chain Analyst', nordlicht, lDortmund, { status: 'interessant', relevance: 3, deadline: inDays(20), workModel: 'vor_ort' }),
    job('Risikocontroller', main, lFrankfurt, { status: 'absage', relevance: 2 }),
    job('Cloud Engineer', grachten, lAmsterdam, { status: 'angebot', relevance: 4, workModel: 'hybrid' }),
    job('Senior Consultant', donau, lWien, { status: 'interessant', relevance: 2, deadline: inDays(30) }),
    job('Frontend-Entwickler (100 % remote)', null, null, { status: 'interessant', relevance: 3, workModel: 'homeoffice' }),
  ];

  const home: Home = { id: newId(), name: 'Beispiel: Köln', address: 'Domkloster 4, 50667 Köln', createdAt: t, updatedAt: t };

  await db.transaction('rw', db.companies, db.locations, db.jobs, db.homes, db.settings, async () => {
    await db.companies.bulkAdd([nordlicht, isar, rhein, main, grachten, donau]);
    await db.locations.bulkAdd([lHamburg, lDortmund, lMuenchen, lDuesseldorf, lBonn, lFrankfurt, lAmsterdam, lWien]);
    await db.jobs.bulkAdd(jobs);
    if ((await db.homes.count()) === 0) {
      await db.homes.add(home);
      await db.settings.put({ key: 'activeHomeId', value: home.id });
    }
  });
}
