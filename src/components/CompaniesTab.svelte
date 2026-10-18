<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import StarRating from './StarRating.svelte';

  let q = $state('');
  let sortKey = $state<'name' | 'industry' | 'rating' | 'locations' | 'jobs'>('name');
  let sortAsc = $state(true);

  const rows = $derived.by(() => {
    const locCount = new Map<string, number>();
    const cities = new Map<string, Set<string>>();
    for (const l of store.locations) {
      locCount.set(l.companyId, (locCount.get(l.companyId) ?? 0) + 1);
      if (!cities.has(l.companyId)) cities.set(l.companyId, new Set());
      if (l.city) cities.get(l.companyId)!.add(l.city);
    }
    const jobCount = new Map<string, number>();
    for (const j of store.jobs) if (j.companyId) jobCount.set(j.companyId, (jobCount.get(j.companyId) ?? 0) + 1);
    const text = q.trim().toLowerCase();
    const dir = sortAsc ? 1 : -1;
    return store.companies
      .map(c => ({ c, locations: locCount.get(c.id) ?? 0, jobs: jobCount.get(c.id) ?? 0, cities: [...(cities.get(c.id) ?? [])].join(', ') }))
      .filter(r => !text || `${r.c.name} ${r.c.industry} ${r.cities}`.toLowerCase().includes(text))
      .sort((a, b) => {
        switch (sortKey) {
          case 'name': return dir * a.c.name.localeCompare(b.c.name, 'de');
          case 'industry': return dir * a.c.industry.localeCompare(b.c.industry, 'de');
          case 'rating': return dir * (a.c.rating - b.c.rating);
          case 'locations': return dir * (a.locations - b.locations);
          case 'jobs': return dir * (a.jobs - b.jobs);
        }
      });
  });

  function sortBy(k: typeof sortKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = k === 'name' || k === 'industry'; }
  }
  const arrow = (k: typeof sortKey) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');
</script>

<div class="page">
  <div class="row head">
    <h2 class="grow">Unternehmen <span class="muted small">{rows.length} von {store.companies.length}</span></h2>
    <input type="search" placeholder="Suche in Name, Branche, Orten" bind:value={q} />
    <button onclick={() => (ui.companyDialog = 'new')}>+ Neues Unternehmen</button>
  </div>

  <div class="table-wrap card">
    <table class="data">
      <thead>
        <tr>
          <th class="sortable" onclick={() => sortBy('name')}>Name{arrow('name')}</th>
          <th class="sortable" onclick={() => sortBy('industry')}>Branche{arrow('industry')}</th>
          <th class="sortable" onclick={() => sortBy('rating')}>Bewertung{arrow('rating')}</th>
          <th>Orte</th>
          <th class="sortable num" onclick={() => sortBy('locations')}>Standorte{arrow('locations')}</th>
          <th class="sortable num" onclick={() => sortBy('jobs')}>Stellen{arrow('jobs')}</th>
          <th>Website</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.c.id)}
          <tr onclick={() => (ui.companyDialog = r.c.id)}>
            <td class="name">{r.c.name}</td>
            <td>{r.c.industry}</td>
            <td><StarRating value={r.c.rating} readonly /></td>
            <td>{r.cities}</td>
            <td class="num">{r.locations}</td>
            <td class="num">{r.jobs}</td>
            <td>{#if r.c.website}<a href={r.c.website} target="_blank" rel="noopener noreferrer" onclick={e => e.stopPropagation()}>{r.c.website.replace(/^https?:\/\//, '')}</a>{/if}</td>
          </tr>
        {:else}
          <tr><td colspan="7" class="muted empty">Noch keine Unternehmen.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .table-wrap { padding: 0; overflow: auto; }
  .name { font-weight: 600; }
  .empty { padding: 24px; text-align: center; cursor: default; }
</style>
