<script lang="ts">
  import Laptop from 'carbon-icons-svelte/lib/Laptop.svelte';
  import User from 'carbon-icons-svelte/lib/User.svelte';
  import UserMultiple from 'carbon-icons-svelte/lib/UserMultiple.svelte';
  import { directorySource, profileSource } from '../lib/cloud.svelte';

  /** Zeigt, aus welchem Profil bzw. Verzeichnis die angezeigten Daten stammen. */
  let { of }: { of: 'jobs' | 'companies' } = $props();

  const src = $derived(of === 'jobs' ? profileSource() : directorySource());
</script>

<span class="source {src.kind}" title={src.detail}>
  {#if src.kind === 'guest'}<Laptop size={16} />{:else if src.kind === 'shared'}<UserMultiple size={16} />{:else}<User size={16} />{/if}
  <span class="txt">{src.label}</span>
</span>

<style>
  .source {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
    height: 24px; padding: 0 8px; border-radius: 12px; font-size: 12px; letter-spacing: 0.32px;
    background: var(--tag-gray-bg); color: var(--tag-gray-fg);
  }
  .source.shared { background: #ffd9be; color: #5e2900; }
  .source.profile, .source.own { background: var(--tag-blue-bg); color: var(--tag-blue-fg); }
  .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Orange wie die Marker der Unternehmenskarte; dunkle Variante im dunklen Theme */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .source.shared { background: #5e2900; color: #ffd9be; }
  }
</style>
