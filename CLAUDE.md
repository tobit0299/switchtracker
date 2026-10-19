# Bewerbungstool

Privates Tool zur Verwaltung von Bewerbungen mit gekoppelter Tabelle und Karte. Windows zuerst, als PWA aber auch mobil nutzbar. Sprache der Oberfläche und der Doku: Deutsch.

## Stand

- Repo: https://github.com/tobit0299/switchtracker (öffentlich), Deployment per GitHub Actions auf GitHub Pages: https://tobit0299.github.io/switchtracker/
- Erste Version der App ist gebaut (Gastmodus, alle vier Reiter, JSON-Backup). Details siehe „Funktionierende Features“, „Unvollständige Features“ und „Zukünftige Features“.
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
- `src/components/`: ein Reiter je Datei plus `JobDialog`, `CompanyDialog`, `MapView`, `HomeBar`, `StarRating`, `ColumnPicker`, `JobCell`.
- `src/lib/columns.ts`: gemeinsame Spaltendefinitionen und Sortierung beider Stellentabellen; `JobCell` rendert eine Zelle.
- Design nach IBM Carbon (Themes g10/g100) als eigene CSS-Tokens in `src/app.css`, Schrift IBM Plex Sans (`@fontsource`), Icons aus `carbon-icons-svelte` (Import je Icon aus `carbon-icons-svelte/lib/…`). Die Carbon-Komponentenbibliothek wird bewusst nicht genutzt.
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
   - Linke Spalte, von oben: Heimadresse (Auswahl + „Adresse“), Kopfzeile „Stellen“ mit Knöpfen „Alle Filter zurücksetzen“ und „Spalten auswählen“, Radius (km Luftlinie), Tabellenfilter (Suche, Status, Frist), kompakte Tabelle.
   - Rechte Spalte: Karte über die volle Höhe. Die Trennkante zwischen Tabelle und Karte ist ziehbar (Breite in localStorage).
   - Spalten der kompakten Tabelle per Popup wählbar und per Ziehen sortierbar (Standard: Titel, Status, Frist), gespeichert als Einstellung `overviewColumns`.
   - Jede Zeile hat eine laufende Nummer (Spalte „#“, 1–n in aktueller Filterung und Sortierung); dieselbe Nummer steht im Marker auf der Karte. Mehrere Stellen am selben Standort: bis zu drei Nummern, sonst z. B. „2, 5 +3“. Stellen ohne Kartenposition haben eine umrandete Nummer.
   - Klick auf eine Stelle: Standort wird auf der Karte hervorgehoben. Kein „Neue Stelle“-Knopf hier (nur im Reiter „Stellen“).
   - Die Karte passt sich an neu hinzukommende Punkte an, bis der Nutzer sie selbst verschiebt oder zoomt.
   - „Details“ (Augen-Symbol): vollständige Stelleninformationen, Notizfeld und Dokumentenablage.
2. **Stellen:** vollständige Tabelle mit allen Feldern („Relevanz Stelle“, „Bewertung Unternehmen“), Filter, „Neue Stelle“.
3. **Unternehmen:** vollständige Tabelle mit Unternehmen und Standorten.
4. **Einstellungen:** kein Reiter, sondern Zahnrad oben rechts. ORS-Schlüssel, Profil, Heimadressen, Karte („Position korrigieren“ an/aus, Standard aus), Backup.

## Technische Richtung

- Installierbare **PWA**: Vite + TypeScript + **Svelte**. Daten vorerst im Browser in IndexedDB über **Dexie**; später **Dexie Cloud**.
- **Karte:** MapLibre GL mit OpenFreeMap-Kacheln (ohne Schlüssel). Später optional Protomaps/PMTiles für den Offline-Betrieb.
- **Geocoding:** Nominatim. Maximal 1 Anfrage pro Sekunde, Ergebnisse immer zwischenspeichern.
- **Fahrzeiten/Routen:** OpenRouteService (Matrix für Fahrzeiten, Directions für die gezeichnete Route).
- **Ausgeschlossen:** direkte Nutzung von tile.openstreetmap.org und chinesische Kartendienste.
- `navigator.storage.persist()` anfordern; JSON-Backup und CSV-Import/-Export.

## Funktionierende Features

Im Browser getestet am 19.10.2026 (Entwicklungsserver und Produktionsbuild); Überarbeitung (Carbon-Design, Spaltenauswahl, Zahnrad) im Entwicklungsserver geprüft:

- Gastmodus mit dauerhaftem Hinweis; Daten in IndexedDB, dauerhafter Speicher wird angefordert.
- Beispieldaten laden.
- Adresssuche über Nominatim mit Cache und Drosselung (1/s); strukturierte Suche für Standorte in DE/NL/AT; Bundesland wird übernommen, auch bei Stadtstaaten (Berlin, Hamburg, Bremen, Wien).
- Übersicht: Heimadresse wählen und weitere anlegen, Radiusfilter mit Kreis auf der Karte, kompakte Tabelle mit Filtern und Sortierung, „Alle Filter zurücksetzen“, Spaltenauswahl mit Umsortieren (Ziehen und Alt + Pfeiltasten), ziehbare Kartenkante, nummerierte Marker passend zu den Tabellenzeilen, Auswahl einer Stelle hebt den Marker hervor, Infokasten mit Luftlinie.
- Einstellungen über das Zahnrad oben rechts; „Position korrigieren“ standardmäßig ausgeblendet, in den Einstellungen einschaltbar.
- Carbon-Design in hell und dunkel (folgt der Systemeinstellung).
- Fristen-Hervorhebung (überfällig rot, innerhalb von 7 Tagen orange).
- Stellendetails öffnen, bearbeiten und speichern, inklusive Notizen und Relevanz.
- Reiter „Stellen“: vollständige Tabelle mit allen Filtern und Sortierung.
- Reiter „Unternehmen“: Tabelle mit Suche und Sortierung.
- Produktionsbuild unter `/switchtracker/` mit Karte, MapLibre-Worker und Service Worker (offline-fähig).
- Fahrzeit-Matrix und Route über OpenRouteService wurden im Machbarkeitstest (`spike/`) mit echtem Schlüssel bestätigt.

## Unvollständige Features

Umgesetzt, aber noch nicht getestet oder nur teilweise fertig:

- **Fahrzeiten, Fahrzeitfilter und Routen in der App:** implementiert, aber noch nicht mit echtem ORS-Schlüssel in der App geprüft.
- **Dokumentenablage:** Upload, Öffnen, Herunterladen und Löschen implementiert, aber nicht getestet (das Browser-Pane kann keine Dateien auswählen).
- **Position korrigieren** (Marker ziehen): implementiert, standardmäßig aus, das Verschieben selbst ist nicht getestet.
- **Unternehmensdialog:** Anlegen, Bearbeiten, Standorte, Dublettenhinweise und „Erneut suchen“ implementiert, nicht durchgeklickt.
- **Backup:** JSON-Export und -Wiederherstellung, „Alle Daten löschen“ und „Geodaten-Cache leeren“ implementiert, nicht getestet. Backups sind nur manuell möglich.
- **Profil:** Name und E-Mail werden gespeichert, haben aber bis zur Anmeldung keine Funktion.
- **Deployment:** Workflow ist vorhanden; GitHub Pages muss im Repo auf „GitHub Actions“ gestellt werden, der erste Lauf wurde noch nicht geprüft.
- **Mobile Ansicht:** Layout bricht unter 800 px um, ist aber nicht gezielt auf Smartphones getestet.

## Zukünftige Features

Nur auf ausdrücklichen Auftrag des Nutzers umsetzen, keine eigenständigen Umsetzungsversuche.

- **PDF-Komprimierung und OCR beim Upload** von Dokumenten.
- Anmeldung und Synchronisation mit Dexie Cloud: geteilter Bereich für das Unternehmensverzeichnis, private Bereiche für Stellen, Fremdregistrierungen verhindern. Dokumente zählen gegen 100 MB im kostenlosen Plan; ggf. nur lokal speichern oder Größe begrenzen.
- CSV-Import/-Export für Unternehmen und Stellen.
- Automatisches Datei-Backup über die File System Access API.
- Optional: Fahrzeitfilter über Isochronen, falls die Matrix-Kontingente nicht reichen.
- Optional: Offline-Karte über Protomaps/PMTiles.
