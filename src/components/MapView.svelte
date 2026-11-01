<script lang="ts" module>
  export interface MapPoint {
    id: string;
    coord: { lat: number; lon: number };
    title: string;
    subtitle: string;
    /** Zeilennummer(n) aus der gefilterten Tabelle, im Marker angezeigt */
    label: string;
  }

  export interface HomeMarker {
    id: string;
    coord: { lat: number; lon: number };
    name: string;
    /** aktive Heimadresse (grün); andere grau */
    active: boolean;
  }

  /** Farbe der Standort-Marker: Stellenkarte blau, Unternehmenskarte orange */
  export type MapVariant = 'job' | 'company';
</script>

<script lang="ts">
  import * as maplibregl from 'maplibre-gl';
  // Der Worker wird sonst relativ zum gebündelten Modul gesucht und nicht gefunden
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import type { Feature, LineString, Polygon } from 'geojson';
  import { onMount, untrack } from 'svelte';
  import { circlePolygon } from '../lib/geo/keys';
  import type { Coord } from '../lib/types';

  let {
    points,
    variant = 'job',
    home,
    homes = [],
    radiusKm,
    selectedId,
    route,
    draggableId = null,
    onselect,
    onmoved,
    onhomeclick,
  }: {
    points: MapPoint[];
    variant?: MapVariant;
    /** aktive Heimadresse: Mittelpunkt für Radius-Kreis */
    home: Coord | null;
    /** anzuzeigende Heimadressen als Haus-Symbole */
    homes?: HomeMarker[];
    radiusKm: number | null;
    selectedId: string | null;
    route: LineString | null;
    draggableId?: string | null;
    onselect: (id: string) => void;
    onmoved?: (id: string, coord: Coord) => void;
    onhomeclick?: (id: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let map = $state<maplibregl.Map | null>(null);
  let ready = $state(false);
  const markers = new Map<string, maplibregl.Marker>();
  const homeMarkers = new Map<string, maplibregl.Marker>();
  /** Solange der Nutzer die Karte nicht selbst bewegt hat, wird bei neuen Punkten neu eingepasst */
  let userMoved = false;
  let lastFitCount = -1;
  let lastSelectedId: string | null = null;
  let lastRadiusSig = '';

  maplibregl.setWorkerUrl(workerUrl);

  const empty = { type: 'FeatureCollection' as const, features: [] };

  onMount(() => {
    const m = new maplibregl.Map({
      container,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [10.4, 51.1],
      zoom: 5.2,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    // nur echte Nutzeraktionen haben ein originalEvent, programmatische Bewegungen nicht
    m.on('movestart', e => { if ((e as { originalEvent?: Event }).originalEvent) userMoved = true; });
    m.on('load', () => {
      m.addSource('radius', { type: 'geojson', data: empty });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0f62fe', 'fill-opacity': 0.07 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#0f62fe', 'line-width': 1.5, 'line-dasharray': [3, 2] } });
      m.addSource('route', { type: 'geojson', data: empty });
      m.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': '#8a3ffc', 'line-width': 5, 'line-opacity': 0.85 },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      });
      ready = true;
    });
    // Container-Größe kann sich nach dem Start ändern (Reiterwechsel, Fenstergröße)
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(container);
    map = m;
    return () => { ro.disconnect(); m.remove(); };
  });

  function markerEl(cls: string, title: string) {
    const el = document.createElement('div');
    el.className = 'mk ' + cls;
    el.title = title;
    return el;
  }

  // Standort-Marker abgleichen
  $effect(() => {
    if (!map) return;
    const m = map;
    const wanted = new Set(points.map(p => p.id));
    for (const [id, mk] of markers) if (!wanted.has(id)) { mk.remove(); markers.delete(id); }
    for (const p of points) {
      let mk = markers.get(p.id);
      if (!mk) {
        const el = markerEl(`num ${variant}`, p.title);
        el.addEventListener('click', e => { e.stopPropagation(); onselect(p.id); });
        mk = new maplibregl.Marker({ element: el });
        mk.on('dragend', () => { const ll = mk!.getLngLat(); onmoved?.(p.id, { lat: ll.lat, lon: ll.lng }); });
        markers.set(p.id, mk);
        mk.setLngLat([p.coord.lon, p.coord.lat]).addTo(m);
      } else {
        mk.setLngLat([p.coord.lon, p.coord.lat]);
      }
      mk.getElement().title = `${p.title}\n${p.subtitle}`;
      mk.getElement().textContent = p.label;
      mk.getElement().classList.toggle('selected', p.id === selectedId);
      mk.getElement().style.zIndex = p.id === selectedId ? '2' : '1';
      mk.setDraggable(p.id === draggableId);
      mk.getElement().classList.toggle('dragging', p.id === draggableId);
    }
  });

  // Haus-Symbol (Carbon „Home“, 32er Raster)
  const HOUSE_SVG = '<svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M16.61,2.21a1,1,0,0,0-1.24,0L1,13.42,2.24,15,4,13.62V26a2,2,0,0,0,2,2H26a2,2,0,0,0,2-2V13.63L29.76,15,31,13.43ZM18,26H14V18h4Zm2,0V18a2,2,0,0,0-2-2H14a2,2,0,0,0-2,2v8H6V12.06L16,4.27l10,7.8V26Z"/></svg>';

  // Heimadressen abgleichen: aktive grün, weitere grau (Klick macht sie aktiv)
  $effect(() => {
    if (!map) return;
    const m = map;
    const wanted = new Set(homes.map(h => h.id));
    for (const [id, mk] of homeMarkers) if (!wanted.has(id)) { mk.remove(); homeMarkers.delete(id); }
    for (const h of homes) {
      let mk = homeMarkers.get(h.id);
      if (!mk) {
        const el = markerEl('home', h.name);
        el.innerHTML = HOUSE_SVG;
        el.addEventListener('click', e => { e.stopPropagation(); onhomeclick?.(h.id); });
        mk = new maplibregl.Marker({ element: el }).setLngLat([h.coord.lon, h.coord.lat]).addTo(m);
        homeMarkers.set(h.id, mk);
      } else {
        mk.setLngLat([h.coord.lon, h.coord.lat]);
      }
      const el = mk.getElement();
      el.classList.toggle('active', h.active);
      el.title = h.active ? `${h.name} (aktive Heimadresse)` : `${h.name} – klicken, um sie als Heimadresse zu verwenden`;
      el.style.zIndex = h.active ? '3' : '0';
    }
  });

  // Radius-Kreis
  $effect(() => {
    if (!map || !ready) return;
    const src = map.getSource('radius') as maplibregl.GeoJSONSource;
    const data: Feature<Polygon> | typeof empty = home && radiusKm ? circlePolygon(home, radiusKm) : empty;
    src.setData(data);
    // Kreis vollständig ins Bild holen, wenn der Radius gesetzt oder geändert wird
    const sig = home && radiusKm ? `${home.lat},${home.lon},${radiusKm}` : '';
    if ('geometry' in data && sig !== lastRadiusSig) {
      const b = new maplibregl.LngLatBounds();
      data.geometry.coordinates[0].forEach(c => b.extend(c as [number, number]));
      untrack(() => map!.fitBounds(b, { padding: 30 }));
    }
    lastRadiusSig = sig;
  });

  // Route
  $effect(() => {
    if (!map || !ready) return;
    const src = map.getSource('route') as maplibregl.GeoJSONSource;
    src.setData(route ? { type: 'Feature', properties: {}, geometry: route } : empty);
    if (route) {
      const b = new maplibregl.LngLatBounds();
      route.coordinates.forEach(c => b.extend(c as [number, number]));
      map.fitBounds(b, { padding: 60, maxZoom: 13 });
    }
  });

  // Ausgewählten Standort ins Bild holen
  // nur beim Wechsel der Auswahl, nicht bei jeder Datenänderung
  $effect(() => {
    if (!map || route) return;
    if (selectedId === lastSelectedId) return;
    lastSelectedId = selectedId;
    const p = points.find(x => x.id === selectedId);
    if (p) { userMoved = true; map.easeTo({ center: [p.coord.lon, p.coord.lat], zoom: Math.max(map.getZoom(), 9) }); }
  });

  // Alles einpassen, sobald Punkte hinzukommen (z. B. während die Adresssuche läuft),
  // bis der Nutzer die Karte selbst verschiebt oder zoomt
  $effect(() => {
    const count = points.length + (home ? 1 : 0) + homes.length;
    if (!map || userMoved || !count || count === lastFitCount) return;
    const b = new maplibregl.LngLatBounds();
    points.forEach(p => b.extend([p.coord.lon, p.coord.lat]));
    if (home) b.extend([home.lon, home.lat]);
    homes.forEach(h => b.extend([h.coord.lon, h.coord.lat]));
    map.fitBounds(b, { padding: 50, maxZoom: 11, duration: lastFitCount < 0 ? 0 : 300 });
    lastFitCount = count;
  });

  export function fitAll() {
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    points.forEach(p => b.extend([p.coord.lon, p.coord.lat]));
    if (home) b.extend([home.lon, home.lat]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 50, maxZoom: 11 });
  }
</script>

<div class="map" bind:this={container}></div>

<style>
  .map { width: 100%; height: 100%; min-height: 300px; }
  :global(.mk) {
    width: 14px; height: 14px; border-radius: 50%; background: #0f62fe;
    border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35); cursor: pointer;
  }
  /* Heimadresse als Haus: aktiv grün, weitere grau */
  :global(.mk.home) {
    width: 26px; height: 26px; border-radius: 4px; background: #8d8d8d; color: #fff;
    display: flex; align-items: center; justify-content: center;
  }
  :global(.mk.home.active) { background: #24a148; width: 30px; height: 30px; cursor: default; }
  /* nummerierter Standort: Pille, wächst bei mehreren Nummern in die Breite */
  :global(.mk.num) {
    width: auto; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif; color: #fff; white-space: nowrap;
  }
  :global(.mk.num.job) { background: #0f62fe; }
  :global(.mk.num.company) { background: #ff832b; color: #161616; }
  /* Auswahl: größer und mit dunklem Ring, Farbe bleibt */
  :global(.mk.num.selected) {
    min-width: 30px; height: 30px; border-radius: 15px; font-size: 13px;
    box-shadow: 0 0 0 3px #161616, 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  :global(.mk.dragging) { outline: 3px dashed #161616; outline-offset: 3px; cursor: grab; }
</style>
