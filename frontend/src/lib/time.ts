/**
 * Czas: backend zwraca ISO UTC (z Unix startTimestamp); tu formatujemy w LOKALNEJ strefie
 * użytkownika. Dla kalendarza wysyłamy IANA tz, by "dzień" zgadzał się z lokalnym.
 */
export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatLocalTime(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** YYYY-MM-DD w lokalnej strefie (NIE toISOString — ten daje UTC i potrafi przesunąć dzień). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
