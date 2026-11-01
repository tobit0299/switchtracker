<script lang="ts">
  import Close from 'carbon-icons-svelte/lib/Close.svelte';
  import Column from 'carbon-icons-svelte/lib/Column.svelte';
  import FilterRemove from 'carbon-icons-svelte/lib/FilterRemove.svelte';
  import View from 'carbon-icons-svelte/lib/View.svelte';
  import type { LineString } from 'geojson';
  import { COLUMNS, DEFAULT_OVERVIEW_COLUMNS, columnByKey, compareRows, type ColumnKey } from '../lib/columns';
  import { daysUntil, fmtDuration, fmtKm } from '../lib/format';
  import { locationAddress, locationGeoRequest } from '../lib/geo/keys';
  import { getRoute, setManualPosition } from '../lib/geo/services.svelte';
  import { setSetting } from '../lib/repo';
  import { prefs, store, type JobRow } from '../lib/store.svelte';
  import { STATUSES, type Coord } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import HomeBar from './HomeBar.svelte';
  import JobCell from './JobCell.svelte';
  import MapLayout from './MapLayout.svelte';
  import MapView, { type MapPoint } from './MapView.svelte';
  import RadiusField from './RadiusField.svelte';

  // ---------- Filter und Sortierung der kompakten Tabelle ----------
  let q = $state('');
  let statusFilter = $state<'all' | 'open' | string>('all');
  let deadlineFilter = $state<'all' | 'overdue' | 'week' | 'set'>('all');
  let sortKey = $state<ColumnKey>('deadline');
  let sortAsc = $state(true);
  let pickingColumns = $state(false);

  const closed = new Set(STATUSES.filter(s => s.closed).map(s => s.value));
  const columns = $derived(store.overviewColumns.map(k => columnByKey.get(k)!));
  const filtersActive = $derived(!!q.trim() || statusFilter !== 'all' || deadlineFilter !== 'all' || store.radiusKm != null);

  function resetFilters() {
    q = ''; statusFilter = 'all'; deadlineFilter = 'all';
    if (store.radiusKm != null) void setSetting('radiusKm', null);
  }

  function inRadius(r: JobRow): boolean {
    const radius = store.radiusKm;
    if (!radius || !store.activeHomeCoord) return true;
    // Homeoffice-Stellen ohne Standort sind ortsunabhängig und bleiben sichtbar
    if (!r.location) return r.job.workModel === 'homeoffice';
    return r.airKm != null && r.airKm <= radius;
  }

  function matches(r: JobRow): boolean {
    const text = q.trim().toLowerCase();
    if (text && !`${r.job.title} ${r.job.reference ?? ''} ${r.company?.name ?? ''} ${r.location?.city ?? ''}`.toLowerCase().includes(text)) return false;
    if (statusFilter === 'open' && closed.has(r.job.status)) return false;
    if (statusFilter !== 'open' && statusFilter !== 'all' && r.job.status !== statusFilter) return false;
    const d = daysUntil(r.job.deadline);
    if (deadlineFilter === 'set' && d == null) return false;
    if (deadlineFilter === 'overdue' && (d == null || d >= 0)) return false;
    if (deadlineFilter === 'week' && (d == null || d < 0 || d > 7)) return false;
    return true;
  }

  const visible = $derived(store.rows.filter(r => inRadius(r) && matches(r)).sort((a, b) => compareRows(a, b, sortKey, sortAsc)));

  function sortBy(k: ColumnKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = !columnByKey.get(k)?.descFirst; }
  }
  const ariaSort = (k: ColumnKey) => (sortKey === k ? (sortAsc ? 'ascending' : 'descending') : 'none');

  // ---------- Karte ----------
  /** laufende Nummer jeder sichtbaren Zeile (1–n in aktueller Filterung und Sortierung) */
  const rowNumber = $derived(new Map(visible.map((r, i) => [r.job.id, i + 1])));

  const points = $derived.by(() => {
    const byLoc = new Map<string, MapPoint & { nums: number[] }>();
    for (const r of visible) {
      if (!r.location || !r.coord) continue;
      const n = rowNumber.get(r.job.id)!;
      const p = byLoc.get(r.location.id);
      if (p) { p.subtitle += `\n${n}. ${r.job.title}`; p.nums.push(n); }
      else byLoc.set(r.location.id, { id: r.location.id, coord: r.coord, title: r.company?.name ?? r.location.city, subtitle: `${n}. ${r.job.title}`, label: '', nums: [n] });
    }
    // mehrere Stellen am selben Standort: bis zu drei Nummern, sonst „2, 5 +3“
    for (const p of byLoc.values()) p.label = p.nums.length <= 3 ? p.nums.join(', ') : `${p.nums.slice(0, 2).join(', ')} +${p.nums.length - 2}`;
    return [...byLoc.values()];
  });

  // nur sichtbare Stellen können ausgewählt sein (Filter/Radius können sie ausblenden)
  const selected = $derived(visible.find(r => r.job.id === ui.selectedJobId) ?? null);
  let route = $state<LineString | null>(null);
  let routeInfo = $state('');
  let routeError = $state('');
  let correcting = $state(false);

  // Abschalten in den Einstellungen beendet eine laufende Korrektur
  $effect(() => { if (!store.allowPositionCorrection) correcting = false; });

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

<MapLayout>
  {#snippet list()}
    <div class="controls">
      <HomeBar />

      <div class="head row">
        <h2 class="grow">Stellen <span class="muted small">{visible.length} von {store.jobs.length}</span></h2>
        <button class="ghost icon" title="Alle Filter zurücksetzen" aria-label="Alle Filter zurücksetzen" disabled={!filtersActive} onclick={resetFilters}>
          <FilterRemove size={20} />
        </button>
        <button class="ghost icon" title="Spalten auswählen und sortieren" aria-label="Spalten auswählen und sortieren" onclick={() => (pickingColumns = true)}>
          <Column size={20} />
        </button>
      </div>

      <RadiusField />

      <div class="filters">
        <input type="search" placeholder="Suche in Titel, Kennziffer, Unternehmen, Ort" bind:value={q} aria-label="Suche" />
        <select bind:value={statusFilter} aria-label="Status-Filter">
          <option value="all">Alle Status</option>
          <option value="open">Nur offene</option>
          {#each STATUSES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
        </select>
        <select bind:value={deadlineFilter} aria-label="Fristen-Filter">
          <option value="all">Alle Fristen</option>
          <option value="overdue">Überfällig</option>
          <option value="week">Nächste 7 Tage</option>
          <option value="set">Mit Frist</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th class="nr" title="Nummer des Markers auf der Karte">#</th>
            {#each columns as c (c.key)}
              <th class="sortable" class:num={c.num} aria-sort={ariaSort(c.key)} onclick={() => sortBy(c.key)}>
                {c.label}{sortKey === c.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
              </th>
            {/each}
            <th><span class="sr">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {#each visible as r (r.job.id)}
            <tr class:selected={r.job.id === ui.selectedJobId} onclick={() => select(r.job.id)} ondblclick={() => openDetails(r)}>
              <td class="nr"><span class="pin" class:nopin={!r.coord}>{rowNumber.get(r.job.id)}</span></td>
              {#each columns as c (c.key)}
                <td class:num={c.num}>
                  <JobCell row={r} col={c.key} subline={c.key === 'title' && !store.overviewColumns.includes('company')} />
                </td>
              {/each}
              <td class="act">
                <button class="ghost icon sm" title="Details öffnen" aria-label="Details zu {r.job.title}" onclick={e => { e.stopPropagation(); openDetails(r); }}><View size={16} /></button>
              </td>
            </tr>
          {:else}
            <tr><td colspan={columns.length + 2} class="muted empty">
              {store.jobs.length ? 'Keine Stelle passt zu den Filtern.' : 'Noch keine Stellen. Lege unter Datenbank → Stellen eine neue an oder lade in den Einstellungen die Beispieldaten.'}
            </td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}

  {#snippet map()}
    <MapView
      {points}
      variant="job"
      home={store.activeHomeCoord}
      homes={store.homeMarkers}
      radiusKm={store.radiusKm}
      selectedId={selected?.location?.id ?? null}
      {route}
      draggableId={correcting ? (selected?.location?.id ?? null) : null}
      onselect={selectLocation}
      onmoved={moved}
      onhomeclick={id => setSetting('activeHomeId', id)}
    />

    {#if selected}
      <div class="info">
        <div class="row">
          <strong class="grow">{selected.job.title || '(ohne Titel)'}</strong>
          <button class="ghost icon sm" aria-label="Auswahl aufheben" onclick={() => { ui.selectedJobId = null; route = null; }}><Close size={16} /></button>
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
              <button class="secondary sm" onclick={() => (route = null)}>Route ausblenden</button>
            {:else}
              <button class="secondary sm" disabled={!prefs.orsKey} title={prefs.orsKey ? '' : 'OpenRouteService-Schlüssel in den Einstellungen eintragen'} onclick={showRoute}>Route anzeigen</button>
            {/if}
          {/if}
          {#if selected.coord && store.allowPositionCorrection}
            <button class="secondary sm" onclick={() => (correcting = !correcting)}>{correcting ? 'Korrektur abbrechen' : 'Position korrigieren'}</button>
          {/if}
          <button class="sm" onclick={() => openDetails(selected)}>Details</button>
        </div>
      </div>
    {/if}
  {/snippet}
</MapLayout>

{#if pickingColumns}
  <ColumnPicker
    columns={COLUMNS}
    value={store.overviewColumns}
    defaults={DEFAULT_OVERVIEW_COLUMNS}
    settingKey="overviewColumns"
    onclose={() => (pickingColumns = false)}
  />
{/if}
