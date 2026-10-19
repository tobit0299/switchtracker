<script lang="ts">
  import Add from 'carbon-icons-svelte/lib/Add.svelte';
  import { saveHome, setSetting } from '../lib/repo';
  import { store } from '../lib/store.svelte';
  import { addressKey } from '../lib/geo/keys';

  let adding = $state(false);
  let newName = $state('');
  let newAddress = $state('');

  const homeGeo = $derived(store.activeHome ? store.geocodeByKey.get(addressKey(store.activeHome.address)) : undefined);

  async function addHome(e: SubmitEvent) {
    e.preventDefault();
    if (!newAddress.trim()) return;
    const id = await saveHome({ name: newName.trim() || newAddress.trim(), address: newAddress });
    await setSetting('activeHomeId', id);
    newName = ''; newAddress = ''; adding = false;
  }
</script>

{#if adding || store.homes.length === 0}
  <form class="add" onsubmit={addHome}>
    <span class="lbl">Neue Heimadresse</span>
    <input placeholder="Name, z. B. Zuhause" bind:value={newName} aria-label="Name der Heimadresse" />
    <input placeholder="Adresse, z. B. Musterstraße 1, 50667 Köln" bind:value={newAddress} required aria-label="Heimadresse" />
    <div class="row">
      <button type="submit" class="sm">Speichern</button>
      {#if store.homes.length}<button type="button" class="ghost sm" onclick={() => (adding = false)}>Abbrechen</button>{/if}
    </div>
  </form>
{:else}
  <label class="lbl" for="home-select">Heimadresse</label>
  <div class="pick">
    <select id="home-select" value={store.activeHomeId} onchange={e => setSetting('activeHomeId', e.currentTarget.value)}>
      {#each store.homes as h (h.id)}
        <option value={h.id}>{h.name}{h.name !== h.address ? ` – ${h.address}` : ''}</option>
      {/each}
    </select>
    <button class="secondary" title="Weitere Heimadresse speichern" onclick={() => (adding = true)}><Add size={16} /> Adresse</button>
  </div>
{/if}
{#if homeGeo && !homeGeo.found}
  <div class="notice error small">Die Heimadresse wurde nicht gefunden. Bitte in den Einstellungen unter Heimadressen korrigieren.</div>
{/if}

<style>
  .lbl { display: block; font-size: 12px; letter-spacing: 0.32px; color: var(--muted); margin-bottom: 8px; }
  .pick { display: flex; }
  .pick select { flex: 1; }
  .add { display: flex; flex-direction: column; gap: 8px; }
  .add .lbl { margin-bottom: 0; }
  .notice { margin-top: 8px; }
</style>
