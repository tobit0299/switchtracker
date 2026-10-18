<script lang="ts" module>
  export interface MapPoint {
    id: string;
    coord: { lat: number; lon: number };
    title: string;
    subtitle: string;
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
  let fittedOnce = false;
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
    m.on('load', () => {
      m.addSource('radius', { type: 'geojson', data: empty });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.07 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#2563eb', 'line-width': 1.5, 'line-dasharray': [3, 2] } });
      m.addSource('route', { type: 'geojson', data: empty });
      m.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': '#f59e0b', 'line-width': 5, 'line-opacity': 0.85 },
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
        const el = markerEl('', p.title);
        el.addEventListener('click', e => { e.stopPropagation(); onselect(p.id); });
        mk = new maplibregl.Marker({ element: el });
        mk.on('dragend', () => { const ll = mk!.getLngLat(); onmoved?.(p.id, { lat: ll.lat, lon: ll.lng }); });
        markers.set(p.id, mk);
        mk.setLngLat([p.coord.lon, p.coord.lat]).addTo(m);
      } else {
        mk.setLngLat([p.coord.lon, p.coord.lat]);
      }
      mk.getElement().title = `${p.title}\n${p.subtitle}`;
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
  $effect(() => {
    if (!map || !selectedId || route) return;
    const p = points.find(x => x.id === selectedId);
    if (p) map.easeTo({ center: [p.coord.lon, p.coord.lat], zoom: Math.max(map.getZoom(), 9) });
  });

  // Beim ersten Mal alles einpassen, sobald Punkte da sind
  $effect(() => {
    if (!map || fittedOnce || (!points.length && !home)) return;
    const b = new maplibregl.LngLatBounds();
    points.forEach(p => b.extend([p.coord.lon, p.coord.lat]));
    if (home) b.extend([home.lon, home.lat]);
    map.fitBounds(b, { padding: 50, maxZoom: 11, duration: 0 });
    fittedOnce = true;
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
    width: 14px; height: 14px; border-radius: 50%; background: #2563eb;
    border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35); cursor: pointer;
  }
  :global(.mk.home) { background: #16a34a; width: 18px; height: 18px; border-radius: 4px; cursor: default; }
  :global(.mk.selected) { background: #f59e0b; width: 22px; height: 22px; }
  :global(.mk.dragging) { outline: 3px dashed #f59e0b; outline-offset: 3px; cursor: grab; }
</style>
