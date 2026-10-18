export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '–';
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function fmtKm(km: number | null | undefined): string {
  if (km == null) return '–';
  return km.toLocaleString('de-DE', { maximumFractionDigits: km < 10 ? 1 : 0 }) + ' km';
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const todayIso = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in lokaler Zeit

/** Tage bis zum Datum (negativ = überfällig), null wenn kein Datum. */
export function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso + 'T00:00:00').getTime() - new Date(todayIso() + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

export function deadlineClass(iso: string): string {
  const d = daysUntil(iso);
  if (d == null) return '';
  if (d < 0) return 'overdue';
  if (d <= 7) return 'soon';
  return '';
}
