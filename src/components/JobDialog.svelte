<script lang="ts">
  import { liveQuery } from 'dexie';
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import { fmtBytes, fmtDuration, fmtKm } from '../lib/format';
  import { locationAddress } from '../lib/geo/keys';
  import { addDocument, deleteDocument, deleteJob, saveJob } from '../lib/repo';
  import { store } from '../lib/store.svelte';
  import { STATUSES, WORK_MODELS, type Job, type JobDocument } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import StarRating from './StarRating.svelte';

  let { initial, isNew, onclose }: { initial: Job; isNew: boolean; onclose: () => void } = $props();

  // Arbeitskopie; gespeichert wird erst mit „Speichern“
  // svelte-ignore state_referenced_locally
  let job = $state<Job>({ ...initial });
  let dialog: HTMLDialogElement;
  // svelte-ignore state_referenced_locally
  let saved = $state(!isNew);
  let error = $state('');

  const companyLocations = $derived(job.companyId ? store.locations.filter(l => l.companyId === job.companyId) : []);
  const location = $derived(job.locationId ? store.locationById.get(job.locationId) : undefined);
  const travel = $derived(store.travelForLocation(location));
  const airKm = $derived(store.airKmForLocation(location));

  // Dokumente live aus der Datenbank (erst nach dem ersten Speichern möglich)
  let documents = $state.raw<JobDocument[]>([]);
  onMount(() => {
    dialog.showModal();
    const sub = liveQuery(() => db.documents.where('jobId').equals(job.id).toArray()).subscribe(v => (documents = v));
    return () => sub.unsubscribe();
  });

  function onCompanyChange() {
    // Standort passt nur, wenn er zum gewählten Unternehmen gehört
    if (!companyLocations.some(l => l.id === job.locationId)) {
      job.locationId = companyLocations.length === 1 ? companyLocations[0].id : null;
    }
  }

  async function save(close: boolean) {
    if (!job.title.trim()) { error = 'Bitte einen Titel eingeben.'; return; }
    error = '';
    await saveJob($state.snapshot(job));
    saved = true;
    if (close) onclose();
  }

  async function remove() {
    if (!confirm(`Stelle „${job.title || 'ohne Titel'}“ samt Dokumenten löschen?`)) return;
    await deleteJob(job.id);
    if (ui.selectedJobId === job.id) ui.selectedJobId = null;
    onclose();
  }

  async function upload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (!saved) await save(false);
    if (!saved) return;
    for (const f of input.files ?? []) await addDocument(job.id, f);
    input.value = '';
  }

  function openDoc(d: JobDocument) {
    const url = URL.createObjectURL(d.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadDoc(d: JobDocument) {
    const url = URL.createObjectURL(d.blob);
    const a = document.createElement('a');
    a.href = url; a.download = d.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeDoc(d: JobDocument) {
    if (confirm(`Dokument „${d.name}“ löschen?`)) await deleteDocument(d.id);
  }
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="job-dialog-title">
  <form class="body" onsubmit={e => { e.preventDefault(); void save(true); }}>
    <header class="row">
      <h2 id="job-dialog-title" class="grow">{isNew ? 'Neue Stelle' : 'Stellendetails'}</h2>
      <button type="button" class="link" aria-label="Schließen" onclick={() => dialog.close()}>✕</button>
    </header>

    <div class="grid">
      <label class="field wide">Titel<input bind:value={job.title} required /></label>

      <label class="field">Unternehmen
        <select bind:value={job.companyId} onchange={onCompanyChange}>
          <option value={null}>– kein Unternehmen –</option>
          {#each store.companies as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <label class="field">Standort
        <select bind:value={job.locationId} disabled={!job.companyId}>
          <option value={null}>– kein Standort –</option>
          {#each companyLocations as l (l.id)}<option value={l.id}>{l.label ? `${l.label}: ` : ''}{l.city}</option>{/each}
        </select>
      </label>

      {#if location}
        <div class="wide small muted">
          {locationAddress(location)} · Luftlinie {fmtKm(airKm)} · Fahrzeit {travel?.reachable ? `${fmtDuration(travel.durationS)} (${fmtKm(travel.distanceKm)})` : '–'}
        </div>
      {/if}
      {#if job.companyId && !companyLocations.length}
        <div class="wide small muted">Für dieses Unternehmen ist noch kein Standort angelegt (Reiter „Unternehmen“).</div>
      {/if}

      <label class="field">Status
        <select bind:value={job.status}>
          {#each STATUSES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
        </select>
      </label>
      <label class="field">Arbeitsmodell
        <select bind:value={job.workModel}>
          <option value="">– offen –</option>
          {#each WORK_MODELS as w (w.value)}<option value={w.value}>{w.label}</option>{/each}
        </select>
      </label>

      <label class="field">Frist<input type="date" bind:value={job.deadline} /></label>
      <label class="field">Wiedervorlage<input type="date" bind:value={job.followUp} /></label>

      <div class="field">
        <span>Relevanz</span>
        <StarRating bind:value={job.relevance} label="Relevanz" />
      </div>
      <label class="field">Stellenlink
        <span class="row">
          <input class="grow" type="url" placeholder="https://…" bind:value={job.url} />
          {#if job.url}<a href={job.url} target="_blank" rel="noopener noreferrer">Öffnen</a>{/if}
        </span>
      </label>

      <label class="field wide">Notizen<textarea rows="6" bind:value={job.notes} placeholder="Ansprechpartner, Eindrücke, nächste Schritte …"></textarea></label>

      <div class="wide docs">
        <div class="row">
          <h3 class="grow">Dokumente</h3>
          <label class="secondary upload">
            Datei hinzufügen
            <input type="file" multiple onchange={upload} />
          </label>
        </div>
        {#if documents.length}
          <ul>
            {#each documents as d (d.id)}
              <li class="row">
                <button type="button" class="link grow left" onclick={() => openDoc(d)}>{d.name}</button>
                <span class="muted small">{fmtBytes(d.size)}</span>
                <button type="button" class="link small" onclick={() => downloadDoc(d)}>Herunterladen</button>
                <button type="button" class="link small err" onclick={() => removeDoc(d)}>Löschen</button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">Noch keine Dokumente, z. B. die Stellenausschreibung als PDF.</p>
        {/if}
      </div>
    </div>

    {#if error}<p class="err">{error}</p>{/if}

    <footer class="row">
      {#if !isNew || saved}<button type="button" class="danger" onclick={remove}>Löschen</button>{/if}
      <span class="grow"></span>
      <button type="button" class="secondary" onclick={() => dialog.close()}>Abbrechen</button>
      <button type="submit">Speichern</button>
    </footer>
  </form>
</dialog>

<style>
  .body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  .wide { grid-column: 1 / -1; }
  .docs ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .left { text-align: left; }
  .upload {
    position: relative; overflow: hidden; padding: 6px 12px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--panel); cursor: pointer; font-size: 14px;
  }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  footer { border-top: 1px solid var(--border); padding-top: 12px; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
</style>
