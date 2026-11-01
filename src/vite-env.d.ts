/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dexie-Cloud-Datenbank, z. B. https://xxxxxxxx.dexie.cloud (optional) */
  readonly VITE_DEXIE_CLOUD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versionsangaben, beim Build von vite.config.ts eingesetzt */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_DATE__: string;
