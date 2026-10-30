# SwitchTracker

Verwaltung von Bewerbungen mit gekoppelter Stellentabelle und Karte: Unternehmen und Standorte erfassen, Stellen durch die Bewerbungspipeline führen, Fristen im Blick behalten und Entfernungen sowie Fahrzeiten ab einer oder mehreren Heimadressen sehen.

**Live:** https://tobit0299.github.io/switchtracker/

> **Gastmodus:** Ohne Anmeldung werden alle Daten nur im Browser auf deinem Gerät gespeichert (IndexedDB). Sichere sie regelmäßig über *Einstellungen → Backup*. Optional lässt sich eine Anmeldung mit Synchronisation über [Dexie Cloud](https://dexie.org/cloud/) einrichten (siehe unten).

## Funktionen

- **Übersicht:** Heimadresse wählen (mehrere speicherbar), Suchradius in km Luftlinie, kompakte Stellentabelle (Titel, Status, Frist) mit Filtern und Karte. Ein Klick auf eine Stelle zeigt den Standort, auf Wunsch mit gezeichneter Route.
- **Stellendetails:** alle Angaben, Relevanz (1–5 Sterne), Frist und Wiedervorlage, Notizen und Dokumentenablage (z. B. die Ausschreibung als PDF). Beim Hochladen werden Dokumente komprimiert und gescannte PDFs bzw. Fotos per Texterkennung (OCR, Deutsch/Englisch) durchsuchbar gemacht – alles lokal im Browser.
- **Stellen:** vollständige Tabelle mit Filtern nach Status, Arbeitsmodell, Branche, Bewertung, Relevanz, Bundesland, Land und Fahrzeit.
- **Unternehmen:** Unternehmensverzeichnis mit mehreren Standorten pro Unternehmen und Dublettenhinweisen.
- **Einstellungen:** OpenRouteService-Schlüssel, Profil, Heimadressen, JSON-Backup und Wiederherstellung, Beispieldaten.
- **Installierbar** als App (PWA) in Chrome und Edge, funktioniert auch offline (außer Karte, Adresssuche und Fahrzeiten).

## Kartendienste

| Zweck | Dienst | Schlüssel |
|---|---|---|
| Karte | [MapLibre GL](https://maplibre.org/) mit [OpenFreeMap](https://openfreemap.org/) (Daten © OpenStreetMap-Mitwirkende) | nicht nötig |
| Adresssuche | [Nominatim](https://nominatim.org/) (max. 1 Anfrage pro Sekunde, Ergebnisse werden gespeichert) | nicht nötig |
| Fahrzeiten und Routen | [OpenRouteService](https://openrouteservice.org/) | eigener, kostenloser Schlüssel |

Koordinaten, Fahrzeiten und Routen liegen in einer eigenen lokalen Datenbank und werden **nur berechnet, wenn sie fehlen**: Fahrzeiten werden je Kombination aus Heimadresse und Standort gespeichert, ein Wechsel der Heimadresse löst also keine erneute Berechnung bereits bekannter Werte aus.

Der OpenRouteService-Schlüssel wird nur im Browser gespeichert und ist weder im Code noch im Backup enthalten.

## Synchronisation einrichten (optional)

Ohne diese Schritte läuft die App ausschließlich im Gastmodus.

1. Datenbank anlegen (fragt nach deiner E-Mail und einem Bestätigungscode):
   ```bash
   npx dexie-cloud create
   ```
   Das legt `dexie-cloud.json` und `dexie-cloud.key` an. **Die `.key`-Datei enthält Zugangsdaten und darf nie eingecheckt werden** (beide stehen in `.gitignore`).
2. Die Ursprünge freigeben, von denen aus die App laufen darf:
   ```bash
   npx dexie-cloud whitelist https://tobit0299.github.io
   npx dexie-cloud whitelist http://localhost:5173
   ```
3. Die Datenbank-URL (aus `dexie-cloud.json`, Form `https://….dexie.cloud`) eintragen:
   - für GitHub Pages als Repository-Variable `DEXIE_CLOUD_URL` (*Settings → Secrets and variables → Actions → Variables*), danach neu deployen;
   - lokal in `.env.local`: `VITE_DEXIE_CLOUD_URL=https://….dexie.cloud`.
4. In der App unter *Einstellungen → Konto und Synchronisation* anmelden, das gemeinsame Unternehmensverzeichnis anlegen und die zweite Person per E-Mail einladen.

Stellen, Notizen, Dokumente und Heimadressen bleiben privat; nur Unternehmen und Standorte werden geteilt. Beim ersten Anmelden werden die Daten aus dem Gastmodus ins Konto übernommen. Abmelden löscht die Daten auf dem Gerät (sie bleiben im Konto).

## Entwicklung

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run check    # Typprüfung
npm run build    # Produktionsbuild in dist/
```

Technik: [Vite](https://vite.dev/), [Svelte 5](https://svelte.dev/), TypeScript, [Dexie](https://dexie.org/) und Dexie Cloud (IndexedDB, Synchronisation), [pdf.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org/), [Tesseract.js](https://tesseract.projectnaptha.com/) (OCR), [vite-plugin-pwa](https://vite-pwa-org.netlify.app/), Design nach [IBM Carbon](https://carbondesignsystem.com/).

Jeder Push auf `main` wird über GitHub Actions gebaut und auf GitHub Pages veröffentlicht (`.github/workflows/deploy.yml`).

## Datenschutz

Das Repository enthält nur Code und erfundene Beispieldaten. Beim Verwenden der App gehen Adressen an Nominatim und, mit Schlüssel, Koordinaten an OpenRouteService, damit Positionen und Fahrzeiten berechnet werden können. Für die Texterkennung werden einmalig Sprachdaten von einem CDN geladen; die Dokumente selbst verlassen das Gerät dabei nicht. Mit Anmeldung werden deine Daten über Dexie Cloud synchronisiert; ohne Anmeldung bleibt alles auf deinem Gerät.

## Lizenz

[MIT](LICENSE)
