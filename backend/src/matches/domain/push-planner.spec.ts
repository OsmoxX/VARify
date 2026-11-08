import { buildIncidentBody, parseScore, planNotifications, type PlanInput } from './push-planner.js';

// Mecz, o którego starcie już powiadomiono (inaczej planer słusznie doda "Match started")
const SEEN = ['seed', 'status_started'];

const goal = (id: number, time: number, h: number, a: number, extra = {}) => ({
  id, incidentType: 'goal', incidentClass: 'regular', time, isHome: true,
  player: { name: 'Scorer' }, homeScore: h, awayScore: a, ...extra,
});

const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  homeName: 'Barca', awayName: 'Real', homeScore: 0, awayScore: 0, status: '1st half',
  currentMinute: 30, notifiedEventIds: SEEN, lastNotifiedScore: '0:0', incidents: [], ...o,
});

describe('planNotifications — deduplikacja', () => {
  it('nowy gol → jedno powiadomienie i zapamiętane id', () => {
    const plan = planNotifications(base({ homeScore: 1, currentMinute: 31, incidents: [goal(1, 30, 1, 0)] }));
    expect(plan.notifications).toHaveLength(1);
    expect(plan.notifications[0]).toMatchObject({ kind: 'incident', eventType: 'goal', homeScore: 1 });
    expect(plan.newNotifiedIds).toContain('1');
    expect(plan.lastNotifiedScore).toBe('1:0');
    expect(plan.dirty).toBe(true);
  });

  it('ten sam incydent drugi raz → cisza (notified_event_ids)', () => {
    const input = base({ homeScore: 1, lastNotifiedScore: '1:0', notifiedEventIds: [...SEEN, '1'], incidents: [goal(1, 30, 1, 0)] });
    const plan = planNotifications(input);
    expect(plan.notifications).toHaveLength(0);
    expect(plan.dirty).toBe(false);
  });

  it('idempotencja: ponowne uruchomienie ze stanem z poprzedniego planu nie wysyła nic', () => {
    const first = planNotifications(base({ homeScore: 1, currentMinute: 31, incidents: [goal(1, 30, 1, 0)] }));
    const second = planNotifications(
      base({ homeScore: 1, currentMinute: 31, incidents: [goal(1, 30, 1, 0)],
        notifiedEventIds: [...SEEN, ...first.newNotifiedIds], lastNotifiedScore: first.lastNotifiedScore }),
    );
    expect(second.notifications).toHaveLength(0);
  });

  it('pomija typy poza goal/card/var/penalty (zmiany, okresy)', () => {
    const plan = planNotifications(base({ incidents: [{ id: 5, incidentType: 'substitution', time: 20 }, { id: 6, incidentType: 'period', time: 45 }] }));
    expect(plan.notifications).toHaveLength(0);
    expect(plan.newNotifiedIds).toEqual([]);
  });

  it('incydent bez id jest ignorowany', () => {
    expect(planNotifications(base({ incidents: [{ incidentType: 'goal', time: 3 }] })).notifications).toHaveLength(0);
  });

  it('kartki i VAR mają własne etykiety', () => {
    const plan = planNotifications(base({
      currentMinute: 60,
      incidents: [
        { id: 7, incidentType: 'card', incidentClass: 'red', time: 59, player: { name: 'Ramos' }, isHome: false },
        { id: 8, incidentType: 'varDecision', incidentClass: 'goalCancelled', time: 60, isHome: true },
      ],
    }));
    expect(plan.notifications.map((n) => n.icon)).toEqual(['🟥', '❌']);
    expect(plan.notifications[0]!.body).toBe('Ramos (Real) – 59\'');
  });
});

describe('planNotifications — cold start', () => {
  const cold = (o: Partial<PlanInput>) => base({ notifiedEventIds: [], ...o });

  it('stare zdarzenia są zapamiętane, ale uciszone', () => {
    const plan = planNotifications(cold({ homeScore: 2, lastNotifiedScore: '0:0', currentMinute: 70,
      incidents: [goal(1, 10, 1, 0), goal(2, 40, 2, 0)] }));
    expect(plan.notifications).toHaveLength(0);
    expect(plan.newNotifiedIds).toEqual(expect.arrayContaining(['1', '2']));
    // Gole obsłużone (uciszone) → brak "fallbacku wynikowego" z historii
    expect(plan.lastNotifiedScore).toBe('2:0');
  });

  it('świeży gol (w oknie 2 min) przy cold-starcie JEST wysłany', () => {
    const plan = planNotifications(cold({ homeScore: 1, currentMinute: 68, incidents: [goal(9, 67, 1, 0)] }));
    expect(plan.notifications).toHaveLength(1);
  });

  it('uwzględnia doliczony czas przy ocenie wieku', () => {
    const inc = goal(3, 90, 1, 0, { addedTime: 4 }); // 90+4 = 94'
    const plan = planNotifications(cold({ homeScore: 1, currentMinute: 95, incidents: [inc] }));
    expect(plan.notifications).toHaveLength(1);
  });

  it('"Mecz się rozpoczął" nie jest wysyłany, gdy mecz trwa > 5 min', () => {
    const late = planNotifications(cold({ status: '1st half', currentMinute: 30 }));
    expect(late.notifications).toHaveLength(0);
    expect(late.newNotifiedIds).toContain('status_started');
    const fresh = planNotifications(cold({ status: '1st half', currentMinute: 1 }));
    expect(fresh.notifications[0]!.title).toContain('Match started');
  });
});

describe('planNotifications — status', () => {
  it('przerwa i koniec wysyłane raz', () => {
    const ht = planNotifications(base({ status: 'Halftime', homeScore: 1, lastNotifiedScore: '1:0' }));
    expect(ht.notifications).toHaveLength(1);
    expect(ht.notifications[0]!.body).toContain('1:0');
    const ht2 = planNotifications(base({ status: 'Halftime', homeScore: 1, lastNotifiedScore: '1:0', notifiedEventIds: [...SEEN, 'status_halftime'] }));
    expect(ht2.notifications).toHaveLength(0);

    const ft = planNotifications(base({ status: 'Ended', homeScore: 2, awayScore: 1, lastNotifiedScore: '2:1' }));
    expect(ft.notifications[0]!.title).toContain('Full time');
  });
});

describe('planNotifications — fallback wynikowy (last_notified_score)', () => {
  it('wynik wzrósł, a API incidents jeszcze pusty → push wynikowy', () => {
    const plan = planNotifications(base({ homeScore: 1, lastNotifiedScore: '0:0', incidents: [] }));
    expect(plan.notifications).toHaveLength(1);
    expect(plan.notifications[0]).toMatchObject({ kind: 'score', key: 'score:1:0' });
    expect(plan.newNotifiedIds).toContain('score:1:0');
  });

  it('spóźniony incydent tego gola NIE dubluje pusha po fallbacku', () => {
    const a = planNotifications(base({ homeScore: 1, lastNotifiedScore: '0:0', incidents: [] }));
    const b = planNotifications(base({
      homeScore: 1, lastNotifiedScore: a.lastNotifiedScore, currentMinute: 31,
      notifiedEventIds: [...SEEN, ...a.newNotifiedIds], incidents: [goal(42, 30, 1, 0)],
    }));
    expect(b.notifications).toHaveLength(0);
    expect(b.newNotifiedIds).toContain('42');
  });

  it('wynik się nie zmienił → brak fallbacku', () => {
    expect(planNotifications(base({ homeScore: 1, lastNotifiedScore: '1:0' })).notifications).toHaveLength(0);
  });

  it('spadek wyniku (gol anulowany) nie generuje "GOOOL"', () => {
    const plan = planNotifications(base({ homeScore: 0, lastNotifiedScore: '1:0' }));
    expect(plan.notifications).toHaveLength(0);
    expect(plan.lastNotifiedScore).toBe('0:0'); // baza wraca do prawdziwego stanu
    expect(plan.dirty).toBe(true);
  });

  it('po anulowaniu gola (VAR) prawdziwy gol na ten sam wynik jest ogłoszony ponownie', () => {
    // 1) fallback ogłosił 1:0 (marker score:1:0)
    const first = planNotifications(base({ homeScore: 1, lastNotifiedScore: '0:0' }));
    expect(first.newNotifiedIds).toContain('score:1:0');
    const stored = [...SEEN, ...first.newNotifiedIds];

    // 2) VAR anuluje gol → wynik 0:0, marker usunięty
    const cancelled = planNotifications(base({ homeScore: 0, lastNotifiedScore: first.lastNotifiedScore, notifiedEventIds: stored }));
    expect(cancelled.notifications).toHaveLength(0);
    expect(cancelled.removedNotifiedIds).toEqual(['score:1:0']);
    expect(cancelled.lastNotifiedScore).toBe('0:0');

    // 3) prawdziwy gol na 1:0 → powiadomienie MUSI wyjść
    const remaining = stored.filter((id) => !cancelled.removedNotifiedIds.includes(id));
    const again = planNotifications(base({ homeScore: 1, lastNotifiedScore: cancelled.lastNotifiedScore,
      notifiedEventIds: remaining, incidents: [goal(77, 55, 1, 0)], currentMinute: 55 }));
    expect(again.notifications).toHaveLength(1);
    expect(again.notifications[0]).toMatchObject({ kind: 'incident', homeScore: 1 });
  });

  it('spadek wyniku nie usuwa markerów niższych wyników', () => {
    const plan = planNotifications(base({ homeScore: 1, lastNotifiedScore: '2:0', notifiedEventIds: [...SEEN, 'score:1:0', 'score:2:0'] }));
    expect(plan.removedNotifiedIds).toEqual(['score:2:0']);
  });
});

describe('helpers', () => {
  it('parseScore', () => {
    expect(parseScore('2:1')).toEqual([2, 1]);
    expect(parseScore('x')).toEqual([0, 0]);
    expect(parseScore(null)).toEqual([0, 0]);
  });

  it('buildIncidentBody dla gola', () => {
    expect(buildIncidentBody(goal(1, 67, 1, 0), 'A', 'B', 1, 0)).toBe("A 1:0 B – Scorer (67')");
  });
});
