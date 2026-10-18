<script lang="ts">
  import { deadlineClass, fmtDate, fmtDuration, fmtKm } from '../lib/format';
  import { emptyJob } from '../lib/repo';
  import { prefs, store, type JobRow } from '../lib/store.svelte';
  import { COUNTRIES, STATUSES, WORK_MODELS, countryLabel, statusLabel, workModelLabel } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import StarRating from './StarRating.svelte';

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
  type SortKey = 'title' | 'company' | 'city' | 'state' | 'status' | 'relevance' | 'rating' | 'deadline' | 'followUp' | 'air' | 'travel';
  let sortKey = $state<SortKey>('deadline');
  let sortAsc = $state(true);
  const statusOrder = new Map(STATUSES.map((s, i) => [s.value, i]));

  function sortValue(r: JobRow, k: SortKey): string | number | null {
    switch (k) {
      case 'title': return r.job.title;
      case 'company': return r.company?.name ?? null;
      case 'city': return r.location?.city ?? null;
      case 'state': return r.state || null;
      case 'status': return statusOrder.get(r.job.status) ?? 0;
      case 'relevance': return r.job.relevance || null;
      case 'rating': return r.company?.rating || null;
      case 'deadline': return r.job.deadline || null;
      case 'followUp': return r.job.followUp || null;
      case 'air': return r.airKm;
      case 'travel': return r.travel?.reachable ? r.travel.durationS : null;
    }
  }

  const visible = $derived.by(() => {
    const dir = sortAsc ? 1 : -1;
    return store.rows.filter(matches).sort((a, b) => {
      const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      if (va == null) return vb == null ? 0 : 1; // leere Werte immer ans Ende
      if (vb == null) return -1;
      return dir * (typeof va === 'number' ? va - (vb as number) : va.localeCompare(vb as string, 'de'));
    });
  });

  function sortBy(k: SortKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = !['relevance', 'rating'].includes(k); }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');

  function reset() {
    q = ''; status = 'open'; workModel = ''; industry = ''; minRating = 0; minRelevance = 0; bundesland = ''; country = ''; maxMinutes = null;
  }

  const open = (r: JobRow) => (ui.jobDialog = { job: $state.snapshot(r.job), isNew: false });

  const columns: { key: SortKey; label: string; num?: boolean }[] = [
    { key: 'title', label: 'Titel' },
    { key: 'company', label: 'Unternehmen' },
    { key: 'city', label: 'Ort' },
    { key: 'state', label: 'Bundesland' },
    { key: 'status', label: 'Status' },
    { key: 'relevance', label: 'Relevanz' },
    { key: 'rating', label: 'Bewertung' },
    { key: 'deadline', label: 'Frist', num: true },
    { key: 'followUp', label: 'Wiedervorlage', num: true },
    { key: 'air', label: 'Luftlinie', num: true },
    { key: 'travel', label: 'Fahrzeit', num: true },
  ];
</script>

<div class="page">
  <div class="row head">
    <h2 class="grow">Stellen <span class="muted small">{visible.length} von {store.jobs.length}</span></h2>
    <button onclick={() => (ui.jobDialog = { job: emptyJob(), isNew: true })}>+ Neue Stelle</button>
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
    <label class="field">Bewertung ab
      <select bind:value={minRating}>
        <option value={0}>Alle</option>
        {#each [1, 2, 3, 4, 5] as n (n)}<option value={n}>{'★'.repeat(n)}</option>{/each}
      </select>
    </label>
    <label class="field">Relevanz ab
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
    <button class="secondary reset" onclick={reset}>Filter zurücksetzen</button>
  </div>

  <div class="table-wrap card">
    <table class="data">
      <thead>
        <tr>
          {#each columns as c (c.key)}
            <th class="sortable" class:num={c.num} onclick={() => sortBy(c.key)}>{c.label}{arrow(c.key)}</th>
          {/each}
          <th>Arbeitsmodell</th>
          <th>Branche</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as r (r.job.id)}
          <tr onclick={() => open(r)}>
            <td class="title">
              {r.job.title || '(ohne Titel)'}
              {#if r.job.url}<a href={r.job.url} target="_blank" rel="noopener noreferrer" onclick={e => e.stopPropagation()} title="Stellenanzeige öffnen">↗</a>{/if}
            </td>
            <td>{r.company?.name ?? ''}</td>
            <td>{r.location ? `${r.location.city}${r.location.country !== 'DE' ? ` (${countryLabel(r.location.country)})` : ''}` : ''}</td>
            <td>{r.state}</td>
            <td><span class="badge s-{r.job.status}">{statusLabel(r.job.status)}</span></td>
            <td><StarRating value={r.job.relevance} readonly label="Relevanz" /></td>
            <td>{#if r.company}<StarRating value={r.company.rating} readonly />{/if}</td>
            <td class="num {deadlineClass(r.job.deadline)}">{fmtDate(r.job.deadline)}</td>
            <td class="num {deadlineClass(r.job.followUp)}">{fmtDate(r.job.followUp)}</td>
            <td class="num">{r.location ? fmtKm(r.airKm) : ''}</td>
            <td class="num">{r.travel ? (r.travel.reachable ? fmtDuration(r.travel.durationS) : 'keine Route') : r.location ? '–' : ''}</td>
            <td>{workModelLabel(r.job.workModel)}</td>
            <td>{r.company?.industry ?? ''}</td>
          </tr>
        {:else}
          <tr><td colspan={columns.length + 2} class="muted empty">Keine Stelle passt zu den Filtern.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">Luftlinie und Fahrzeit beziehen sich auf die aktive Heimadresse{store.activeHome ? ` „${store.activeHome.name}“` : ''}.</p>
</div>

<style>
  .page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; align-items: end; padding: 12px; }
  .search { grid-column: 1 / -1; }
  .table-wrap { padding: 0; overflow: auto; max-height: calc(100vh - 330px); min-height: 200px; }
  .title { font-weight: 600; min-width: 180px; }
  .title a { text-decoration: none; margin-left: 4px; }
  .empty { padding: 24px; text-align: center; cursor: default; }
  td { white-space: nowrap; }
  td.title { white-space: normal; }
</style>
