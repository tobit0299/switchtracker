import type { Job } from './types';

export type Tab = 'overview' | 'jobs' | 'companies' | 'settings';

/** Oberflächenzustand, der über Reiter hinweg gilt. */
export const ui = $state({
  tab: 'overview' as Tab,
  /** in der Übersicht ausgewählte Stelle */
  selectedJobId: null as string | null,
  /** geöffneter Stellen-Dialog: eine gespeicherte oder eine neue Stelle */
  jobDialog: null as { job: Job; isNew: boolean } | null,
  /** geöffneter Unternehmens-Dialog: ID oder 'new' */
  companyDialog: null as string | null,
});
