/**
 * Retry z exponential backoff + jitter, z obsługą nagłówka Retry-After.
 *
 * Zasady (SportAPI / RapidAPI i Groq):
 *  - 429 Too Many Requests → ponawiamy tylko jeśli Retry-After mieści się w maxDelayMs,
 *    w przeciwnym razie oddajemy błąd od razu (nie blokujemy workera minutami).
 *  - 500 / 502 / 503 / 504 i błędy sieciowe (ECONNRESET, ETIMEDOUT…) → ponawiamy.
 *  - 4xx (poza 408/429) → nie ponawiamy (błąd po naszej stronie / brak danych).
 */

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Zwraca status HTTP błędu (lub undefined dla błędów sieciowych). */
  getStatus?: (err: unknown) => number | undefined;
  /** Zwraca wartość nagłówka Retry-After (sekundy lub data HTTP). */
  getRetryAfter?: (err: unknown) => string | undefined;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);

/** Rzuć z `fn`, by przerwać retry natychmiast; oryginalny błąd w `cause`. */
export class RetryAbortedError extends Error {}

export function parseRetryAfterMs(
  value: string | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export function computeBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  // "full jitter": losowo z przedziału [exp/2, exp]
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** Decyzja: czy i po jakim czasie ponowić. undefined = nie ponawiaj. */
export function retryDelayFor(
  err: unknown,
  attempt: number,
  opts: RetryOptions,
): number | undefined {
  const status = opts.getStatus?.(err);
  const random = opts.random ?? Math.random;

  if (status === 429) {
    const retryAfter = parseRetryAfterMs(opts.getRetryAfter?.(err));
    if (retryAfter === undefined) {
      return computeBackoffMs(attempt + 1, opts.baseDelayMs, opts.maxDelayMs, random);
    }
    return retryAfter <= opts.maxDelayMs ? retryAfter : undefined;
  }
  if (status === undefined || RETRYABLE_STATUSES.has(status)) {
    if (status === 503) {
      const retryAfter = parseRetryAfterMs(opts.getRetryAfter?.(err));
      if (retryAfter !== undefined) {
        return retryAfter <= opts.maxDelayMs ? retryAfter : undefined;
      }
    }
    return computeBackoffMs(attempt, opts.baseDelayMs, opts.maxDelayMs, random);
  }
  return undefined;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (err instanceof RetryAbortedError || attempt >= opts.retries) throw err;
      const delay = retryDelayFor(err, attempt, opts);
      if (delay === undefined) throw err;
      opts.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
      attempt++;
    }
  }
}
