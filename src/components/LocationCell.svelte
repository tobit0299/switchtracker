<script lang="ts">
  import type { CompanyColumnKey } from '../lib/companyColumns';
  import { fmtDuration, fmtKm } from '../lib/format';
  import type { LocationRow } from '../lib/store.svelte';
  import { countryLabel } from '../lib/types';
  import StarRating from './StarRating.svelte';

  /** Inhalt einer Zelle der Unternehmenskarte; die <td> setzt die Tabelle. */
  let { row: r, col, subline = false }: { row: LocationRow; col: CompanyColumnKey; subline?: boolean } = $props();
</script>

{#if col === 'company'}
  <div class="name">{r.company?.name ?? '(unbekanntes Unternehmen)'}</div>
  {#if subline}<div class="sub">{[r.location.label, r.location.city].filter(Boolean).join(' · ')}</div>{/if}
{:else if col === 'location'}{r.location.label}
{:else if col === 'city'}{r.location.city}
{:else if col === 'state'}{r.state}
{:else if col === 'country'}{countryLabel(r.location.country)}
{:else if col === 'industry'}{r.company?.industry ?? ''}
{:else if col === 'rating'}{#if r.company}<StarRating value={r.company.rating} readonly />{/if}
{:else if col === 'jobs'}{r.jobCount || ''}
{:else if col === 'air'}{fmtKm(r.airKm)}
{:else if col === 'travel'}{r.travel ? (r.travel.reachable ? fmtDuration(r.travel.durationS) : 'keine Route') : '–'}
{/if}

<style>
  .name { font-weight: 600; }
  .sub { font-size: 12px; color: var(--text-secondary); }
</style>
