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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'jobs', label: 'Stellen' },
    { id: 'companies', label: 'Unternehmen' },
    { id: 'settings', label: 'Einstellungen' },
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
      <img src="{import.meta.env.BASE_URL}icon.svg" alt="" width="24" height="24" />
      <span>SwitchTracker</span>
    </div>
    <nav>
      {#each tabs as t (t.id)}
        <button class="tab" class:active={ui.tab === t.id} onclick={() => (ui.tab = t.id)}>{t.label}</button>
      {/each}
    </nav>
    <div class="status small">
      {#if geoStatus.geocodePending}<span>Adresssuche: {geoStatus.geocodePending} offen</span>{/if}
      {#if geoStatus.travelPending}<span>Fahrzeiten: {geoStatus.travelPending} offen</span>{/if}
    </div>
  </header>

  <div class="guest notice warn">
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
  header {
    display: flex; align-items: center; gap: 16px; padding: 0 16px;
    background: var(--panel); border-bottom: 1px solid var(--border); flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; padding: 10px 0; }
  nav { display: flex; gap: 2px; overflow-x: auto; }
  .tab {
    background: none; color: var(--muted); border: 0; border-bottom: 2px solid transparent;
    border-radius: 0; padding: 14px 12px 12px;
  }
  .tab.active { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
  .status { margin-left: auto; display: flex; gap: 12px; color: var(--muted); }
  .guest { border-radius: 0; padding: 6px 16px; }
  .notice.error { border-radius: 0; padding: 6px 16px; }
  main { flex: 1; min-height: 0; overflow: auto; }
  .pad { padding: 16px; }
  @media (max-width: 700px) {
    header { gap: 0; }
    .status { margin-left: 0; padding-bottom: 6px; }
  }
</style>
