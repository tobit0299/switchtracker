<script lang="ts">
  import CompaniesTab from './components/CompaniesTab.svelte';
  import CompanyDialog from './components/CompanyDialog.svelte';
  import JobDialog from './components/JobDialog.svelte';
  import JobsTab from './components/JobsTab.svelte';
  import Overview from './components/Overview.svelte';
  import SettingsTab from './components/SettingsTab.svelte';
  import { homeGeoRequest, locationGeoRequest } from './lib/geo/keys';
  import { geoStatus, requestGeocodes, requestTravel } from './lib/geo/services.svelte';
  import { prefs, store } from './lib/store.svelte';
  import { ui, type Tab } from './lib/ui.svelte';
  import SettingsIcon from 'carbon-icons-svelte/lib/Settings.svelte';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'jobs', label: 'Stellen' },
    { id: 'companies', label: 'Unternehmen' },
  ];

  // Fehlende Koordinaten automatisch nachschlagen (nur was noch nicht im Cache ist)
  $effect(() => {
    if (!store.loaded) return;
    requestGeocodes([...store.homes.map(h => homeGeoRequest(h.address)), ...store.locations.map(locationGeoRequest)]);
  });

  // Fehlende Fahrzeiten ab der aktiven Heimadresse berechnen, nur für Standorte mit Stellen
  $effect(() => {
    const from = store.activeHomeCoord;
    const key = prefs.orsKey;
    if (!store.loaded || !from || !key) return;
    const targets = store.rows.map(r => r.coord).filter(c => c != null);
    const timer = setTimeout(() => requestTravel(from, targets), 600);
    return () => clearTimeout(timer);
  });
</script>

<div class="shell">
  <header>
    <div class="brand">
      <img src="{import.meta.env.BASE_URL}icon.svg" alt="" width="20" height="20" />
      <span>SwitchTracker</span>
    </div>
    <nav aria-label="Bereiche">
      {#each tabs as t (t.id)}
        <button class="tab" class:active={ui.tab === t.id} aria-current={ui.tab === t.id ? 'page' : undefined} onclick={() => (ui.tab = t.id)}>{t.label}</button>
      {/each}
    </nav>
    <div class="status small">
      {#if geoStatus.geocodePending}<span>Adresssuche: {geoStatus.geocodePending} offen</span>{/if}
      {#if geoStatus.travelPending}<span>Fahrzeiten: {geoStatus.travelPending} offen</span>{/if}
    </div>
    <button
      class="gear"
      class:active={ui.tab === 'settings'}
      aria-label="Einstellungen"
      title="Einstellungen"
      aria-current={ui.tab === 'settings' ? 'page' : undefined}
      onclick={() => (ui.tab = 'settings')}
    ><SettingsIcon size={20} /></button>
  </header>

  <div class="notice warn guest">
    <strong>Gastmodus:</strong> Deine Daten werden nur in diesem Browser gespeichert. Sichere sie regelmäßig unter
    <button class="link" onclick={() => (ui.tab = 'settings')}>Einstellungen → Backup</button>.
  </div>

  {#if geoStatus.error}
    <div class="notice error row">
      <span class="grow">{geoStatus.error}</span>
      <button class="secondary" onclick={() => (geoStatus.error = '')}>Schließen</button>
    </div>
  {/if}

  <main>
    {#if !store.loaded}
      <p class="muted pad">Daten werden geladen …</p>
    {:else if ui.tab === 'overview'}
      <Overview />
    {:else if ui.tab === 'jobs'}
      <JobsTab />
    {:else if ui.tab === 'companies'}
      <CompaniesTab />
    {:else}
      <SettingsTab />
    {/if}
  </main>
</div>

{#if ui.jobDialog}
  {#key ui.jobDialog.job.id}
    <JobDialog initial={ui.jobDialog.job} isNew={ui.jobDialog.isNew} onclose={() => (ui.jobDialog = null)} />
  {/key}
{/if}

{#if ui.companyDialog}
  {#key ui.companyDialog}
    <CompanyDialog companyId={ui.companyDialog} onclose={() => (ui.companyDialog = null)} />
  {/key}
{/if}

<style>
  .shell { display: flex; flex-direction: column; height: 100%; }
  /* UI-Shell-Kopfzeile nach Carbon: 48 px, immer dunkel */
  header {
    display: flex; align-items: stretch; height: 48px; flex-shrink: 0;
    background: var(--shell); color: var(--shell-text); border-bottom: 1px solid #393939;
  }
  .brand { display: flex; align-items: center; gap: 8px; padding: 0 16px; font-weight: 600; font-size: 14px; white-space: nowrap; }
  nav { display: flex; overflow-x: auto; }
  .tab {
    min-height: 0; height: 100%; padding: 0 16px; background: none; color: var(--shell-muted);
    border: 0; box-shadow: none;
  }
  .tab:hover { background: var(--shell-hover); color: var(--shell-text); }
  .tab.active { color: var(--shell-text); box-shadow: inset 0 -3px 0 #0f62fe; font-weight: 600; }
  .status { margin-left: auto; display: flex; align-items: center; gap: 16px; padding: 0 16px; color: var(--shell-muted); white-space: nowrap; }
  .gear {
    min-height: 0; height: 48px; width: 48px; padding: 0; justify-content: center;
    background: none; color: var(--shell-text); border: 0;
  }
  .gear:hover { background: var(--shell-hover); }
  .gear.active { background: #393939; box-shadow: inset 0 -3px 0 #0f62fe; }
  .guest { flex-shrink: 0; }
  .notice.error { flex-shrink: 0; }
  main { flex: 1; min-height: 0; overflow: auto; }
  .pad { padding: 16px; }
  @media (max-width: 700px) {
    .brand span { display: none; }
    .status { display: none; }
    nav { flex: 1; }
  }
</style>
