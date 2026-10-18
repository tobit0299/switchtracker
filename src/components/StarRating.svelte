<script lang="ts">
  let { value = $bindable(0), readonly = false, label = 'Bewertung' }: { value?: number; readonly?: boolean; label?: string } = $props();
</script>

{#if readonly}
  <span class="stars" title="{value ? `${value} von 5` : 'nicht bewertet'}" aria-label="{label}: {value} von 5">
    {#each [1, 2, 3, 4, 5] as n (n)}<span class:on={n <= value}>★</span>{/each}
  </span>
{:else}
  <span class="stars edit" role="radiogroup" aria-label={label}>
    {#each [1, 2, 3, 4, 5] as n (n)}
      <button
        type="button"
        role="radio"
        aria-checked={value === n}
        aria-label="{n} von 5"
        class:on={n <= value}
        onclick={() => (value = value === n ? 0 : n)}
      >★</button>
    {/each}
  </span>
{/if}

<style>
  .stars { color: var(--border); white-space: nowrap; letter-spacing: 1px; }
  .on { color: var(--star); }
  .edit button { background: none; border: 0; padding: 0 1px; font-size: 20px; line-height: 1; color: var(--border); }
  .edit button.on { color: var(--star); }
</style>
