/** Pomocnicze funkcje limitów SportAPI/RapidAPI (czyste → testowalne). */

/** Klucz miesięczny UTC, np. "2026-11". */
export function monthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  /** Sekundy do resetu limitu (nagłówek x-ratelimit-requests-reset). */
  resetSeconds: number | null;
}

const asNum = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Czyta nagłówki limitu RapidAPI (klucze mogą być w dowolnym wielkości liter). */
export function parseRateLimit(headers: Record<string, unknown> | undefined): RateLimitInfo {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers ?? {})) lower[k.toLowerCase()] = v;
  return {
    limit: asNum(lower['x-ratelimit-requests-limit']),
    remaining: asNum(lower['x-ratelimit-requests-remaining']),
    resetSeconds: asNum(lower['x-ratelimit-requests-reset']),
  };
}

/** Jak długo wstrzymać wywołania, gdy plan jest wyczerpany (0 = nie wstrzymuj). Maks. 24 h. */
export function cooldownMsFor(rl: RateLimitInfo, capMs = 24 * 3600_000): number {
  if (rl.remaining === null || rl.remaining > 0) return 0;
  const ms = rl.resetSeconds !== null ? rl.resetSeconds * 1000 : 3600_000;
  return Math.min(Math.max(ms, 60_000), capMs);
}

/** Czy budżet (INCR już wykonany) został przekroczony? limit<=0 = brak budżetu. */
export function budgetExceeded(countAfterIncrement: number, limit: number): boolean {
  return limit > 0 && countAfterIncrement > limit;
}
