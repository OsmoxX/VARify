import { parseStats } from './stats.js';
import { cardColor, formattedTime, shouldShowEvent, type EventLike } from './event-view.js';

describe('parseStats', () => {
  const raw = [
    {
      period: 'ALL',
      groups: [
        {
          statisticsItems: [
            { name: 'Ball possession', home: '60%', away: '40%', homeValue: 60, awayValue: 40 },
            { name: 'Shots', homeValue: 0, awayValue: 0 },
            { name: 'Corners', homeValue: 3, awayValue: 1 },
          ],
        },
      ],
    },
  ];

  it('liczy procenty i rozpoznaje posiadanie piłki', () => {
    const [period] = parseStats(raw);
    expect(period!.period).toBe('ALL');
    expect(period!.items[0]).toMatchObject({ homePct: 60, awayPct: 40, isPossession: true, home: '60%' });
    expect(period!.items[2]).toMatchObject({ homePct: 75, awayPct: 25, isPossession: false });
  });

  it('0:0 → 50/50 (bez dzielenia przez zero)', () => {
    expect(parseStats(raw)[0]!.items[1]).toMatchObject({ homePct: 50, awayPct: 50 });
  });

  it('niepoprawne dane → pusta lista', () => {
    expect(parseStats(null)).toEqual([]);
    expect(parseStats({})).toEqual([]);
    expect(parseStats([{}])).toEqual([{ period: 'ALL', items: [] }]);
  });
});

const ev = (o: Partial<EventLike>): EventLike => ({ incidentType: 'goal', time: 10, addedTime: 0, text: null, ...o });

describe('formattedTime', () => {
  it('doliczony czas', () => expect(formattedTime(ev({ time: 90, addedTime: 3 }))).toBe('90+3'));
  it('zwykła minuta', () => expect(formattedTime(ev({ time: 33 }))).toBe('33'));
  it('markery okresów i injuryTime bez czasu', () => {
    expect(formattedTime(ev({ incidentType: 'period' }))).toBe('');
    expect(formattedTime(ev({ incidentType: 'injuryTime' }))).toBe('');
  });
  it('addedTime >= 900 (stary marker) ignorowany', () => expect(formattedTime(ev({ time: 45, addedTime: 999 }))).toBe('45'));
});

describe('shouldShowEvent', () => {
  it('zdarzenia inne niż markery zawsze widoczne', () => expect(shouldShowEvent(ev({}), '1st half', 1)).toBe(true));
  it('HT ukryty w 1. połowie', () =>
    expect(shouldShowEvent(ev({ incidentType: 'period', text: 'HT', time: 45 }), '1st half', 40)).toBe(false));
  it('FT ukryty w trakcie meczu', () => {
    for (const s of ['1st half', '2nd half', 'halftime']) {
      expect(shouldShowEvent(ev({ incidentType: 'period', text: 'FT', time: 90 }), s, 80)).toBe(false);
    }
  });
  it('inny marker pokazany dopiero gdy minuta meczu go dogoni', () => {
    const m = ev({ incidentType: 'period', text: 'ET', time: 105 });
    expect(shouldShowEvent(m, 'extra time', 100)).toBe(false);
    expect(shouldShowEvent(m, 'extra time', 105)).toBe(true);
  });
});

describe('cardColor', () => {
  it('mapuje klasy kartek', () => {
    expect(cardColor('yellow', 'card')).toBe('yellow');
    expect(cardColor('yellowRed', 'card')).toBe('yellow-red');
    expect(cardColor('red', 'card')).toBe('red');
    expect(cardColor(null, 'card')).toBe('yellow');
    expect(cardColor('red', 'goal')).toBeNull();
  });
});
