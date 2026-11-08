import { addDays, dayBoundsUtc, isValidIsoDate, isValidTimeZone, todayIn, tzOffsetMinutes, unixToDate, zonedMidnightUtc } from './timezone.js';

describe('unixToDate', () => {
  it('timestamp (s) → ten sam instant UTC, bez sztywnego +2h', () => {
    expect(unixToDate(1_700_000_000)!.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });
  it('niepoprawne wartości → null', () => {
    for (const v of [null, undefined, 0, -5, NaN, '123', {}]) expect(unixToDate(v)).toBeNull();
  });
});

describe('walidacja', () => {
  it('stref', () => { expect(isValidTimeZone('Europe/Warsaw')).toBe(true); expect(isValidTimeZone('Mars/Base')).toBe(false); });
  it('dat', () => {
    expect(isValidIsoDate('2026-11-07')).toBe(true);
    for (const d of ['2026-13-01', '2026-02-30', '07-11-2026', '', 'abc']) expect(isValidIsoDate(d)).toBe(false);
  });
});

describe('tzOffsetMinutes', () => {
  it('Warszawa: zima +60, lato +120', () => {
    expect(tzOffsetMinutes('Europe/Warsaw', new Date('2026-01-15T12:00:00Z'))).toBe(60);
    expect(tzOffsetMinutes('Europe/Warsaw', new Date('2026-07-15T12:00:00Z'))).toBe(120);
  });
  it('Nowy Jork i UTC', () => {
    expect(tzOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(tzOffsetMinutes('UTC', new Date('2026-01-15T12:00:00Z'))).toBe(0);
  });
});

describe('dayBoundsUtc', () => {
  it('Warszawa zimą: dzień zaczyna się 23:00 UTC dnia poprzedniego', () => {
    const { start, end } = dayBoundsUtc('2026-01-15', 'Europe/Warsaw');
    expect(start.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-15T23:00:00.000Z');
  });

  it('mecz 23:30 UTC należy do NASTĘPNEGO dnia w Warszawie', () => {
    const kickoff = new Date('2026-01-15T23:30:00Z');
    const d15 = dayBoundsUtc('2026-01-15', 'Europe/Warsaw');
    const d16 = dayBoundsUtc('2026-01-16', 'Europe/Warsaw');
    expect(kickoff >= d15.start && kickoff < d15.end).toBe(false);
    expect(kickoff >= d16.start && kickoff < d16.end).toBe(true);
  });

  it('dzień zmiany czasu ma 23 h (marzec) i 25 h (październik)', () => {
    const spring = dayBoundsUtc('2026-03-29', 'Europe/Warsaw');
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const autumn = dayBoundsUtc('2026-10-25', 'Europe/Warsaw');
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });

  it('Nowy Jork: wieczór 20:00 lokalnie to kolejny dzień UTC, ale ten sam dzień lokalny', () => {
    const { start, end } = dayBoundsUtc('2026-11-07', 'America/New_York');
    const evening = new Date('2026-11-08T01:00:00Z'); // 20:00 EST 7 listopada
    expect(evening >= start && evening < end).toBe(true);
  });

  it('UTC jest identyczne z dniem kalendarzowym', () => {
    const { start, end } = dayBoundsUtc('2026-06-01', 'UTC');
    expect(start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('zonedMidnightUtc spójne z dayBounds', () => {
    expect(zonedMidnightUtc('2026-07-01', 'Europe/Warsaw').toISOString()).toBe('2026-06-30T22:00:00.000Z');
  });
});

describe('daty pomocnicze', () => {
  it('todayIn zależy od strefy', () => {
    const now = new Date('2026-11-07T23:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-11-07');
    expect(todayIn('Europe/Warsaw', now)).toBe('2026-11-08');
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-11-07');
  });
  it('addDays przez granicę miesiąca/roku', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
