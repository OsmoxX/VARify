/**
 * Konwersje stref czasowych.
 *
 * SportAPI zwraca `startTimestamp` jako Unix epoch (sekundy, UTC).
 * Zapisujemy go 1:1 jako UTC DateTime (Django dodawało błędnie +2h na sztywno,
 * co psuło czas w zimie i dla użytkowników spoza Polski). Frontend formatuje
 * w lokalnej strefie przeglądarki; backend potrzebuje strefy jedynie do
 * wyznaczenia granic "dnia" w kalendarzu.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function unixToDate(ts: unknown): Date | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts * 1000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Offset strefy (minuty, dodatni na wschód od UTC) w danym momencie. */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Północ danej daty kalendarzowej w strefie `timeZone`, jako instant UTC. */
export function zonedMidnightUtc(date: string, timeZone: string): Date {
  const naive = new Date(`${date}T00:00:00Z`);
  // dwa przebiegi — poprawne również w dniach zmiany czasu (DST)
  let guess = new Date(naive.getTime() - tzOffsetMinutes(timeZone, naive) * 60_000);
  guess = new Date(naive.getTime() - tzOffsetMinutes(timeZone, guess) * 60_000);
  return guess;
}

/** [start, end) lokalnego dnia `date` w strefie `timeZone`, w UTC. */
export function dayBoundsUtc(
  date: string,
  timeZone: string,
): { start: Date; end: Date } {
  const start = zonedMidnightUtc(date, timeZone);
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedMidnightUtc(next.toISOString().slice(0, 10), timeZone);
  return { start, end };
}

/** Dzisiejsza data (YYYY-MM-DD) w danej strefie. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
