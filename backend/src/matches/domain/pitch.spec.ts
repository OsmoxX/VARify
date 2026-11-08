import { buildPitchData, parseFormation, ratingClass, type XiPlayer } from './pitch.js';

const p = (name: string, position: string | null, avg: string | null = null): XiPlayer => ({
  playerName: name, position, shirtNumber: null, isCaptain: false, avgRating: avg,
});

const xi442 = [
  p('GK', 'G'),
  ...['D1', 'D2', 'D3', 'D4'].map((n) => p(n, 'D')),
  ...['M1', 'M2', 'M3', 'M4'].map((n) => p(n, 'M')),
  ...['F1', 'F2'].map((n) => p(n, 'F')),
];

describe('parseFormation', () => {
  it('poprawny zapis', () => expect(parseFormation('4-2-3-1')).toEqual([4, 2, 3, 1]));
  it.each(['', null, undefined, 'abc', '4-x-2', '4--2', '0-4-6', '11-0'])('niepoprawny: %s', (f) =>
    expect(parseFormation(f as string | null | undefined)).toBeNull());
});

describe('buildPitchData', () => {
  it('4-4-2: 11 pozycji, bramkarz pierwszy', () => {
    const spots = buildPitchData(xi442, '4-4-2', true);
    expect(spots).toHaveLength(11);
    expect(spots[0]!.player.playerName).toBe('GK');
    expect(spots.filter((s) => s.left === spots[1]!.left)).toHaveLength(4); // linia obrony
  });

  it('gospodarze atakują w prawo, goście w lewo (lustro)', () => {
    const home = buildPitchData(xi442, '4-4-2', true);
    const away = buildPitchData(xi442, '4-4-2', false);
    expect(home[0]!.left).toBe(5);
    expect(away[0]!.left).toBe(95);
    expect(home.at(-1)!.left).toBe(45);
    expect(away.at(-1)!.left).toBe(55);
  });

  it('pionowe rozmieszczenie równomierne (n=2 → 33.3 / 66.7)', () => {
    const fwd = buildPitchData(xi442, '4-4-2', true).slice(-2);
    expect(fwd.map((s) => s.top)).toEqual([33.3, 66.7]);
  });

  it('formacja niezgodna z liczbą graczy → wyprowadzona z pozycji (nikt nie ginie)', () => {
    const spots = buildPitchData(xi442, '3-5-2', true); // 3+5+2=10 ale pozycje 4-4-2... sumuje się, więc zostaje
    expect(spots).toHaveLength(11);
    const bad = buildPitchData(xi442, '4-4-1', true); // suma 9 ≠ 10 → fallback po pozycjach
    expect(bad).toHaveLength(11);
    expect(bad.filter((s) => s.left === bad[1]!.left)).toHaveLength(4);
  });

  it('brak formacji → z pozycji', () => {
    expect(buildPitchData(xi442, null, true)).toHaveLength(11);
    expect(buildPitchData(xi442, 'bzdura', true)).toHaveLength(11);
  });

  it('pusta jedenastka → pusta tablica', () => expect(buildPitchData([], '4-4-2')).toEqual([]));

  it('zawodnik bez pozycji trafia do pomocy', () => {
    const xi = [p('GK', 'G'), p('D', 'D'), p('?', null), p('F', 'F')];
    expect(buildPitchData(xi, '1-1-1', true)).toHaveLength(4);
  });

  it('klasa oceny: >=7 zielona, >=6 żółta, <6 czerwona, brak → ""', () => {
    expect(ratingClass('7.4')).toBe('rating-green');
    expect(ratingClass('7.0')).toBe('rating-green');
    expect(ratingClass('6.5')).toBe('rating-yellow');
    expect(ratingClass('5.9')).toBe('rating-red');
    expect(ratingClass(null)).toBe('');
    expect(ratingClass('n/a')).toBe('rating-yellow');
  });
});
