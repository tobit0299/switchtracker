<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { ui, type DatabaseTab } from '../lib/ui.svelte';
  import CompaniesTab from './CompaniesTab.svelte';
  import JobsTab from './JobsTab.svelte';

  const subtabs: { id: DatabaseTab; label: string; count: () => number }[] = [
    { id: 'jobs', label: 'Stellen', count: () => store.jobs.length },
    { id: 'companies', label: 'Unternehmen', count: () => store.companies.length },
  ];
</script>

<div class="db">
  <div class="subtabs" role="tablist" aria-label="Datenbank">
    {#each subtabs as t (t.id)}
      <button
        role="tab"
        class="subtab"
        class:active={ui.dbTab === t.id}
        aria-selected={ui.dbTab === t.id}
        onclick={() => (ui.dbTab = t.id)}
      >{t.label} <span class="count">{t.count()}</span></button>
    {/each}
  </div>
  <div class="content" role="tabpanel">
    {#if ui.dbTab === 'jobs'}<JobsTab />{:else}<CompaniesTab />{/if}
  </div>
</div>

<style>
  .db { display: flex; flex-direction: column; height: 100%; }
  /* Carbon-Tabs (Linienvariante) */
  .subtabs { display: flex; gap: 0; padding: 0 16px; background: var(--bg); border-bottom: 1px solid var(--border-strong); flex-shrink: 0; }
  .subtab {
    min-height: 0; height: 48px; padding: 0 16px; background: none; color: var(--muted); border: 0;
    box-shadow: inset 0 -2px 0 transparent; font-size: 14px;
  }
  .subtab:hover { background: var(--hover); color: var(--text); }
  .subtab.active { color: var(--text); font-weight: 600; box-shadow: inset 0 -3px 0 var(--accent); }
  .count { font-size: 12px; color: var(--muted); font-weight: 400; margin-left: 4px; }
  .content { flex: 1; min-height: 0; overflow: auto; }
</style>
