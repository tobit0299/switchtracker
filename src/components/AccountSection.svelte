<script lang="ts">
  import type { Invite } from 'dexie-cloud-addon';
  import { acceptInvite, cloud, createDirectory, inviteToDirectory, login, logout, removeMember } from '../lib/cloud.svelte';

  let inviteEmail = $state('');
  let inviteName = $state('');
  let takeOverOwn = $state(false);
  let busy = $state(false);
  let message = $state('');
  let error = $state('');

  async function run(action: () => Promise<unknown>, success = '') {
    busy = true; error = ''; message = '';
    try {
      await action();
      message = success;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function confirmLogout() {
    if (!confirm('Abmelden? Dabei werden die Daten auf diesem Gerät gelöscht; sie bleiben in deinem Konto erhalten und kommen beim nächsten Anmelden wieder.')) return;
    void run(logout);
  }

  async function invite(e: SubmitEvent) {
    e.preventDefault();
    await run(() => inviteToDirectory(inviteEmail, inviteName), `Einladung an ${inviteEmail.trim()} gesendet.`);
    if (!error) { inviteEmail = ''; inviteName = ''; }
  }

  const memberStatus = (m: { accepted?: Date; rejected?: Date; userId?: string }) =>
    m.rejected ? 'abgelehnt' : m.accepted || m.userId ? 'Mitglied' : 'eingeladen';

  const syncLabel: Record<string, string> = {
    'initial': 'wird eingerichtet', 'not-in-sync': 'Änderungen ausstehend', 'pushing': 'lädt hoch',
    'pulling': 'lädt herunter', 'in-sync': 'synchronisiert', 'error': 'Fehler', 'offline': 'offline',
  };
</script>

<section class="card">
  <h2>Konto und Synchronisation</h2>

  {#if !cloud.enabled}
    <p class="muted small">In dieser Installation ist keine Synchronisation eingerichtet. Die App läuft im Gastmodus.</p>
  {:else if !cloud.loggedIn}
    <p class="small">
      Mit einem Konto werden deine Stellen, Dokumente und Heimadressen zwischen deinen Geräten synchronisiert,
      und das Unternehmensverzeichnis lässt sich mit einer zweiten Person teilen. Die Anmeldung erfolgt per E-Mail
      und Einmalcode. Beim ersten Anmelden werden die Daten aus dem Gastmodus in dein Konto übernommen.
    </p>
    <div class="row"><button disabled={busy} onclick={() => run(login)}>Anmelden</button></div>
  {:else}
    <p class="small">
      Angemeldet als <strong>{cloud.email}</strong> · Status: {syncLabel[cloud.syncPhase] ?? cloud.syncPhase}
      {#if cloud.syncError}<br /><span class="err">{cloud.syncError}</span>{/if}
    </p>

    {#each cloud.pendingInvites as inv (inv.id)}
      <div class="notice warn invite">
        <strong>{inv.invitedBy?.name || inv.invitedBy?.email || 'Jemand'}</strong> lädt dich ein in „{inv.realm?.name ?? 'geteilte Daten'}“.
        Deine bisherigen Unternehmen bleiben privat; einzelne kannst du danach unter Datenbank → Unternehmen ins gemeinsame Verzeichnis verschieben.
        <div class="row">
          <button class="sm" disabled={busy} onclick={() => run(() => acceptInvite(inv as Invite), 'Einladung angenommen.')}>Annehmen</button>
          <button class="ghost sm" disabled={busy} onclick={() => run(() => inv.reject())}>Ablehnen</button>
        </div>
      </div>
    {/each}

    <h3>Gemeinsames Unternehmensverzeichnis</h3>
    {#if !cloud.directoryRealm}
      <p class="muted small">
        Unternehmen und Standorte liegen bisher in deinem privaten Verzeichnis. Lege zusätzlich ein gemeinsames Verzeichnis an,
        um ausgewählte Unternehmen mit einer zweiten Person zu teilen; das private Verzeichnis bleibt bestehen.
        Stellen, Notizen, Dokumente und Heimadressen bleiben immer privat.
      </p>
      <label class="check small"><input type="checkbox" bind:checked={takeOverOwn} /> Alle bisherigen Unternehmen gleich ins gemeinsame Verzeichnis übernehmen</label>
      <div class="row">
        <button class="secondary" disabled={busy} onclick={() => run(() => createDirectory(takeOverOwn), 'Gemeinsames Verzeichnis angelegt. Du kannst jetzt jemanden einladen.')}>
          Gemeinsames Verzeichnis anlegen
        </button>
      </div>
    {:else}
      <p class="muted small">
        Jedes Unternehmen liegt entweder privat oder im gemeinsamen Verzeichnis. Zuordnen lässt es sich unter
        Datenbank → Unternehmen (Spalte „Verzeichnis“) oder im Unternehmensdialog.
      </p>
      <ul class="members">
        <li><span class="grow">{cloud.email} (du)</span><span class="muted small">{cloud.directoryRealm.owner === cloud.userId ? 'Eigentümer' : 'Mitglied'}</span></li>
        {#each cloud.directoryMembers.filter(m => m.email !== cloud.email) as m (m.id)}
          <li>
            <span class="grow">{m.name ? `${m.name} – ` : ''}{m.email ?? m.userId}</span>
            <span class="muted small">{memberStatus(m)}</span>
            {#if cloud.directoryRealm.owner === cloud.userId && m.id}
              <button class="link small err" disabled={busy} onclick={() => confirm(`${m.email} aus dem Verzeichnis entfernen?`) && run(() => removeMember(m.id!))}>Entfernen</button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if cloud.directoryRealm.owner === cloud.userId}
        <form class="inviteform" onsubmit={invite}>
          <input type="email" required placeholder="E-Mail der Person" bind:value={inviteEmail} aria-label="E-Mail für Einladung" />
          <input placeholder="Name (optional)" bind:value={inviteName} aria-label="Name" />
          <button type="submit" disabled={busy}>Einladen</button>
        </form>
        <p class="muted small">Die Person erhält eine E-Mail, meldet sich hier an und nimmt die Einladung in den Einstellungen an.</p>
      {/if}
    {/if}

    <div class="row logout">
      <button class="danger" disabled={busy} onclick={confirmLogout}>Abmelden</button>
    </div>
  {/if}

  {#if message}<p class="ok small">{message}</p>{/if}
  {#if error}<p class="err small">{error}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  h3 { margin-top: 8px; }
  .invite { display: flex; flex-direction: column; gap: 8px; }
  .members { list-style: none; margin: 0; padding: 0; }
  .members li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .inviteform { display: grid; grid-template-columns: 2fr 1fr auto; gap: 1px; }
  .logout { margin-top: 8px; }
  .check { display: flex; align-items: center; gap: 8px; }
  @media (max-width: 600px) { .inviteform { grid-template-columns: 1fr; } }
</style>
