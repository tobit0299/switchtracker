<script lang="ts">
  import Close from 'carbon-icons-svelte/lib/Close.svelte';
  import View from 'carbon-icons-svelte/lib/View.svelte';
  import Column from 'carbon-icons-svelte/lib/Column.svelte';
  import FilterRemove from 'carbon-icons-svelte/lib/FilterRemove.svelte';
  import type { LineString } from 'geojson';
  import { columnByKey, compareRows, type ColumnKey } from '../lib/columns';
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
  import MapView, { type MapPoint } from './MapView.svelte';

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

  function setRadius(value: string) {
    const n = parseFloat(value.replace(',', '.'));
    void setSetting('radiusKm', Number.isFinite(n) && n > 0 ? n : null);
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
    if (text && !`${r.job.title} ${r.company?.name ?? ''} ${r.location?.city ?? ''}`.toLowerCase().includes(text)) return false;
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

  // ---------- Breite der Tabellenspalte (an der linken Kartenkante ziehbar) ----------
  const WIDTH_KEY = 'switchtracker.listWidth';
  const readWidth = () => { try { return Number(localStorage.getItem(WIDTH_KEY)) || 440; } catch { return 440; } };
  let listWidth = $state(readWidth());
  let layoutEl: HTMLDivElement;

  function clampWidth(w: number) {
    const max = Math.max(320, (layoutEl?.clientWidth ?? window.innerWidth) - 280);
    return Math.round(Math.min(max, Math.max(320, w)));
  }
  function saveWidth() { try { localStorage.setItem(WIDTH_KEY, String(listWidth)); } catch { /* privater Modus */ } }

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const left = layoutEl.getBoundingClientRect().left;
    const onMove = (ev: PointerEvent) => (listWidth = clampWidth(ev.clientX - left));
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      saveWidth();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  function resizeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowLeft') listWidth = clampWidth(listWidth - step);
    else if (e.key === 'ArrowRight') listWidth = clampWidth(listWidth + step);
    else return;
    e.preventDefault();
    saveWidth();
  }

  // ---------- Karte ----------
  /** laufende Nummer jeder sichtbaren Zeile (1–n in aktueller Filterung und Sortierung) */
  const rowNumber = $derived(new Map(visible.map((r, i) => [r.job.id, i + 1])));

  const points = $derived.by(() => {
    const byLoc = new Map<string, MapPoint & { nums: number[] }>();
    for (const r of visible) {
      if (!r.location || !r.coord) continue;
      const n = rowNumber.get(r.job.id)!;
      const p = byLoc.get(r.location.id);
      if (p) { p.subtitle += `
${n}. ${r.job.title}`; p.nums.push(n); }
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

<div class="overview" bind:this={layoutEl} style:--list-w="{listWidth}px">
  <section class="list layer">
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

      <label class="radius">
        <span class="lbl">Radius</span>
        <input
          type="number" min="1" step="5" placeholder="alle"
          value={store.radiusKm ?? ''}
          onchange={e => setRadius(e.currentTarget.value)}
          title="Luftlinie um die gewählte Heimadresse; leer = kein Radiusfilter"
        />
        <span class="muted small">km Luftlinie um die Heimadresse</span>
      </label>

      <div class="filters">
        <input type="search" placeholder="Suche in Titel, Unternehmen, Ort" bind:value={q} aria-label="Suche" />
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
              {store.jobs.length ? 'Keine Stelle passt zu den Filtern.' : 'Noch keine Stellen. Lege im Reiter „Stellen“ eine neue an oder lade in den Einstellungen die Beispieldaten.'}
            </td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Fokussierbarer Trenner (ARIA „separator“ mit Wert) ist ein bedienbares Element -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="splitter"
    role="separator"
    aria-orientation="vertical"
    aria-label="Breite von Tabelle und Karte ändern"
    aria-valuenow={listWidth}
    aria-valuemin={320}
    tabindex="0"
    title="Ziehen, um die Karte zu vergrößern oder zu verkleinern"
    onpointerdown={startResize}
    onkeydown={resizeKey}
  ></div>

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
  </section>
</div>

{#if pickingColumns}
  <ColumnPicker onclose={() => (pickingColumns = false)} />
{/if}

<style>
  .overview {
    display: grid;
    grid-template-columns: var(--list-w) 6px 1fr;
    height: 100%;
  }
  .list { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--panel); }
  .controls { display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 12px; }
  .head { margin-top: 4px; gap: 0; }
  .radius { display: grid; grid-template-columns: auto 96px 1fr; align-items: center; gap: 8px; }
  .lbl { font-size: 12px; letter-spacing: 0.32px; color: var(--muted); }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
  .filters input { grid-column: 1 / -1; }
  .table-wrap { flex: 1; overflow: auto; border-top: 1px solid var(--border); }
  /* kompakte Tabelle: etwas weniger Innenabstand als die volle Carbon-Tabelle */
  .table-wrap :global(th), .table-wrap :global(td) { padding-left: 12px; padding-right: 12px; }
  .table-wrap :global(td.act) { width: 1px; padding: 0 4px; }
  .table-wrap :global(th.nr), .table-wrap :global(td.nr) { width: 1px; padding: 0 0 0 12px; text-align: center; }
  /* gleiche Optik wie der Marker auf der Karte */
  .pin {
    display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px;
    border-radius: 11px; background: #0f62fe; color: #fff; font-size: 11px; font-weight: 600;
  }
  .pin.nopin { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--border-strong); }
  tr.selected .pin:not(.nopin) { background: #ff832b; color: #161616; }
  .empty { padding: 24px 16px; text-align: center; cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .splitter {
    cursor: col-resize; background: var(--border); position: relative; touch-action: none;
    outline: 2px solid transparent; outline-offset: -2px;
  }
  .splitter::after {
    content: ''; position: absolute; top: 50%; left: 1px; width: 4px; height: 32px; margin-top: -16px;
    border-left: 1px solid var(--border-strong); border-right: 1px solid var(--border-strong);
  }
  .splitter:hover, .splitter:focus-visible { background: var(--accent); }
  .splitter:focus-visible { outline-color: var(--focus); }
  .mapcol { position: relative; min-height: 0; min-width: 0; }
  .info {
    position: absolute; left: 16px; bottom: 44px; width: min(400px, calc(100% - 32px));
    display: flex; flex-direction: column; gap: 4px; padding: 16px;
    background: var(--panel); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .facts { display: flex; gap: 16px; flex-wrap: wrap; }
  .actions { margin-top: 8px; }
  @media (max-width: 800px) {
    .overview { grid-template-columns: 1fr; grid-template-rows: auto 60vh; height: auto; }
    .splitter { display: none; }
    .table-wrap { max-height: 50vh; }
  }
</style>
