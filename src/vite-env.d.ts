/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dexie-Cloud-Datenbank, z. B. https://xxxxxxxx.dexie.cloud (optional) */
  readonly VITE_DEXIE_CLOUD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
