import { incidentEventId, mapIncident } from './incident-mapper.js';

describe('mapIncident', () => {
  it('goal: gracz, asysty, wynik i klasa', () => {
    const m = mapIncident({
      id: 11, incidentType: 'goal', incidentClass: 'penalty', time: 67, addedTime: 2, isHome: false,
      player: { name: 'Lewandowski' }, assist1: { name: 'Pedri' }, assist2: { name: 'Gavi' },
      homeScore: 1, awayScore: 2,
    });
    expect(m).toMatchObject({
      incidentType: 'goal', eventId: '11', time: 67, addedTime: 2, isHome: false,
      playerName: 'Lewandowski', assistPlayerName: 'Pedri', assist2PlayerName: 'Gavi',
      homeScore: 1, awayScore: 2, incidentClass: 'penalty',
    });
  });

  it('isHome brak → true (jak w Django), false → false', () => {
    expect(mapIncident({ id: 1, incidentType: 'goal' }).isHome).toBe(true);
    expect(mapIncident({ id: 1, incidentType: 'goal', isHome: false }).isHome).toBe(false);
  });

  it('goal: fallback na płaskie pola playerName / assist1Name', () => {
    const m = mapIncident({ id: 1, incidentType: 'goal', playerName: 'X', assist1Name: 'Y' });
    expect(m.playerName).toBe('X');
    expect(m.assistPlayerName).toBe('Y');
  });

  it('card: powód, anulowanie przez VAR', () => {
    const m = mapIncident({
      id: 2, incidentType: 'card', incidentClass: 'yellowRed', reason: 'Foul', rescinded: true,
      player: { name: 'Ramos' }, time: 80,
    });
    expect(m).toMatchObject({ incidentClass: 'yellowRed', reason: 'Foul', rescinded: true, playerName: 'Ramos' });
  });

  it('substitution: wchodzący / schodzący / kontuzja, playerName = wchodzący', () => {
    const m = mapIncident({
      id: 3, incidentType: 'substitution', playerIn: { name: 'In' }, playerOut: { name: 'Out' }, injury: true,
    });
    expect(m).toMatchObject({ playerInName: 'In', playerOutName: 'Out', playerName: 'In', injury: true });
  });

  it('substitution: fallback na playerNameIn/Out', () => {
    const m = mapIncident({ id: 3, incidentType: 'substitution', playerNameIn: 'A', playerNameOut: 'B' });
    expect(m).toMatchObject({ playerInName: 'A', playerOutName: 'B' });
  });

  it('period: tekst, wynik, isLive', () => {
    const m = mapIncident({ incidentType: 'period', text: 'HT', homeScore: 1, awayScore: 0, isLive: false, time: 45 });
    expect(m).toMatchObject({ text: 'HT', homeScore: 1, awayScore: 0, isLive: false });
  });

  it('injuryTime: length → injuryTimeLength', () => {
    expect(mapIncident({ incidentType: 'injuryTime', length: 5, time: 90 }).injuryTimeLength).toBe(5);
  });

  it('varDecision / inGamePenalty: confirmed, reason', () => {
    expect(mapIncident({ id: 5, incidentType: 'varDecision', incidentClass: 'goalCancelled', confirmed: true, player: { name: 'Z' } }))
      .toMatchObject({ confirmed: true, incidentClass: 'goalCancelled', playerName: 'Z' });
    expect(mapIncident({ id: 6, incidentType: 'inGamePenalty', incidentClass: 'missed', reason: 'saved' }))
      .toMatchObject({ incidentClass: 'missed', reason: 'saved' });
  });

  it('nieznany typ → pola domyślne bez wyjątku', () => {
    const m = mapIncident({ id: 9, incidentType: 'somethingNew', text: 'abc', player: { name: 'P' } });
    expect(m).toMatchObject({ incidentType: 'somethingNew', text: 'abc', playerName: 'P' });
  });

  it('obcina za długie nazwy do limitów kolumn (brak "Data too long")', () => {
    const m = mapIncident({ id: 1, incidentType: 'goal', player: { name: 'x'.repeat(300) } });
    expect(m.playerName).toHaveLength(100);
  });
});

describe('incidentEventId', () => {
  it('używa id z API', () => expect(incidentEventId({ id: 77, incidentType: 'goal' })).toBe('77'));

  it('period bez id → stabilny klucz (brak duplikatów przy kolejnych syncach)', () => {
    const a = incidentEventId({ incidentType: 'period', text: 'HT', time: 45 });
    const b = incidentEventId({ incidentType: 'period', text: 'HT', time: 45 });
    expect(a).toBe('period:HT');
    expect(a).toBe(b);
  });

  it('injuryTime bez id → klucz po minucie', () =>
    expect(incidentEventId({ incidentType: 'injuryTime', time: 90 })).toBe('injuryTime:90'));

  it('obiekt jako id nie daje "[object Object]"', () => {
    expect(incidentEventId({ id: { x: 1 }, incidentType: 'goal', time: 3, player: { name: 'A' } })).toBe('goal:3:0:A');
  });
});
