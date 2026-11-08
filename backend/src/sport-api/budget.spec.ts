import { budgetExceeded, cooldownMsFor, monthKey, parseRateLimit } from './budget.js';

describe('monthKey', () => {
  it('klucz miesiąca w UTC', () => {
    expect(monthKey(new Date('2026-11-08T14:00:00Z'))).toBe('2026-11');
    expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(monthKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
  it('granica miesiąca liczona w UTC, nie lokalnie', () => {
    expect(monthKey(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
    expect(monthKey(new Date('2026-11-01T00:00:01Z'))).toBe('2026-11');
  });
});

describe('parseRateLimit (nagłówki RapidAPI z prawdziwej odpowiedzi)', () => {
  const real = {
    'x-ratelimit-requests-limit': '50',
    'x-ratelimit-requests-remaining': '49',
    'x-ratelimit-requests-reset': '939155',
    'x-ratelimit-rapid-free-plans-hard-limit-limit': '500000',
  };
  it('czyta limit, pozostałe zapytania i reset', () => {
    expect(parseRateLimit(real)).toEqual({ limit: 50, remaining: 49, resetSeconds: 939155 });
  });
  it('nie zależy od wielkości liter w nagłówkach', () => {
    expect(parseRateLimit({ 'X-RateLimit-Requests-Remaining': '7' }).remaining).toBe(7);
  });
  it('brak nagłówków → null (nie zakłada wyczerpania)', () => {
    expect(parseRateLimit({})).toEqual({ limit: null, remaining: null, resetSeconds: null });
    expect(parseRateLimit(undefined).remaining).toBeNull();
  });
  it('śmieci nie dają NaN', () => {
    expect(parseRateLimit({ 'x-ratelimit-requests-remaining': 'abc' }).remaining).toBeNull();
  });
});

describe('cooldownMsFor', () => {
  it('są jeszcze zapytania → brak pauzy', () => {
    expect(cooldownMsFor({ limit: 50, remaining: 1, resetSeconds: 100 })).toBe(0);
    expect(cooldownMsFor({ limit: null, remaining: null, resetSeconds: null })).toBe(0);
  });
  it('plan wyczerpany → pauza do resetu, ale nie dłużej niż 24 h', () => {
    expect(cooldownMsFor({ limit: 50, remaining: 0, resetSeconds: 3600 })).toBe(3_600_000);
    expect(cooldownMsFor({ limit: 50, remaining: 0, resetSeconds: 939155 })).toBe(24 * 3600_000);
  });
  it('brak czasu resetu → 1 h; bardzo krótki reset → min. 1 min', () => {
    expect(cooldownMsFor({ limit: 50, remaining: 0, resetSeconds: null })).toBe(3_600_000);
    expect(cooldownMsFor({ limit: 50, remaining: 0, resetSeconds: 5 })).toBe(60_000);
  });
});

describe('budgetExceeded', () => {
  it('limit 0 / ujemny = bez budżetu', () => {
    expect(budgetExceeded(1_000_000, 0)).toBe(false);
    expect(budgetExceeded(5, -1)).toBe(false);
  });
  it('dozwolone dokładnie `limit` zapytań, następne odrzucone', () => {
    expect(budgetExceeded(45, 45)).toBe(false);
    expect(budgetExceeded(46, 45)).toBe(true);
  });
});
