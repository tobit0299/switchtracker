<script lang="ts">
  import type { ColumnKey } from '../lib/columns';
  import { deadlineClass, fmtDate, fmtDuration, fmtKm } from '../lib/format';
  import type { JobRow } from '../lib/store.svelte';
  import { countryLabel, statusLabel, workModelLabel } from '../lib/types';
  import StarRating from './StarRating.svelte';

  /** Inhalt einer Tabellenzelle; die <td> selbst setzt die Tabelle. */
  let { row: r, col, subline = false }: { row: JobRow; col: ColumnKey; subline?: boolean } = $props();
</script>

{#if col === 'title'}
  <div class="title">
    {r.job.title || '(ohne Titel)'}
    {#if r.job.url}<a href={r.job.url} target="_blank" rel="noopener noreferrer" onclick={e => e.stopPropagation()} title="Stellenanzeige öffnen">↗</a>{/if}
  </div>
  {#if subline}
    <div class="sub">
      {r.company?.name ?? 'Kein Unternehmen'}{#if r.location} · {r.location.city}{:else if r.job.workModel === 'homeoffice'} · Homeoffice{/if}
    </div>
  {/if}
{:else if col === 'company'}{r.company?.name ?? ''}
{:else if col === 'city'}{r.location?.city ?? ''}
{:else if col === 'state'}{r.state}
{:else if col === 'country'}{r.location ? countryLabel(r.location.country) : ''}
{:else if col === 'status'}<span class="badge s-{r.job.status}">{statusLabel(r.job.status)}</span>
{:else if col === 'relevance'}<StarRating value={r.job.relevance} readonly label="Relevanz Stelle" />
{:else if col === 'rating'}{#if r.company}<StarRating value={r.company.rating} readonly label="Bewertung Unternehmen" />{/if}
{:else if col === 'deadline'}<span class={deadlineClass(r.job.deadline)}>{fmtDate(r.job.deadline)}</span>
{:else if col === 'followUp'}<span class={deadlineClass(r.job.followUp)}>{fmtDate(r.job.followUp)}</span>
{:else if col === 'air'}{r.location ? fmtKm(r.airKm) : ''}
{:else if col === 'travel'}{r.travel ? (r.travel.reachable ? fmtDuration(r.travel.durationS) : 'keine Route') : r.location ? '–' : ''}
{:else if col === 'workModel'}{workModelLabel(r.job.workModel)}
{:else if col === 'industry'}{r.company?.industry ?? ''}
{/if}

<style>
  .title { font-weight: 600; }
  .title a { text-decoration: none; margin-left: 4px; }
  .sub { font-size: 12px; color: var(--text-secondary); }
</style>
