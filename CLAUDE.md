# Bewerbungstool

Privates Tool zur Verwaltung von Bewerbungen mit gekoppelter Tabelle und Karte. Windows zuerst, als PWA aber auch mobil nutzbar. Sprache der Oberfläche und der Doku: Deutsch.

## Stand

- Repo: https://github.com/tobit0299/switchtracker (öffentlich), Deployment per GitHub Actions auf GitHub Pages: https://tobit0299.github.io/switchtracker/
- Erste Version der App ist gebaut (Gastmodus, alle vier Reiter, JSON-Backup). Noch nicht umgesetzt: siehe „Offene Punkte“.
- `spike/` ist der ursprüngliche Machbarkeitstest (18.10.2026) und gehört nicht zur App.
- Anforderungen stammen teils aus einer Vorplanung mit einem anderen Werkzeug (WorkBuddy). Dessen Empfehlung chinesischer Kartendienste (Baidu/Tencent/AMap) wurde verworfen.

## Befehle

- `npm run dev`: Entwicklungsserver (Basis `/`)
- `npm run check`: svelte-check und TypeScript, muss fehlerfrei sein
- `npm run build` / `npm run preview`: Produktionsbuild bzw. Vorschau unter `/switchtracker/`

## Code-Aufbau

- `src/lib/db.ts`: Dexie-Datenbanken `switchtracker` (Unternehmen, Standorte, Stellen, Dokumente, Heimadressen, Einstellungen) und `switchtracker-geo` (Geocodes, Fahrzeiten, Routen).
- `src/lib/store.svelte.ts`: reaktiver Datenstand aus liveQuerys, abgeleitete Werte (`rows` = Stellen mit Unternehmen, Standort, Luftlinie, Fahrzeit). Lokale Werte wie der ORS-Schlüssel in `prefs` (localStorage).
- `src/lib/repo.ts`: alle Schreibzugriffe. Komponenten schreiben nie direkt in Dexie.
- `src/lib/geo/keys.ts`: Adressnormalisierung, Cache-Schlüssel, Luftlinie. `src/lib/geo/services.svelte.ts`: Nominatim-Warteschlange (1/s), ORS-Matrix und -Routen.
- `src/components/`: ein Reiter je Datei plus `JobDialog`, `CompanyDialog`, `MapView`, `HomeBar`, `StarRating`.
- Svelte 5 mit Runes. An Dexie nur Snapshots übergeben (`$state.snapshot`), keine Proxys.
- MapLibre-Worker wird über `setWorkerUrl` mit einem `?url`-Import gesetzt, sonst findet Vite ihn nicht.

## Zugang und Veröffentlichung

- Code öffentlich auf GitHub, ausgeliefert über GitHub Pages. Der Nutzer legt das Repo an und gibt den Link.
- Im Repo nur Beispieldaten, nie echte Bewerbungsdaten oder API-Schlüssel.
- **Gastmodus:** ohne Anmeldung nutzbar, alle Daten nur im Browser des Gastes, mit dauerhaft sichtbarem Hinweis. Beispieldaten optional ladbar. Ohne ORS-Schlüssel: Karte und Luftlinie; Fahrzeiten erst mit eigenem Schlüssel.
- **Anmeldung (später, Dexie Cloud, kostenloser Plan mit 3 Produktivnutzern):**
  - Jeder Nutzer hat eigene Stellen, Notizen, Dokumente, Heimadressen und Einstellungen.
  - Das **Unternehmensverzeichnis (Unternehmen + Standorte) wird zwischen den Nutzern geteilt**.
  - Fremdregistrierungen müssen verhindert werden (Umsetzung in Dexie Cloud prüfen).
- Jeder Nutzer und jeder Gast trägt seinen eigenen ORS-Schlüssel ein. Der Schlüssel bleibt lokal auf dem Gerät und wird nicht synchronisiert.

## Datenmodell (drei getrennte Bereiche)

1. **Unternehmensverzeichnis (geteilt):** `companies` (Name, Branche, Bewertung, Website, Notizen) und `locations` (Standorte eines Unternehmens, strukturierte Adresse: Straße, PLZ, Ort, Bundesland, Land). Ein Unternehmen hat 1–n Standorte.
2. **Stellenverzeichnis (pro Nutzer):** `jobs` mit Titel, Stellenlink, Arbeitsmodell, Status (Pipeline), **Relevanz**, Fristen/Wiedervorlage und Notizen.
   - Verknüpfung zu Unternehmen (`companyId`) und Standort (`locationId`) optional.
   - Remote-Stellen brauchen keinen Standort.
   - `documents`: Dateien zu einer Stelle (z. B. Ausschreibung als PDF), als Blob gespeichert.
3. **Geodaten und Routen (abgeleitet, getrennt):** Werden nur berechnet, wenn sie fehlen.
   - `geocodes`: Schlüssel = normalisierte Adresse, Wert = Koordinaten. Manuell korrigierte Marker werden markiert und nie automatisch überschrieben.
   - `travel`: Schlüssel = Start-Koordinaten + Ziel-Koordinaten (gerundet) + Profil, Wert = Fahrzeit/Distanz. Gilt für **jede Kombination aus Heimadresse und Standort**. Beim Wechsel der Heimadresse werden vorhandene Werte wiederverwendet, eine Matrix-Anfrage enthält nur fehlende Kombinationen.
   - `routes`: Routengeometrie mit demselben Schlüssel wie `travel`, nur auf Klick berechnet.
   - Neu berechnet wird nur bei neuem Schlüssel (geänderte Adresse) oder auf ausdrücklichen Wunsch.
- Eigene Tabelle `homes` (pro Nutzer): mehrere gespeicherte Heimadressen mit Namen, eine davon aktiv.
- Bewertung und Branche gehören zum Unternehmen; Arbeitsmodell, Status und Relevanz gehören zur Stelle.
- Dublettenhinweis: normalisierter Firmenname plus Adresse.
- Synchronisationsfähig von Anfang an: UUIDs als IDs, `updatedAt` pro Datensatz, Datenzugriff gekapselt in `repo.ts`. Gelöscht wird hart, weil Dexie Cloud Löschungen selbst synchronisiert.

## Oberfläche (Reiter)

1. **Übersicht (Hauptreiter)**
   - Oben: Auswahl/Eingabe der Heimadresse (mehrere speicherbar) und daneben ein Eingabefeld für den Suchradius (Luftlinie, km).
   - Karte und kompakte Stellentabelle mit nur Titel, Pipeline-Status und Frist; Filter direkt in der Tabelle.
   - Klick auf eine Stelle: Standort wird auf der Karte hervorgehoben.
   - „Details“: vollständige Stelleninformationen, Notizfeld und Dokumentenablage.
2. **Stellen:** vollständige Tabelle mit allen Feldern.
3. **Unternehmen:** vollständige Tabelle mit Unternehmen und Standorten.
4. **Einstellungen:** ORS-Schlüssel, Profilinformationen, Heimadressen verwalten, Backup.

## Technische Richtung

- Installierbare **PWA**: Vite + TypeScript + **Svelte**. Daten vorerst im Browser in IndexedDB über **Dexie**; später **Dexie Cloud**.
- **Karte:** MapLibre GL mit OpenFreeMap-Kacheln (ohne Schlüssel). Später optional Protomaps/PMTiles für den Offline-Betrieb.
- **Geocoding:** Nominatim. Maximal 1 Anfrage pro Sekunde, Ergebnisse immer zwischenspeichern.
- **Fahrzeiten/Routen:** OpenRouteService (Matrix für Fahrzeiten, Directions für die gezeichnete Route).
- **Ausgeschlossen:** direkte Nutzung von tile.openstreetmap.org und chinesische Kartendienste.
- `navigator.storage.persist()` anfordern; JSON-Backup und CSV-Import/-Export.

## Offene Punkte

1. Anmeldung und Synchronisation mit Dexie Cloud: geteilter Bereich für das Unternehmensverzeichnis, private Bereiche für Stellen. Fremdregistrierungen verhindern.
2. Dokumente in Dexie Cloud zählen gegen 100 MB im kostenlosen Plan; ggf. nur lokal speichern oder Größe begrenzen.
3. CSV-Import/-Export für Unternehmen und Stellen.
4. Automatisches Datei-Backup über die File System Access API (bisher nur manueller JSON-Download).
5. Fahrzeitfilter alternativ über Isochronen, falls die Matrix-Kontingente nicht reichen.
