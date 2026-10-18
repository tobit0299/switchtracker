<script lang="ts">
  import { onMount } from 'svelte';
  import { addressKey, locationAddress, locationGeoRequest } from '../lib/geo/keys';
  import { regeocode } from '../lib/geo/services.svelte';
  import { deleteCompany, deleteLocation, emptyCompany, emptyLocation, saveCompany, saveLocation } from '../lib/repo';
  import { store } from '../lib/store.svelte';
  import { COUNTRIES, type Company, type Location } from '../lib/types';
  import StarRating from './StarRating.svelte';

  let { companyId, onclose }: { companyId: string; onclose: () => void } = $props();

  // Arbeitskopien; geschrieben wird erst beim Speichern
  // svelte-ignore state_referenced_locally
  const isNew = companyId === 'new';
  // svelte-ignore state_referenced_locally
  const original = isNew ? null : (store.companyById.get(companyId) ?? null);
  let company = $state<Company>(original ? { ...original } : emptyCompany());
  let locations = $state<Location[]>(original ? store.locations.filter(l => l.companyId === original.id).map(l => ({ ...l })) : []);
  const removedLocationIds: string[] = [];
  let dialog: HTMLDialogElement;
  let error = $state('');

  onMount(() => dialog.showModal());

  const normName = (s: string) => s.toLowerCase().replace(/\b(gmbh|ag|se|kg|ohg|b\.?v\.?|co\.?|& co\.?|mbh|e\.?v\.?)\b/g, '').replace(/[^a-z0-9äöüß]/g, '');

  // Dublettenhinweis: anderes Unternehmen mit gleichem bereinigten Namen
  const duplicateCompany = $derived.by(() => {
    const n = normName(company.name);
    return n.length > 2 ? store.companies.find(c => c.id !== company.id && normName(c.name) === n) : undefined;
  });

  // Dublettenhinweis: gleiche Adresse bei einem anderen Unternehmen oder doppelt in dieser Liste
  function duplicateAddress(l: Location): string {
    const key = addressKey(locationAddress(l));
    if (!l.street || !l.city) return '';
    if (locations.some(o => o.id !== l.id && addressKey(locationAddress(o)) === key)) return 'Diese Adresse steht hier doppelt.';
    const other = store.locations.find(o => o.companyId !== company.id && addressKey(locationAddress(o)) === key);
    return other ? `Gleiche Adresse wie bei „${store.companyById.get(other.companyId)?.name ?? 'anderem Unternehmen'}“.` : '';
  }

  function geoStatus(l: Location): { text: string; cls: string; retry: boolean } {
    const g = store.geocodeByKey.get(addressKey(locationAddress(l)));
    if (!l.city && !l.street) return { text: '', cls: '', retry: false };
    if (!g) return { text: 'Wird nach dem Speichern gesucht', cls: 'muted', retry: false };
    if (!g.found) return { text: 'Adresse nicht gefunden', cls: 'err', retry: true };
    return { text: g.manual ? 'Position von Hand korrigiert' : 'Gefunden', cls: 'ok', retry: true };
  }

  function addLocation() {
    locations.push(emptyLocation(company.id));
  }

  function removeLocation(i: number) {
    const l = locations[i];
    const jobs = store.jobs.filter(j => j.locationId === l.id).length;
    if (jobs && !confirm(`An diesem Standort hängen ${jobs} Stelle(n). Sie bleiben erhalten, verlieren aber den Standort. Fortfahren?`)) return;
    if (!isNew) removedLocationIds.push(l.id);
    locations.splice(i, 1);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!company.name.trim()) { error = 'Bitte einen Namen eingeben.'; return; }
    await saveCompany($state.snapshot(company));
    for (const id of removedLocationIds) await deleteLocation(id);
    for (const l of $state.snapshot(locations)) {
      if (l.street || l.city || l.zip) await saveLocation({ ...l, companyId: company.id });
    }
    onclose();
  }

  async function remove() {
    const jobs = store.jobs.filter(j => j.companyId === company.id).length;
    const msg = `Unternehmen „${company.name}“ mit allen Standorten löschen?` + (jobs ? `\n${jobs} Stelle(n) bleiben erhalten, aber ohne Unternehmen.` : '');
    if (!confirm(msg)) return;
    await deleteCompany(company.id);
    onclose();
  }
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="company-dialog-title">
  <form class="body" onsubmit={save}>
    <header class="row">
      <h2 id="company-dialog-title" class="grow">{isNew ? 'Neues Unternehmen' : company.name}</h2>
      <button type="button" class="link" aria-label="Schließen" onclick={() => dialog.close()}>✕</button>
    </header>

    <div class="grid">
      <label class="field wide">Name<input bind:value={company.name} required /></label>
      {#if duplicateCompany}
        <div class="wide notice warn small">Mögliche Dublette: „{duplicateCompany.name}“ existiert bereits.</div>
      {/if}
      <label class="field">Branche
        <input bind:value={company.industry} list="industries" />
        <datalist id="industries">
          {#each [...new Set(store.companies.map(c => c.industry).filter(Boolean))] as i (i)}<option value={i}></option>{/each}
        </datalist>
      </label>
      <div class="field"><span>Bewertung</span><StarRating bind:value={company.rating} /></div>
      <label class="field wide">Website<input type="url" placeholder="https://…" bind:value={company.website} /></label>
      <label class="field wide">Notizen<textarea rows="3" bind:value={company.notes}></textarea></label>
    </div>

    <div class="row">
      <h3 class="grow">Standorte</h3>
      <button type="button" class="secondary" onclick={addLocation}>+ Standort</button>
    </div>
    {#each locations as l, i (l.id)}
      {@const geo = geoStatus(l)}
      {@const dup = duplicateAddress(l)}
      <fieldset class="loc">
        <div class="locgrid">
          <label class="field">Bezeichnung<input bind:value={l.label} placeholder="z. B. Zentrale" /></label>
          <label class="field span2">Straße und Hausnummer<input bind:value={l.street} /></label>
          <label class="field">PLZ<input bind:value={l.zip} /></label>
          <label class="field">Ort<input bind:value={l.city} /></label>
          <label class="field">Land
            <select bind:value={l.country}>
              {#each COUNTRIES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
            </select>
          </label>
          <label class="field" title="Leer lassen, um das Bundesland aus der Adresssuche zu übernehmen">Bundesland
            <input bind:value={l.state} placeholder={store.stateForLocation(l) || 'automatisch'} />
          </label>
        </div>
        <div class="row small">
          {#if geo.text}<span class={geo.cls}>{geo.text}</span>{/if}
          {#if geo.retry}<button type="button" class="link small" onclick={() => regeocode(locationGeoRequest(l))}>Erneut suchen</button>{/if}
          {#if dup}<span class="warn-text">{dup}</span>{/if}
          <span class="grow"></span>
          <button type="button" class="link small err" onclick={() => removeLocation(i)}>Standort entfernen</button>
        </div>
      </fieldset>
    {:else}
      <p class="muted small">Noch kein Standort. Ohne Standort erscheinen Stellen dieses Unternehmens nicht auf der Karte.</p>
    {/each}

    {#if error}<p class="err">{error}</p>{/if}

    <footer class="row">
      {#if !isNew}<button type="button" class="danger" onclick={remove}>Löschen</button>{/if}
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
  .loc { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .locgrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 12px; }
  .span2 { grid-column: span 2; }
  .warn-text { color: var(--warn); }
  footer { border-top: 1px solid var(--border); padding-top: 12px; }
  @media (max-width: 600px) {
    .grid, .locgrid { grid-template-columns: 1fr; }
    .span2 { grid-column: auto; }
  }
</style>
