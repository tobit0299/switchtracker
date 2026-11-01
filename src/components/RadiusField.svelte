<script lang="ts">
  import { setSetting } from '../lib/repo';
  import { store } from '../lib/store.svelte';

  function setRadius(value: string) {
    const n = parseFloat(value.replace(',', '.'));
    void setSetting('radiusKm', Number.isFinite(n) && n > 0 ? n : null);
  }
</script>

<label class="radius">
  <span class="lbl">Radius</span>
  <input
    type="number" min="1" step="5" placeholder="alle"
    value={store.radiusKm ?? ''}
    onchange={e => setRadius(e.currentTarget.value)}
    title="Luftlinie um die gewählte Heimadresse; leer = kein Radiusfilter"
  />
  <span class="muted small">km Luftlinie um die Heimadresse</span>
</label>

<style>
  .radius { display: grid; grid-template-columns: auto 96px 1fr; align-items: center; gap: 8px; }
</style>
