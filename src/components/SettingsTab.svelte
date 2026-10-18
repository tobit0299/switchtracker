<script lang="ts">
  import { onMount } from 'svelte';
  import { createBackup, deleteAllData, downloadJson, parseBackup, restoreBackup, type Backup } from '../lib/backup';
  import { addressKey, homeGeoRequest } from '../lib/geo/keys';
  import { clearGeoCache, regeocode } from '../lib/geo/services.svelte';
  import { deleteHome, saveHome, setSetting } from '../lib/repo';
  import { loadSampleData } from '../lib/sample';
  import { prefs, store } from '../lib/store.svelte';
  import type { Home } from '../lib/types';

  // ---------- ORS-Schlüssel ----------
  let keyInput = $state(prefs.orsKey);
  let showKey = $state(false);

  // ---------- Profil ----------
  // svelte-ignore state_referenced_locally
  let profile = $state({ ...store.profile });
  let profileSaved = $state(false);
  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    await setSetting('profile', $state.snapshot(profile));
    profileSaved = true;
    setTimeout(() => (profileSaved = false), 2000);
  }

  // ---------- Heimadressen ----------
  let editing = $state<{ id?: string; name: string; address: string } | null>(null);
  function homeGeo(h: Home) {
    const g = store.geocodeByKey.get(addressKey(h.address));
    if (!g) return { text: 'wird gesucht …', cls: 'muted' };
    return g.found ? { text: g.label, cls: 'muted' } : { text: 'Adresse nicht gefunden', cls: 'err' };
  }
  async function saveEditing(e: SubmitEvent) {
    e.preventDefault();
    if (!editing || !editing.address.trim()) return;
    const id = await saveHome({ ...editing, name: editing.name || editing.address });
    if (!store.activeHomeId) await setSetting('activeHomeId', id);
    editing = null;
  }
  async function removeHome(h: Home) {
    if (confirm(`Heimadresse „${h.name}“ löschen?`)) await deleteHome(h.id);
  }

  // ---------- Backup ----------
  let includeDocuments = $state(true);
  let pendingRestore = $state.raw<Backup | null>(null);
  let backupMsg = $state('');
  let backupErr = $state('');

  async function exportBackup() {
    const b = await createBackup(includeDocuments);
    downloadJson(b, `switchtracker-backup-${new Date().toLocaleDateString('sv-SE')}.json`);
    backupMsg = 'Backup heruntergeladen.';
  }
  async function pickBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    backupErr = ''; backupMsg = ''; pendingRestore = null;
    if (!file) return;
    try { pendingRestore = await parseBackup(file); } catch (err) { backupErr = (err as Error).message; }
  }
  async function confirmRestore() {
    if (!pendingRestore) return;
    await restoreBackup(pendingRestore);
    pendingRestore = null;
    backupMsg = 'Backup wiederhergestellt.';
  }

  async function sample() {
    await loadSampleData();
    backupMsg = 'Beispieldaten geladen. Die Adressen werden jetzt nacheinander gesucht (etwa 1 pro Sekunde).';
  }
  async function wipe() {
    if (!confirm('Wirklich alle Unternehmen, Stellen, Dokumente, Heimadressen und Einstellungen in diesem Browser löschen?')) return;
    await deleteAllData();
    backupMsg = 'Alle Daten gelöscht.';
  }

  // ---------- Speicher ----------
  let persisted = $state<boolean | null>(null);
  let usage = $state('');
  onMount(async () => {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) usage = `${(est.usage / 1024 / 1024).toFixed(1)} MB belegt`;
  });
  async function clearCache() {
    if (!confirm('Gespeicherte Koordinaten, Fahrzeiten und Routen löschen? Von Hand korrigierte Positionen bleiben erhalten. Alles wird bei Bedarf neu berechnet.')) return;
    await clearGeoCache();
  }
</script>

<div class="page">
  <section class="card">
    <h2>OpenRouteService-Schlüssel</h2>
    <p class="muted small">
      Für Fahrzeiten und Routen. Kostenlos auf <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener noreferrer">openrouteservice.org</a> erhältlich.
      Der Schlüssel bleibt nur in diesem Browser und ist nicht im Backup enthalten. Ohne Schlüssel funktionieren Karte und Luftlinie.
    </p>
    <form class="row" onsubmit={e => { e.preventDefault(); prefs.setOrsKey(keyInput); }}>
      <input class="grow" type={showKey ? 'text' : 'password'} bind:value={keyInput} placeholder="Schlüssel einfügen" autocomplete="off" />
      <button type="button" class="secondary" onclick={() => (showKey = !showKey)}>{showKey ? 'Verbergen' : 'Anzeigen'}</button>
      <button type="submit">Speichern</button>
    </form>
    <p class="small">{#if prefs.orsKey}<span class="ok">Schlüssel hinterlegt.</span>{:else}<span class="muted">Kein Schlüssel hinterlegt.</span>{/if}</p>
  </section>

  <section class="card">
    <h2>Profil</h2>
    <p class="muted small">Die Anmeldung mit eigenem Konto folgt später. Bis dahin läuft die App im Gastmodus.</p>
    <form class="grid" onsubmit={saveProfile}>
      <label class="field">Name<input bind:value={profile.name} /></label>
      <label class="field">E-Mail<input type="email" bind:value={profile.email} /></label>
      <div class="row"><button type="submit">Speichern</button>{#if profileSaved}<span class="ok small">Gespeichert</span>{/if}</div>
    </form>
  </section>

  <section class="card">
    <div class="row">
      <h2 class="grow">Heimadressen</h2>
      <button class="secondary" onclick={() => (editing = { name: '', address: '' })}>+ Heimadresse</button>
    </div>
    <p class="muted small">Fahrzeiten werden für jede Kombination aus Heimadresse und Standort gespeichert. Beim Wechsel wird nichts erneut berechnet, was schon vorliegt.</p>
    <ul class="homes">
      {#each store.homes as h (h.id)}
        {@const g = homeGeo(h)}
        <li>
          {#if editing?.id === h.id}
            <form class="row" onsubmit={saveEditing}>
              <input bind:value={editing.name} placeholder="Name" />
              <input class="grow" bind:value={editing.address} placeholder="Adresse" required />
              <button type="submit">Speichern</button>
              <button type="button" class="secondary" onclick={() => (editing = null)}>Abbrechen</button>
            </form>
          {:else}
            <div class="row">
              <div class="grow">
                <strong>{h.name}</strong>
                {#if h.id === store.activeHomeId}<span class="badge">aktiv</span>{/if}
                <div class="small">{h.address}</div>
                <div class="small {g.cls}">{g.text}</div>
              </div>
              {#if h.id !== store.activeHomeId}<button class="secondary" onclick={() => setSetting('activeHomeId', h.id)}>Aktivieren</button>{/if}
              <button class="link small" onclick={() => regeocode(homeGeoRequest(h.address))}>Erneut suchen</button>
              <button class="link small" onclick={() => (editing = { id: h.id, name: h.name, address: h.address })}>Bearbeiten</button>
              <button class="link small err" onclick={() => removeHome(h)}>Löschen</button>
            </div>
          {/if}
        </li>
      {/each}
      {#if editing && !editing.id}
        <li>
          <form class="row" onsubmit={saveEditing}>
            <input bind:value={editing.name} placeholder="Name, z. B. Zuhause" />
            <input class="grow" bind:value={editing.address} placeholder="Adresse" required />
            <button type="submit">Speichern</button>
            <button type="button" class="secondary" onclick={() => (editing = null)}>Abbrechen</button>
          </form>
        </li>
      {/if}
    </ul>
  </section>

  <section class="card">
    <h2>Backup</h2>
    <p class="muted small">
      Sichert Unternehmen, Stellen, Dokumente, Heimadressen, Einstellungen und berechnete Geodaten in einer JSON-Datei.
      Beim Wiederherstellen werden die vorhandenen Daten ersetzt.
    </p>
    <div class="row">
      <button onclick={exportBackup}>Backup herunterladen</button>
      <label class="row small"><input type="checkbox" bind:checked={includeDocuments} /> Dokumente einschließen</label>
      <span class="grow"></span>
      <label class="secondary upload">Backup wiederherstellen …<input type="file" accept="application/json,.json" onchange={pickBackup} /></label>
    </div>
    {#if pendingRestore}
      <div class="notice warn restore">
        Backup vom {new Date(pendingRestore.exportedAt).toLocaleString('de-DE')}:
        {pendingRestore.companies.length} Unternehmen, {pendingRestore.locations.length} Standorte,
        {pendingRestore.jobs.length} Stellen, {pendingRestore.documents.length} Dokumente.
        <strong>Alle aktuellen Daten werden ersetzt.</strong>
        <div class="row">
          <button onclick={confirmRestore}>Wiederherstellen</button>
          <button class="secondary" onclick={() => (pendingRestore = null)}>Abbrechen</button>
        </div>
      </div>
    {/if}
    {#if backupMsg}<p class="ok small">{backupMsg}</p>{/if}
    {#if backupErr}<p class="err small">{backupErr}</p>{/if}
  </section>

  <section class="card">
    <h2>Daten und Speicher</h2>
    <p class="small">
      {#if persisted === true}<span class="ok">Dauerhafter Speicher ist aktiv: Der Browser löscht die Daten nicht von selbst.</span>
      {:else if persisted === false}<span class="err">Dauerhafter Speicher wurde nicht gewährt. Tipp: App installieren und regelmäßig Backups machen.</span>{/if}
      {#if usage}<span class="muted"> · {usage}</span>{/if}
    </p>
    <p class="small muted">Geodaten-Cache: {store.geocodes.length} Adressen, {store.travel.length} Fahrzeiten.</p>
    <div class="row">
      <button class="secondary" onclick={sample}>Beispieldaten laden</button>
      <button class="secondary" onclick={clearCache}>Geodaten-Cache leeren</button>
      <span class="grow"></span>
      <button class="danger" onclick={wipe}>Alle Daten löschen</button>
    </div>
  </section>
</div>

<style>
  .page { padding: 16px; display: flex; flex-direction: column; gap: 16px; max-width: 900px; }
  section { display: flex; flex-direction: column; gap: 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
  .homes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .homes li { border-top: 1px solid var(--border); padding-top: 10px; }
  .badge { margin-left: 6px; }
  .upload {
    position: relative; overflow: hidden; padding: 6px 12px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--panel); cursor: pointer;
  }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .restore { display: flex; flex-direction: column; gap: 8px; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
</style>
