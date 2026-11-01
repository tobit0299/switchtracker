import type { Job } from './types';

export type Tab = 'jobMap' | 'companyMap' | 'database' | 'settings';
export type DatabaseTab = 'jobs' | 'companies';

/** Oberflächenzustand, der über Reiter hinweg gilt. */
export const ui = $state({
  tab: 'jobMap' as Tab,
  /** Unterreiter im Bereich „Datenbank“ */
  dbTab: 'jobs' as DatabaseTab,
  /** in der Stellenkarte ausgewählte Stelle */
  selectedJobId: null as string | null,
  /** in der Unternehmenskarte ausgewählter Standort */
  selectedLocationId: null as string | null,
  /** geöffneter Stellen-Dialog: eine gespeicherte oder eine neue Stelle */
  jobDialog: null as { job: Job; isNew: boolean } | null,
  /** geöffneter Unternehmens-Dialog: ID oder 'new' */
  companyDialog: null as string | null,
});
