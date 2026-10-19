<script lang="ts" module>
  export interface MapPoint {
    id: string;
    coord: { lat: number; lon: number };
    title: string;
    subtitle: string;
    /** Zeilennummer(n) aus der gefilterten Tabelle, im Marker angezeigt */
    label: string;
  }
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
    home,
    radiusKm,
    selectedId,
    route,
    draggableId = null,
    onselect,
    onmoved,
  }: {
    points: MapPoint[];
    home: Coord | null;
    radiusKm: number | null;
    selectedId: string | null;
    route: LineString | null;
    draggableId?: string | null;
    onselect: (id: string) => void;
    onmoved?: (id: string, coord: Coord) => void;
  } = $props();

  let container: HTMLDivElement;
  let map = $state<maplibregl.Map | null>(null);
  let ready = $state(false);
  const markers = new Map<string, maplibregl.Marker>();
  let homeMarker: maplibregl.Marker | null = null;
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
        paint: { 'line-color': '#ff832b', 'line-width': 5, 'line-opacity': 0.85 },
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
        const el = markerEl('num', p.title);
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

  // Heimadresse
  $effect(() => {
    if (!map) return;
    homeMarker?.remove();
    homeMarker = home ? new maplibregl.Marker({ element: markerEl('home', 'Heimadresse') }).setLngLat([home.lon, home.lat]).addTo(map) : null;
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
    const count = points.length + (home ? 1 : 0);
    if (!map || userMoved || !count || count === lastFitCount) return;
    const b = new maplibregl.LngLatBounds();
    points.forEach(p => b.extend([p.coord.lon, p.coord.lat]));
    if (home) b.extend([home.lon, home.lat]);
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
  :global(.mk.home) { background: #24a148; width: 18px; height: 18px; border-radius: 0; cursor: default; }
  /* nummerierter Standort: Pille, wächst bei mehreren Nummern in die Breite */
  :global(.mk.num) {
    width: auto; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif; color: #fff; white-space: nowrap;
  }
  :global(.mk.num.selected) { background: #ff832b; min-width: 28px; height: 28px; border-radius: 14px; font-size: 13px; color: #161616; }
  :global(.mk.dragging) { outline: 3px dashed #ff832b; outline-offset: 3px; cursor: grab; }
</style>
