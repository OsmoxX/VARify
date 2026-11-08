import { RetryAbortedError, computeBackoffMs, parseRetryAfterMs, retryDelayFor, withRetry, type RetryOptions } from './retry.js';

class HttpErr extends Error {
  constructor(public status?: number, public retryAfter?: string) { super(`HTTP ${status}`); }
}
const opts = (o: Partial<RetryOptions> = {}): RetryOptions => ({
  retries: 3, baseDelayMs: 100, maxDelayMs: 1000,
  getStatus: (e) => (e as HttpErr).status, getRetryAfter: (e) => (e as HttpErr).retryAfter,
  sleep: () => Promise.resolve(), random: () => 0.5, ...o,
});

describe('parseRetryAfterMs', () => {
  it('sekundy', () => expect(parseRetryAfterMs('3')).toBe(3000));
  it('data HTTP', () => expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000));
  it('śmieci / brak', () => { expect(parseRetryAfterMs('abc')).toBeUndefined(); expect(parseRetryAfterMs(undefined)).toBeUndefined(); });
  it('data w przeszłości → 0', () => expect(parseRetryAfterMs(new Date(1_000).toUTCString(), 9_000)).toBe(0));
});

describe('computeBackoffMs', () => {
  it('rośnie wykładniczo i jest ograniczony', () => {
    const r = () => 1;
    expect(computeBackoffMs(0, 100, 1000, r)).toBe(100);
    expect(computeBackoffMs(2, 100, 1000, r)).toBe(400);
    expect(computeBackoffMs(10, 100, 1000, r)).toBe(1000);
  });
  it('jitter w przedziale [exp/2, exp]', () => {
    expect(computeBackoffMs(2, 100, 1000, () => 0)).toBe(200);
  });
});

describe('retryDelayFor', () => {
  it('503 → ponawia z backoffem', () => expect(retryDelayFor(new HttpErr(503), 0, opts())).toBeGreaterThan(0));
  it('503 z Retry-After w limicie → dokładnie tyle', () => expect(retryDelayFor(new HttpErr(503, '1'), 0, opts())).toBe(1000));
  it('503 z Retry-After ponad limit → nie ponawia', () => expect(retryDelayFor(new HttpErr(503, '60'), 0, opts())).toBeUndefined());
  it('429 z krótkim Retry-After → czeka', () => expect(retryDelayFor(new HttpErr(429, '1'), 0, opts())).toBe(1000));
  it('429 z długim Retry-After → nie blokuje workera', () => expect(retryDelayFor(new HttpErr(429, '120'), 0, opts())).toBeUndefined());
  it('4xx (poza 408/429) → nie ponawia', () => {
    for (const s of [400, 401, 403, 404]) expect(retryDelayFor(new HttpErr(s), 0, opts())).toBeUndefined();
  });
  it('błąd sieciowy (brak statusu) → ponawia', () => expect(retryDelayFor(new HttpErr(undefined), 0, opts())).toBeGreaterThan(0));
});

describe('withRetry', () => {
  it('sukces po przejściowych 503', async () => {
    let calls = 0;
    const result = await withRetry(async () => { if (++calls < 3) throw new HttpErr(503); return 'ok'; }, opts());
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('wyczerpanie prób rzuca ostatni błąd', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new HttpErr(500); }, opts({ retries: 2 }))).rejects.toThrow('HTTP 500');
    expect(calls).toBe(3);
  });

  it('błąd nieprzejściowy nie jest ponawiany', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new HttpErr(404); }, opts())).rejects.toThrow('HTTP 404');
    expect(calls).toBe(1);
  });

  it('RetryAbortedError przerywa natychmiast', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new RetryAbortedError('stop'); }, opts())).rejects.toBeInstanceOf(RetryAbortedError);
    expect(calls).toBe(1);
  });

  it('przekazuje faktyczne opóźnienia do sleep i wywołuje onRetry', async () => {
    const delays: number[] = [];
    const onRetry = vi.fn();
    let calls = 0;
    await withRetry(async () => { if (++calls < 3) throw new HttpErr(429, '1'); return 1; },
      opts({ sleep: (ms) => { delays.push(ms); return Promise.resolve(); }, onRetry }));
    expect(delays).toEqual([1000, 1000]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
