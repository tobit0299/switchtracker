<script lang="ts">
  import Add from 'carbon-icons-svelte/lib/Add.svelte';
  import FilterRemove from 'carbon-icons-svelte/lib/FilterRemove.svelte';
  import { COLUMNS, columnByKey, compareRows, type ColumnKey } from '../lib/columns';
  import { emptyJob } from '../lib/repo';
  import { prefs, store, type JobRow } from '../lib/store.svelte';
  import { COUNTRIES, STATUSES, WORK_MODELS } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import JobCell from './JobCell.svelte';

  // ---------- Filter ----------
  let q = $state('');
  let status = $state('open');
  let workModel = $state('');
  let industry = $state('');
  let minRating = $state(0);
  let minRelevance = $state(0);
  let bundesland = $state('');
  let country = $state('');
  let maxMinutes = $state<number | null>(null);

  const closed = new Set(STATUSES.filter(s => s.closed).map(s => s.value));
  const industries = $derived([...new Set(store.companies.map(c => c.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')));
  const states = $derived([...new Set(store.rows.map(r => r.state).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')));

  function matches(r: JobRow): boolean {
    const text = q.trim().toLowerCase();
    if (text && !`${r.job.title} ${r.company?.name ?? ''} ${r.location?.city ?? ''} ${r.job.notes}`.toLowerCase().includes(text)) return false;
    if (status === 'open' && closed.has(r.job.status)) return false;
    if (status !== 'open' && status !== 'all' && r.job.status !== status) return false;
    if (workModel && r.job.workModel !== workModel) return false;
    if (industry && r.company?.industry !== industry) return false;
    if (minRating && (r.company?.rating ?? 0) < minRating) return false;
    if (minRelevance && r.job.relevance < minRelevance) return false;
    if (bundesland && r.state !== bundesland) return false;
    if (country && r.location?.country !== country) return false;
    // Fahrzeitfilter nur auf berechneten Werten; ohne Wert fällt die Stelle heraus
    if (maxMinutes && !(r.travel?.reachable && r.travel.durationS / 60 <= maxMinutes)) return false;
    return true;
  }

  // ---------- Sortierung ----------
  let sortKey = $state<ColumnKey>('deadline');
  let sortAsc = $state(true);

  const visible = $derived(store.rows.filter(matches).sort((a, b) => compareRows(a, b, sortKey, sortAsc)));

  function sortBy(k: ColumnKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = !columnByKey.get(k)?.descFirst; }
  }

  function reset() {
    q = ''; status = 'open'; workModel = ''; industry = ''; minRating = 0; minRelevance = 0; bundesland = ''; country = ''; maxMinutes = null;
  }

  const open = (r: JobRow) => (ui.jobDialog = { job: $state.snapshot(r.job), isNew: false });

</script>

<div class="page">
  <div class="row head">
    <h2 class="grow">Stellen <span class="muted small">{visible.length} von {store.jobs.length}</span></h2>
    <button onclick={() => (ui.jobDialog = { job: emptyJob(), isNew: true })}><Add size={16} /> Neue Stelle</button>
  </div>

  <div class="filters card">
    <input type="search" class="search" placeholder="Suche in Titel, Unternehmen, Ort, Notizen" bind:value={q} />
    <label class="field">Status
      <select bind:value={status}>
        <option value="open">Offene</option>
        <option value="all">Alle</option>
        {#each STATUSES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
      </select>
    </label>
    <label class="field">Arbeitsmodell
      <select bind:value={workModel}>
        <option value="">Alle</option>
        {#each WORK_MODELS as w (w.value)}<option value={w.value}>{w.label}</option>{/each}
      </select>
    </label>
    <label class="field">Branche
      <select bind:value={industry}>
        <option value="">Alle</option>
        {#each industries as i (i)}<option value={i}>{i}</option>{/each}
      </select>
    </label>
    <label class="field">Bewertung Unternehmen ab
      <select bind:value={minRating}>
        <option value={0}>Alle</option>
        {#each [1, 2, 3, 4, 5] as n (n)}<option value={n}>{'★'.repeat(n)}</option>{/each}
      </select>
    </label>
    <label class="field">Relevanz Stelle ab
      <select bind:value={minRelevance}>
        <option value={0}>Alle</option>
        {#each [1, 2, 3, 4, 5] as n (n)}<option value={n}>{'★'.repeat(n)}</option>{/each}
      </select>
    </label>
    <label class="field">Bundesland
      <select bind:value={bundesland}>
        <option value="">Alle</option>
        {#each states as s (s)}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    <label class="field">Land
      <select bind:value={country}>
        <option value="">Alle</option>
        {#each COUNTRIES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
      </select>
    </label>
    <label class="field" title={prefs.orsKey ? 'Nur Stellen mit berechneter Fahrzeit ab der aktiven Heimadresse' : 'Benötigt einen OpenRouteService-Schlüssel'}>
      Fahrzeit bis (min)
      <input type="number" min="5" step="5" placeholder="alle" bind:value={maxMinutes} disabled={!prefs.orsKey} />
    </label>
    <button class="ghost reset" onclick={reset} title="Alle Filter zurücksetzen"><FilterRemove size={16} /> Filter zurücksetzen</button>
  </div>

  <div class="table-wrap card">
    <table class="data">
      <thead>
        <tr>
          {#each COLUMNS as c (c.key)}
            <th class="sortable" class:num={c.num} aria-sort={sortKey === c.key ? (sortAsc ? 'ascending' : 'descending') : 'none'} onclick={() => sortBy(c.key)}>
              {c.label}{sortKey === c.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visible as r (r.job.id)}
          <tr onclick={() => open(r)}>
            {#each COLUMNS as c (c.key)}
              <td class:num={c.num} class:title={c.key === 'title'}><JobCell row={r} col={c.key} /></td>
            {/each}
          </tr>
        {:else}
          <tr><td colspan={COLUMNS.length} class="muted empty">Keine Stelle passt zu den Filtern.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">Luftlinie und Fahrzeit beziehen sich auf die aktive Heimadresse{store.activeHome ? ` „${store.activeHome.name}“` : ''}.</p>
</div>

<style>
  .page { padding: 16px; display: flex; flex-direction: column; gap: 16px; height: 100%; }
  .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; align-items: end; }
  .search { grid-column: 1 / -1; }
  .table-wrap { padding: 0; overflow: auto; flex: 1; min-height: 240px; }
  .title { min-width: 200px; }
  .empty { padding: 24px; text-align: center; cursor: default; }
  td { white-space: nowrap; }
  td.title { white-space: normal; }
</style>
