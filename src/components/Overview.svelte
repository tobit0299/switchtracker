<script lang="ts">
  import type { LineString } from 'geojson';
  import { fmtDate, fmtDuration, fmtKm, deadlineClass, daysUntil } from '../lib/format';
  import { locationAddress, locationGeoRequest } from '../lib/geo/keys';
  import { getRoute, setManualPosition } from '../lib/geo/services.svelte';
  import { emptyJob } from '../lib/repo';
  import { prefs, store, type JobRow } from '../lib/store.svelte';
  import { STATUSES, statusLabel, type Coord } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import HomeBar from './HomeBar.svelte';
  import MapView, { type MapPoint } from './MapView.svelte';

  // ---------- Filter und Sortierung der kompakten Tabelle ----------
  let q = $state('');
  let statusFilter = $state<'open' | 'all' | string>('open');
  let deadlineFilter = $state<'all' | 'overdue' | 'week' | 'set'>('all');
  let sortKey = $state<'title' | 'status' | 'deadline'>('deadline');
  let sortAsc = $state(true);

  const statusOrder = new Map(STATUSES.map((s, i) => [s.value, i]));
  const closed = new Set(STATUSES.filter(s => s.closed).map(s => s.value));

  function inRadius(r: JobRow): boolean {
    const radius = store.radiusKm;
    if (!radius || !store.activeHomeCoord) return true;
    // Homeoffice-Stellen ohne Standort sind ortsunabhängig und bleiben sichtbar
    if (!r.location) return r.job.workModel === 'homeoffice';
    return r.airKm != null && r.airKm <= radius;
  }

  function matches(r: JobRow): boolean {
    const text = q.trim().toLowerCase();
    if (text && !`${r.job.title} ${r.company?.name ?? ''}`.toLowerCase().includes(text)) return false;
    if (statusFilter === 'open' && closed.has(r.job.status)) return false;
    if (statusFilter !== 'open' && statusFilter !== 'all' && r.job.status !== statusFilter) return false;
    const d = daysUntil(r.job.deadline);
    if (deadlineFilter === 'set' && d == null) return false;
    if (deadlineFilter === 'overdue' && (d == null || d >= 0)) return false;
    if (deadlineFilter === 'week' && (d == null || d < 0 || d > 7)) return false;
    return true;
  }

  const visible = $derived.by(() => {
    const rows = store.rows.filter(r => inRadius(r) && matches(r));
    const dir = sortAsc ? 1 : -1;
    return rows.sort((a, b) => {
      if (sortKey === 'title') return dir * a.job.title.localeCompare(b.job.title, 'de');
      if (sortKey === 'status') return dir * ((statusOrder.get(a.job.status) ?? 0) - (statusOrder.get(b.job.status) ?? 0));
      // Fristen: ohne Datum immer ans Ende
      if (!a.job.deadline) return b.job.deadline ? 1 : 0;
      if (!b.job.deadline) return -1;
      return dir * a.job.deadline.localeCompare(b.job.deadline);
    });
  });

  function sortBy(k: typeof sortKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = true; }
  }
  const arrow = (k: typeof sortKey) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');

  // ---------- Karte ----------
  const points = $derived.by(() => {
    const byLoc = new Map<string, MapPoint>();
    for (const r of visible) {
      if (!r.location || !r.coord) continue;
      const p = byLoc.get(r.location.id);
      if (p) p.subtitle += `\n${r.job.title}`;
      else byLoc.set(r.location.id, { id: r.location.id, coord: r.coord, title: r.company?.name ?? r.location.city, subtitle: r.job.title });
    }
    return [...byLoc.values()];
  });

  // nur sichtbare Stellen können ausgewählt sein (Filter/Radius können sie ausblenden)
  const selected = $derived(visible.find(r => r.job.id === ui.selectedJobId) ?? null);
  let route = $state<LineString | null>(null);
  let routeInfo = $state('');
  let routeError = $state('');
  let correcting = $state(false);

  function select(jobId: string) {
    if (ui.selectedJobId !== jobId) { route = null; routeInfo = ''; routeError = ''; correcting = false; }
    ui.selectedJobId = jobId;
  }

  function selectLocation(locationId: string) {
    // bei mehreren Stellen am Standort die nächste in der Liste wählen
    const here = visible.filter(r => r.location?.id === locationId);
    if (!here.length) return;
    const i = here.findIndex(r => r.job.id === ui.selectedJobId);
    select(here[(i + 1) % here.length].job.id);
  }

  async function showRoute() {
    if (!selected?.coord || !store.activeHomeCoord) return;
    routeError = '';
    try {
      const r = await getRoute(store.activeHomeCoord, selected.coord);
      route = r.geometry;
      routeInfo = `${fmtDuration(r.durationS)} · ${fmtKm(r.distanceKm)}`;
    } catch (e) {
      routeError = 'Route nicht verfügbar: ' + (e as Error).message;
    }
  }

  async function moved(locationId: string, coord: Coord) {
    const loc = store.locationById.get(locationId);
    if (loc) await setManualPosition(locationGeoRequest(loc), coord);
    correcting = false;
    route = null;
  }

  function openDetails(r: JobRow) {
    ui.jobDialog = { job: $state.snapshot(r.job), isNew: false };
  }
</script>

<div class="overview">
  <div class="top"><HomeBar /></div>

  <section class="list">
    <div class="list-head row">
      <h2 class="grow">Stellen <span class="muted small">{visible.length} von {store.jobs.length}</span></h2>
      <button onclick={() => (ui.jobDialog = { job: emptyJob(), isNew: true })}>+ Neue Stelle</button>
    </div>
    <div class="filters">
      <input type="search" placeholder="Titel oder Unternehmen" bind:value={q} />
      <select bind:value={statusFilter} aria-label="Status-Filter">
        <option value="open">Offene</option>
        <option value="all">Alle Status</option>
        {#each STATUSES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
      </select>
      <select bind:value={deadlineFilter} aria-label="Fristen-Filter">
        <option value="all">Alle Fristen</option>
        <option value="overdue">Überfällig</option>
        <option value="week">Nächste 7 Tage</option>
        <option value="set">Mit Frist</option>
      </select>
    </div>

    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th class="sortable" onclick={() => sortBy('title')}>Titel{arrow('title')}</th>
            <th class="sortable" onclick={() => sortBy('status')}>Status{arrow('status')}</th>
            <th class="sortable num" onclick={() => sortBy('deadline')}>Frist{arrow('deadline')}</th>
            <th><span class="sr">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {#each visible as r (r.job.id)}
            <tr class:selected={r.job.id === ui.selectedJobId} onclick={() => select(r.job.id)} ondblclick={() => openDetails(r)}>
              <td>
                <div class="title">{r.job.title || '(ohne Titel)'}</div>
                <div class="muted small">
                  {r.company?.name ?? 'Kein Unternehmen'}{#if r.location} · {r.location.city}{:else if r.job.workModel === 'homeoffice'} · Homeoffice{/if}
                </div>
              </td>
              <td><span class="badge s-{r.job.status}">{statusLabel(r.job.status)}</span></td>
              <td class="num {deadlineClass(r.job.deadline)}">{fmtDate(r.job.deadline)}</td>
              <td><button class="link small" onclick={e => { e.stopPropagation(); openDetails(r); }}>Details</button></td>
            </tr>
          {:else}
            <tr><td colspan="4" class="muted empty">
              {store.jobs.length ? 'Keine Stelle passt zu den Filtern.' : 'Noch keine Stellen. Lege eine neue an oder lade unter Einstellungen die Beispieldaten.'}
            </td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="mapcol">
    <MapView
      {points}
      home={store.activeHomeCoord}
      radiusKm={store.radiusKm}
      selectedId={selected?.location?.id ?? null}
      {route}
      draggableId={correcting ? (selected?.location?.id ?? null) : null}
      onselect={selectLocation}
      onmoved={moved}
    />

    {#if selected}
      <div class="info card">
        <div class="row">
          <strong class="grow">{selected.job.title || '(ohne Titel)'}</strong>
          <button class="link" aria-label="Auswahl aufheben" onclick={() => { ui.selectedJobId = null; route = null; }}>✕</button>
        </div>
        <div class="muted small">{selected.company?.name ?? 'Kein Unternehmen'}</div>
        {#if selected.location}
          <div class="small">{locationAddress(selected.location)}</div>
          {#if !selected.coord}
            <div class="small err">Adresse noch nicht gefunden oder nicht auffindbar.</div>
          {:else}
            <div class="small facts">
              <span>Luftlinie: {fmtKm(selected.airKm)}</span>
              <span>Fahrzeit: {selected.travel ? (selected.travel.reachable ? `${fmtDuration(selected.travel.durationS)} (${fmtKm(selected.travel.distanceKm)})` : 'keine Route') : prefs.orsKey ? '…' : 'Schlüssel fehlt'}</span>
            </div>
          {/if}
        {:else}
          <div class="small muted">Kein Standort hinterlegt.</div>
        {/if}
        {#if routeInfo && route}<div class="small ok">Route: {routeInfo}</div>{/if}
        {#if routeError}<div class="small err">{routeError}</div>{/if}
        {#if correcting}<div class="small">Marker auf die richtige Position ziehen.</div>{/if}
        <div class="row actions">
          {#if selected.coord && store.activeHomeCoord}
            {#if route}
              <button class="secondary" onclick={() => (route = null)}>Route ausblenden</button>
            {:else}
              <button class="secondary" disabled={!prefs.orsKey} title={prefs.orsKey ? '' : 'OpenRouteService-Schlüssel unter Einstellungen eintragen'} onclick={showRoute}>Route anzeigen</button>
            {/if}
          {/if}
          {#if selected.coord}
            <button class="secondary" onclick={() => (correcting = !correcting)}>{correcting ? 'Korrektur abbrechen' : 'Position korrigieren'}</button>
          {/if}
          <button onclick={() => openDetails(selected)}>Details</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .overview {
    display: grid;
    grid-template-columns: minmax(380px, 32%) 1fr;
    grid-template-rows: auto 1fr;
    height: 100%;
  }
  .top { grid-column: 1 / -1; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
  .list { display: flex; flex-direction: column; min-height: 0; background: var(--panel); border-right: 1px solid var(--border); }
  .list-head { padding: 12px 16px 6px; }
  .filters { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; padding: 0 16px 10px; }
  .table-wrap { flex: 1; overflow: auto; }
  .title { font-weight: 600; }
  .empty { padding: 24px 16px; text-align: center; cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .mapcol { position: relative; min-height: 0; }
  .info {
    position: absolute; left: 12px; bottom: 28px; width: min(380px, calc(100% - 24px));
    display: flex; flex-direction: column; gap: 4px; padding: 12px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  }
  .facts { display: flex; gap: 12px; flex-wrap: wrap; }
  .actions { margin-top: 6px; }
  @media (max-width: 800px) {
    .overview { grid-template-columns: 1fr; grid-template-rows: auto auto 60vh; height: auto; }
    .list { border-right: 0; }
    .table-wrap { max-height: 50vh; }
    .filters { grid-template-columns: 1fr 1fr; }
    .filters input { grid-column: 1 / -1; }
  }
</style>
