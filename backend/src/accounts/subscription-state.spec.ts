import { idOf, parseUserId, planToTier, tierForSubscription } from './subscription-state.js';

describe('tierForSubscription', () => {
  it.each([['active'], ['trialing'], ['past_due']])('%s zachowuje opłacony plan', (s) => {
    expect(tierForSubscription(s, 'PREMIUM')).toBe('PREMIUM');
    expect(tierForSubscription(s, 'PLUS')).toBe('PLUS');
  });
  it.each([['unpaid'], ['canceled'], ['incomplete_expired'], ['paused']])('%s → FREE', (s) => {
    expect(tierForSubscription(s, 'PREMIUM')).toBe('FREE');
  });
  it('incomplete / nieznany → bez zmiany', () => {
    expect(tierForSubscription('incomplete', 'PLUS')).toBeUndefined();
    expect(tierForSubscription('whatever', 'PLUS')).toBeUndefined();
  });
});

describe('helpers', () => {
  it('planToTier', () => {
    expect(planToTier('plus')).toBe('PLUS');
    expect(planToTier('premium')).toBe('PREMIUM');
    expect(planToTier('admin')).toBeUndefined();
    expect(planToTier(undefined)).toBeUndefined();
  });
  it('idOf obsługuje id i obiekt (expand)', () => {
    expect(idOf('cus_1')).toBe('cus_1');
    expect(idOf({ id: 'cus_2' })).toBe('cus_2');
    expect(idOf(null)).toBeNull();
    expect(idOf({})).toBeNull();
  });
  it('parseUserId odrzuca śmieci', () => {
    expect(parseUserId('42')).toBe(42);
    for (const v of ['0', '-1', 'abc', '1e3', '', null, 5, '99999999999']) expect(parseUserId(v)).toBeNull();
  });
});
