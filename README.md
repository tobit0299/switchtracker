# SwitchTracker

Verwaltung von Bewerbungen mit gekoppelter Stellentabelle und Karte: Unternehmen und Standorte erfassen, Stellen durch die Bewerbungspipeline führen, Fristen im Blick behalten und Entfernungen sowie Fahrzeiten ab einer oder mehreren Heimadressen sehen.

**Live:** https://tobit0299.github.io/switchtracker/

> **Gastmodus:** Alle Daten werden nur im Browser auf deinem Gerät gespeichert (IndexedDB). Es gibt keinen Server, der deine Daten sieht. Sichere sie regelmäßig über *Einstellungen → Backup*. Eine Anmeldung mit Synchronisation ist geplant.

## Funktionen

- **Übersicht:** Heimadresse wählen (mehrere speicherbar), Suchradius in km Luftlinie, kompakte Stellentabelle (Titel, Status, Frist) mit Filtern und Karte. Ein Klick auf eine Stelle zeigt den Standort, auf Wunsch mit gezeichneter Route.
- **Stellendetails:** alle Angaben, Relevanz (1–5 Sterne), Frist und Wiedervorlage, Notizen und Dokumentenablage (z. B. die Ausschreibung als PDF).
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

## Entwicklung

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run check    # Typprüfung
npm run build    # Produktionsbuild in dist/
```

Technik: [Vite](https://vite.dev/), [Svelte 5](https://svelte.dev/), TypeScript, [Dexie](https://dexie.org/) (IndexedDB), [vite-plugin-pwa](https://vite-pwa-org.netlify.app/).

Jeder Push auf `main` wird über GitHub Actions gebaut und auf GitHub Pages veröffentlicht (`.github/workflows/deploy.yml`).

## Datenschutz

Das Repository enthält nur Code und erfundene Beispieldaten. Beim Verwenden der App gehen Adressen an Nominatim und, mit Schlüssel, Koordinaten an OpenRouteService, damit Positionen und Fahrzeiten berechnet werden können. Alles andere bleibt auf deinem Gerät.

## Lizenz

[MIT](LICENSE)
