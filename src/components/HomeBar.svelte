<script lang="ts">
  import { saveHome, setSetting } from '../lib/repo';
  import { store } from '../lib/store.svelte';
  import { addressKey } from '../lib/geo/keys';

  let adding = $state(false);
  let newName = $state('');
  let newAddress = $state('');
  let radiusInput = $state<number | null>(store.radiusKm);

  const homeGeo = $derived(store.activeHome ? store.geocodeByKey.get(addressKey(store.activeHome.address)) : undefined);

  async function addHome(e: SubmitEvent) {
    e.preventDefault();
    if (!newAddress.trim()) return;
    const id = await saveHome({ name: newName.trim() || newAddress.trim(), address: newAddress });
    await setSetting('activeHomeId', id);
    newName = ''; newAddress = ''; adding = false;
  }

  function applyRadius() {
    const n = radiusInput;
    void setSetting('radiusKm', n != null && Number.isFinite(n) && n > 0 ? n : null);
  }
</script>

<div class="homebar">
  {#if adding || store.homes.length === 0}
    <form class="row grow" onsubmit={addHome}>
      <input class="name" placeholder="Name, z. B. Zuhause" bind:value={newName} />
      <input class="grow" placeholder="Heimadresse, z. B. Musterstraße 1, 50667 Köln" bind:value={newAddress} required />
      <button type="submit">Speichern</button>
      {#if store.homes.length}<button type="button" class="secondary" onclick={() => (adding = false)}>Abbrechen</button>{/if}
    </form>
  {:else}
    <label class="row grow">
      <span class="lbl">Heimadresse</span>
      <select class="grow" value={store.activeHomeId} onchange={e => setSetting('activeHomeId', e.currentTarget.value)}>
        {#each store.homes as h (h.id)}
          <option value={h.id}>{h.name}{h.name !== h.address ? ` – ${h.address}` : ''}</option>
        {/each}
      </select>
    </label>
    <button class="secondary" title="Weitere Heimadresse speichern" onclick={() => (adding = true)}>+ Adresse</button>
  {/if}

  <label class="row radius">
    <span class="lbl">Radius</span>
    <input
      type="number" min="1" step="5" placeholder="alle"
      bind:value={radiusInput} onchange={applyRadius}
      title="Luftlinie um die gewählte Heimadresse; leer = kein Radiusfilter"
    />
    <span class="muted">km Luftlinie</span>
  </label>
</div>
{#if homeGeo && !homeGeo.found}
  <div class="notice error small">Die Heimadresse wurde nicht gefunden. Bitte unter Einstellungen → Heimadressen korrigieren.</div>
{/if}

<style>
  .homebar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .lbl { font-weight: 600; white-space: nowrap; }
  .name { width: 140px; }
  .radius input { width: 80px; }
  .notice { margin-top: 6px; }
</style>
