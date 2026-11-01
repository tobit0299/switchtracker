<script lang="ts">
  import Close from 'carbon-icons-svelte/lib/Close.svelte';
  import Column from 'carbon-icons-svelte/lib/Column.svelte';
  import FilterRemove from 'carbon-icons-svelte/lib/FilterRemove.svelte';
  import View from 'carbon-icons-svelte/lib/View.svelte';
  import type { LineString } from 'geojson';
  import { COMPANY_COLUMNS, DEFAULT_COMPANY_MAP_COLUMNS, companyColumnByKey, compareLocationRows, type CompanyColumnKey } from '../lib/companyColumns';
  import { fmtDuration, fmtKm } from '../lib/format';
  import { locationAddress, locationGeoRequest } from '../lib/geo/keys';
  import { getRoute, setManualPosition } from '../lib/geo/services.svelte';
  import { setSetting } from '../lib/repo';
  import { prefs, store, type LocationRow } from '../lib/store.svelte';
  import type { Coord } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import HomeBar from './HomeBar.svelte';
  import LocationCell from './LocationCell.svelte';
  import MapLayout from './MapLayout.svelte';
  import MapView, { type MapPoint } from './MapView.svelte';
  import RadiusField from './RadiusField.svelte';
  import StarRating from './StarRating.svelte';

  // ---------- Filter und Sortierung ----------
  let q = $state('');
  let industry = $state('');
  let minRating = $state(0);
  let jobsFilter = $state<'all' | 'with' | 'without'>('all');
  let sortKey = $state<CompanyColumnKey>('company');
  let sortAsc = $state(true);
  let pickingColumns = $state(false);

  const columns = $derived(store.companyMapColumns.map(k => companyColumnByKey.get(k)!));
  const industries = $derived([...new Set(store.companies.map(c => c.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')));
  const filtersActive = $derived(!!q.trim() || !!industry || minRating > 0 || jobsFilter !== 'all' || store.radiusKm != null);

  function resetFilters() {
    q = ''; industry = ''; minRating = 0; jobsFilter = 'all';
    if (store.radiusKm != null) void setSetting('radiusKm', null);
  }

  function matches(r: LocationRow): boolean {
    const radius = store.radiusKm;
    if (radius && store.activeHomeCoord && !(r.airKm != null && r.airKm <= radius)) return false;
    const text = q.trim().toLowerCase();
    if (text && !`${r.company?.name ?? ''} ${r.location.label} ${r.location.city} ${r.company?.industry ?? ''}`.toLowerCase().includes(text)) return false;
    if (industry && r.company?.industry !== industry) return false;
    if (minRating && (r.company?.rating ?? 0) < minRating) return false;
    if (jobsFilter === 'with' && !r.jobCount) return false;
    if (jobsFilter === 'without' && r.jobCount) return false;
    return true;
  }

  const visible = $derived(store.locationRows.filter(matches).sort((a, b) => compareLocationRows(a, b, sortKey, sortAsc)));

  function sortBy(k: CompanyColumnKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = !companyColumnByKey.get(k)?.descFirst; }
  }
  const ariaSort = (k: CompanyColumnKey) => (sortKey === k ? (sortAsc ? 'ascending' : 'descending') : 'none');

  // ---------- Karte ----------
  const rowNumber = $derived(new Map(visible.map((r, i) => [r.location.id, i + 1])));

  const points = $derived<MapPoint[]>(visible.flatMap(r => r.coord ? [{
    id: r.location.id,
    coord: r.coord,
    title: r.company?.name ?? r.location.city,
    subtitle: `${rowNumber.get(r.location.id)}. ${[r.location.label, r.location.city].filter(Boolean).join(' · ')}${r.jobCount ? ` · ${r.jobCount} Stelle(n)` : ''}`,
    label: String(rowNumber.get(r.location.id)),
  }] : []));

  const selected = $derived(visible.find(r => r.location.id === ui.selectedLocationId) ?? null);
  let route = $state<LineString | null>(null);
  let routeInfo = $state('');
  let routeError = $state('');
  let correcting = $state(false);

  $effect(() => { if (!store.allowPositionCorrection) correcting = false; });

  function select(locationId: string) {
    if (ui.selectedLocationId !== locationId) { route = null; routeInfo = ''; routeError = ''; correcting = false; }
    ui.selectedLocationId = locationId;
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

  function openDetails(r: LocationRow) {
    if (r.company) ui.companyDialog = r.company.id;
  }
</script>

<MapLayout>
  {#snippet list()}
    <div class="controls">
      <HomeBar />

      <div class="head row">
        <h2 class="grow">Standorte <span class="muted small">{visible.length} von {store.locations.length}</span></h2>
        <button class="ghost icon" title="Alle Filter zurücksetzen" aria-label="Alle Filter zurücksetzen" disabled={!filtersActive} onclick={resetFilters}>
          <FilterRemove size={20} />
        </button>
        <button class="ghost icon" title="Spalten auswählen und sortieren" aria-label="Spalten auswählen und sortieren" onclick={() => (pickingColumns = true)}>
          <Column size={20} />
        </button>
      </div>

      <RadiusField />

      <div class="filters">
        <input type="search" placeholder="Suche in Unternehmen, Standort, Ort, Branche" bind:value={q} aria-label="Suche" />
        <select bind:value={industry} aria-label="Branche">
          <option value="">Alle Branchen</option>
          {#each industries as i (i)}<option value={i}>{i}</option>{/each}
        </select>
        <select bind:value={minRating} aria-label="Bewertung ab">
          <option value={0}>Jede Bewertung</option>
          {#each [1, 2, 3, 4, 5] as n (n)}<option value={n}>ab {'★'.repeat(n)}</option>{/each}
        </select>
        <select class="wide" bind:value={jobsFilter} aria-label="Stellen am Standort">
          <option value="all">Alle Standorte</option>
          <option value="with">Nur mit eigenen Stellen</option>
          <option value="without">Nur ohne eigene Stellen</option>
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
          {#each visible as r (r.location.id)}
            <tr class:selected={r.location.id === ui.selectedLocationId} onclick={() => select(r.location.id)} ondblclick={() => openDetails(r)}>
              <td class="nr"><span class="pin company" class:nopin={!r.coord}>{rowNumber.get(r.location.id)}</span></td>
              {#each columns as c (c.key)}
                <td class:num={c.num}>
                  <LocationCell row={r} col={c.key} subline={c.key === 'company' && !store.companyMapColumns.includes('city')} />
                </td>
              {/each}
              <td class="act">
                <button class="ghost icon sm" title="Unternehmen öffnen" aria-label="Details zu {r.company?.name ?? 'Unternehmen'}" onclick={e => { e.stopPropagation(); openDetails(r); }}><View size={16} /></button>
              </td>
            </tr>
          {:else}
            <tr><td colspan={columns.length + 2} class="muted empty">
              {store.locations.length ? 'Kein Standort passt zu den Filtern.' : 'Noch keine Standorte. Lege unter Datenbank → Unternehmen ein Unternehmen mit Standort an.'}
            </td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}

  {#snippet map()}
    <MapView
      {points}
      variant="company"
      home={store.activeHomeCoord}
      homes={store.homeMarkers}
      radiusKm={store.radiusKm}
      selectedId={selected?.location.id ?? null}
      {route}
      draggableId={correcting ? (selected?.location.id ?? null) : null}
      onselect={select}
      onmoved={moved}
      onhomeclick={id => setSetting('activeHomeId', id)}
    />

    {#if selected}
      <div class="info">
        <div class="row">
          <strong class="grow">{selected.company?.name ?? '(unbekanntes Unternehmen)'}</strong>
          <button class="ghost icon sm" aria-label="Auswahl aufheben" onclick={() => { ui.selectedLocationId = null; route = null; }}><Close size={16} /></button>
        </div>
        <div class="muted small">
          {[selected.location.label, selected.company?.industry].filter(Boolean).join(' · ')}
          {#if selected.company?.rating}<StarRating value={selected.company.rating} readonly />{/if}
        </div>
        <div class="small">{locationAddress(selected.location)}</div>
        {#if !selected.coord}
          <div class="small err">Adresse noch nicht gefunden oder nicht auffindbar.</div>
        {:else}
          <div class="small facts">
            <span>Luftlinie: {fmtKm(selected.airKm)}</span>
            <span>Fahrzeit: {selected.travel ? (selected.travel.reachable ? `${fmtDuration(selected.travel.durationS)} (${fmtKm(selected.travel.distanceKm)})` : 'keine Route') : prefs.orsKey ? '…' : 'Schlüssel fehlt'}</span>
          </div>
        {/if}
        <div class="small">{selected.jobCount ? `${selected.jobCount} eigene Stelle(n) an diesem Standort` : 'Keine eigenen Stellen an diesem Standort'}</div>
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
          {#if selected.company}<button class="sm" onclick={() => openDetails(selected)}>Unternehmen öffnen</button>{/if}
        </div>
      </div>
    {/if}
  {/snippet}
</MapLayout>

{#if pickingColumns}
  <ColumnPicker
    columns={COMPANY_COLUMNS}
    value={store.companyMapColumns}
    defaults={DEFAULT_COMPANY_MAP_COLUMNS}
    settingKey="companyMapColumns"
    onclose={() => (pickingColumns = false)}
  />
{/if}

<style>
  .pin.company:not(.nopin) { --pin: #ff832b; color: #161616; }
  .wide { grid-column: 1 / -1; }
</style>
