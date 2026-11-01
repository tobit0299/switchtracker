<script lang="ts">
  import Laptop from 'carbon-icons-svelte/lib/Laptop.svelte';
  import User from 'carbon-icons-svelte/lib/User.svelte';
  import UserMultiple from 'carbon-icons-svelte/lib/UserMultiple.svelte';
  import { directorySource, profileSource, type Directory } from '../lib/cloud.svelte';

  /** Zeigt, aus welchem Profil bzw. Verzeichnis die angezeigten Daten stammen. */
  let { of, filter = '' }: { of: 'jobs' | 'companies'; filter?: Directory | '' } = $props();

  const src = $derived(of === 'jobs' ? profileSource() : directorySource(filter));
</script>

<span class="source {src.kind}" title={src.detail}>
  {#if src.kind === 'guest'}<Laptop size={16} />{:else if src.kind === 'shared' || src.kind === 'mixed'}<UserMultiple size={16} />{:else}<User size={16} />{/if}
  <span class="txt">{src.label}</span>
</span>

<style>
  .source {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
    height: 24px; padding: 0 8px; border-radius: 12px; font-size: 12px; letter-spacing: 0.32px;
    background: var(--tag-gray-bg); color: var(--tag-gray-fg);
  }
  .source.shared { background: var(--tag-orange-bg); color: var(--tag-orange-fg); }
  .source.mixed { background: linear-gradient(90deg, var(--tag-blue-bg) 0 24px, var(--tag-orange-bg) 48px); color: var(--tag-orange-fg); }
  .source.profile, .source.own { background: var(--tag-blue-bg); color: var(--tag-blue-fg); }
  .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
