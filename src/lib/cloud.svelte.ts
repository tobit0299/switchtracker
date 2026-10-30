import { liveQuery } from 'dexie';
import type { DBRealm, DBRealmMember, Invite } from 'dexie-cloud-addon';
import { CLOUD_URL, db } from './db';

/** Name des Realms, in dem das gemeinsame Unternehmensverzeichnis liegt */
export const DIRECTORY_REALM_NAME = 'Unternehmensverzeichnis';

/**
 * Anmeldung und Synchronisation über Dexie Cloud. Ohne CLOUD_URL bleibt
 * `enabled` false und die App läuft ausschließlich im Gastmodus.
 */
class Cloud {
  enabled = !!CLOUD_URL;
  loggedIn = $state(false);
  userId = $state('');
  email = $state('');
  syncPhase = $state('');
  syncError = $state('');
  invites = $state.raw<Invite[]>([]);
  realms = $state.raw<DBRealm[]>([]);
  members = $state.raw<DBRealmMember[]>([]);

  /** Realm des gemeinsamen Unternehmensverzeichnisses, falls vorhanden */
  directoryRealm = $derived(this.realms.find(r => r.name === DIRECTORY_REALM_NAME) ?? null);
  directoryMembers = $derived(this.directoryRealm ? this.members.filter(m => m.realmId === this.directoryRealm!.realmId) : []);
  pendingInvites = $derived(this.invites.filter(i => !i.accepted && !i.rejected));
}

export const cloud = new Cloud();

export function startCloud() {
  if (!cloud.enabled) return;
  db.cloud.currentUser.subscribe(u => {
    cloud.loggedIn = !!u.isLoggedIn;
    cloud.userId = u.userId ?? '';
    cloud.email = u.email ?? '';
  });
  db.cloud.syncState.subscribe(s => {
    cloud.syncPhase = s.phase;
    cloud.syncError = s.error?.message ?? '';
  });
  db.cloud.invites.subscribe(v => (cloud.invites = v));
  liveQuery(() => db.realms.toArray()).subscribe({ next: v => (cloud.realms = v), error: e => console.error(e) });
  liveQuery(() => db.members.toArray()).subscribe({ next: v => (cloud.members = v), error: e => console.error(e) });
}

/** Öffnet den Anmeldedialog von Dexie Cloud (E-Mail + Einmalcode). */
export async function login() {
  await db.cloud.login();
}

/** Meldet ab. Dexie Cloud leert dabei die lokale Datenbank dieses Geräts. */
export async function logout() {
  await db.cloud.logout();
}

/** Realm-ID, in die neue Unternehmen und Standorte gehören (undefined = privat bzw. Gastmodus). */
export function directoryRealmId(): string | undefined {
  return cloud.loggedIn ? cloud.directoryRealm?.realmId : undefined;
}

/** Verschiebt alle eigenen (privaten) Unternehmen und Standorte in den gemeinsamen Realm. */
async function moveDirectoryInto(realmId: string) {
  const isPrivate = (o: { realmId?: string }) => !o.realmId || o.realmId === cloud.userId;
  await db.transaction('rw', db.companies, db.locations, async () => {
    await db.companies.filter(isPrivate).modify({ realmId });
    await db.locations.filter(isPrivate).modify({ realmId });
  });
}

/** Legt das gemeinsame Unternehmensverzeichnis an und übernimmt die eigenen Unternehmen. */
export async function createDirectory() {
  if (cloud.directoryRealm) return;
  const realmId = await db.realms.add({ name: DIRECTORY_REALM_NAME });
  await moveDirectoryInto(realmId);
}

/** Lädt eine Person per E-Mail ins gemeinsame Verzeichnis ein (volle Bearbeitungsrechte). */
export async function inviteToDirectory(email: string, name = '') {
  const realm = cloud.directoryRealm;
  if (!realm) throw new Error('Es gibt noch kein gemeinsames Unternehmensverzeichnis.');
  const clean = email.trim().toLowerCase();
  if (cloud.directoryMembers.some(m => m.email?.toLowerCase() === clean)) throw new Error('Diese Person ist bereits eingeladen.');
  await db.members.add({ realmId: realm.realmId, email: clean, name: name.trim() || undefined, invite: true, permissions: { manage: '*' } });
}

export async function removeMember(id: string) {
  await db.members.delete(id);
}

/** Nimmt eine Einladung an; eigene Unternehmen wandern dann ins gemeinsame Verzeichnis. */
export async function acceptInvite(invite: Invite) {
  await invite.accept();
  if (invite.realm?.name === DIRECTORY_REALM_NAME) await moveDirectoryInto(invite.realmId);
}
