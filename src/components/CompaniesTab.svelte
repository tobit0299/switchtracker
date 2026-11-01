<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import StarRating from './StarRating.svelte';
  import SourceTag from './SourceTag.svelte';
  import { DIRECTORY_LABEL, directoryOf, hasSharedDirectory, realmIdOf, type Directory } from '../lib/cloud.svelte';
  import { moveCompany } from '../lib/repo';
  import type { Company } from '../lib/types';

  /** Spalte und Filter „Verzeichnis“ nur, wenn es überhaupt ein gemeinsames Verzeichnis gibt */
  const showRealm = $derived(hasSharedDirectory());
  let dirFilter = $state<Directory | ''>('');

  /** Verschiebt ein Unternehmen per Auswahl in der Tabelle; Rückfrage beim Entzug aus dem gemeinsamen Verzeichnis. */
  async function changeDirectory(c: Company, e: Event) {
    const select = e.currentTarget as HTMLSelectElement;
    const target = select.value as Directory;
    const realmId = realmIdOf(target);
    if (!realmId || target === directoryOf(c)) return;
    if (target === 'private' && !confirm(`„${c.name}“ ins private Verzeichnis verschieben?
Die anderen Mitglieder sehen es danach nicht mehr; ihre Stellen verlieren die Verknüpfung.`)) {
      select.value = directoryOf(c);
      return;
    }
    await moveCompany(c.id, realmId);
  }

  let q = $state('');
  let sortKey = $state<'name' | 'industry' | 'rating' | 'locations' | 'jobs' | 'directory'>('name');
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
      .filter(r => !showRealm || !dirFilter || directoryOf(r.c) === dirFilter)
      .sort((a, b) => {
        switch (sortKey) {
          case 'name': return dir * a.c.name.localeCompare(b.c.name, 'de');
          case 'industry': return dir * a.c.industry.localeCompare(b.c.industry, 'de');
          case 'rating': return dir * (a.c.rating - b.c.rating);
          case 'locations': return dir * (a.locations - b.locations);
          case 'jobs': return dir * (a.jobs - b.jobs);
          case 'directory': return dir * directoryOf(a.c).localeCompare(directoryOf(b.c));
        }
      });
  });

  function sortBy(k: typeof sortKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = k === 'name' || k === 'industry' || k === 'directory'; }
  }
  const arrow = (k: typeof sortKey) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');
</script>

<div class="page">
  <div class="row head">
    <h2>Unternehmen <span class="muted small">{rows.length} von {store.companies.length}</span></h2>
    <span class="grow"><SourceTag of="companies" filter={showRealm ? dirFilter : ''} /></span>
    {#if showRealm}
      <select bind:value={dirFilter} aria-label="Verzeichnis">
        <option value="">Alle Verzeichnisse</option>
        <option value="private">Nur privat</option>
        <option value="shared">Nur gemeinsam</option>
      </select>
    {/if}
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
          {#if showRealm}<th class="sortable" onclick={() => sortBy('directory')}>Verzeichnis{arrow('directory')}</th>{/if}
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
            {#if showRealm}
              <td onclick={e => e.stopPropagation()}>
                <select class="dirsel" class:shared={directoryOf(r.c) === 'shared'} value={directoryOf(r.c)}
                  aria-label="Verzeichnis von {r.c.name}" onchange={e => changeDirectory(r.c, e)}>
                  <option value="private">{DIRECTORY_LABEL.private}</option>
                  <option value="shared">{DIRECTORY_LABEL.shared}</option>
                </select>
              </td>
            {/if}
          </tr>
        {:else}
          <tr><td colspan={showRealm ? 8 : 7} class="muted empty">Noch keine Unternehmen.</td></tr>
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
  .table-wrap td select.dirsel { height: 28px; padding: 0 28px 0 8px; font-size: 12px; background-color: var(--tag-blue-bg); color: var(--tag-blue-fg); border: 0; }
  .table-wrap td select.dirsel.shared { background-color: var(--tag-orange-bg); color: var(--tag-orange-fg); }
  td:has(.dirsel) { cursor: default; }
</style>
