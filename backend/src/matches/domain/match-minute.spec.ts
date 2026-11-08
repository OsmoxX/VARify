import { currentMatchMinute, isClockStopped } from './match-minute.js';

const T0 = 1_700_000_000; // początek połowy (s)
const at = (minutesAfter: number) => (T0 + minutesAfter * 60) * 1000;

describe('currentMatchMinute', () => {
  it('bez matchTime zwraca zapisaną minutę', () => {
    expect(currentMatchMinute({ minute: 23, matchTime: null, status: '1st half' }, at(10))).toBe(23);
  });

  it('1. połowa: 0 + upływ czasu', () => {
    expect(currentMatchMinute({ minute: 0, matchTime: String(T0), status: '1st half' }, at(17) + 30_000)).toBe(17);
  });

  it('2. połowa: 45 + upływ czasu', () => {
    expect(currentMatchMinute({ minute: 45, matchTime: String(T0), status: '2nd half' }, at(12))).toBe(57);
  });

  it('ujemny upływ (rozjazd zegarów) nie obniża minuty', () => {
    expect(currentMatchMinute({ minute: 45, matchTime: String(T0), status: '2nd half' }, at(-5))).toBe(45);
  });

  it('przerwa i koniec: zegar stoi', () => {
    expect(currentMatchMinute({ minute: 45, matchTime: String(T0), status: 'Halftime' }, at(30))).toBe(45);
    expect(currentMatchMinute({ minute: 45, matchTime: String(T0), status: 'Ended' }, at(300))).toBe(45);
  });

  it('twardy limit 130 min', () => {
    expect(currentMatchMinute({ minute: 45, matchTime: String(T0), status: '2nd half' }, at(10_000))).toBe(130);
  });

  it('niepoprawny matchTime → minuta bazowa', () => {
    expect(currentMatchMinute({ minute: 30, matchTime: 'abc', status: '1st half' }, at(5))).toBe(30);
  });

  it('isClockStopped rozpoznaje statusy', () => {
    expect(isClockStopped('Halftime')).toBe(true);
    expect(isClockStopped('After penalties')).toBe(true);
    expect(isClockStopped('2nd half')).toBe(false);
  });
});
