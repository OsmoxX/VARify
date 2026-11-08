import { hasAccess } from './tier.js';
import { parseGuestId } from './guest.js';
import { groupByLeague } from './group.js';

describe('hasAccess (hierarchia PREMIUM > PLUS > FREE)', () => {
  const cases: Array<[Parameters<typeof hasAccess>[0], 'FREE' | 'PLUS' | 'PREMIUM', boolean]> = [
    ['FREE', 'FREE', true], ['FREE', 'PLUS', false], ['FREE', 'PREMIUM', false],
    ['PLUS', 'FREE', true], ['PLUS', 'PLUS', true], ['PLUS', 'PREMIUM', false],
    ['PREMIUM', 'FREE', true], ['PREMIUM', 'PLUS', true], ['PREMIUM', 'PREMIUM', true],
    [null, 'FREE', true], [null, 'PLUS', false], [undefined, 'PREMIUM', false],
  ];
  it.each(cases)('%s wymaga %s → %s', (user, required, expected) => expect(hasAccess(user, required)).toBe(expected));
});

describe('parseGuestId', () => {
  it('akceptuje UUID v4 (case-insensitive)', () => {
    expect(parseGuestId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  });
  it.each([undefined, null, '', 'abc', '123', 'x'.repeat(200), 5, ['not-a-uuid']])('odrzuca %s', (v) =>
    expect(parseGuestId(v)).toBeNull());
  it('bierze pierwszy element tablicy nagłówków', () =>
    expect(parseGuestId(['3f2504e0-4f89-41d3-9a0c-0305e82c3301'])).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
});

describe('groupByLeague', () => {
  const L = (apiId: string, name: string) => ({ apiId, name, country: null });
  const m = (league: ReturnType<typeof L> | null, id = Math.random()) => ({ id, league });

  it('TOP w kolejności listy, potem reszta alfabetycznie', () => {
    const groups = groupByLeague([m(L('999', 'Zeta')), m(L('17', 'Premier League')), m(L('7', 'Champions League')), m(L('998', 'Alfa'))]);
    expect(groups.map((g) => g.leagueName)).toEqual(['Champions League', 'Premier League', 'Alfa', 'Zeta']);
    expect(groups.map((g) => g.isTop)).toEqual([true, true, false, false]);
  });

  it('isTop wynika z ligi, nie z pierwszego meczu', () => {
    const [g] = groupByLeague([m(L('17', 'PL')), m(L('17', 'PL'))]);
    expect(g!.matches).toHaveLength(2);
    expect(g!.isTop).toBe(true);
  });

  it('mecze bez ligi trafiają do "Unknown League"', () => {
    expect(groupByLeague([m(null)])[0]).toMatchObject({ leagueApiId: 'unknown', leagueName: 'Unknown League', isTop: false });
  });
});
