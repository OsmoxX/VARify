import { type Json, num, obj, str } from '../../common/utils/json.js';

/**
 * Planer powiadomień o meczu — czysta funkcja (odpowiednik Django
 * process_match_incidents_and_notify, bez efektów ubocznych).
 *
 * Gwarancje:
 *  - żaden incydent nie jest ogłoszony dwa razy (notifiedEventIds),
 *  - ten sam gol nie jest ogłoszony dwa razy, gdy fallback wynikowy uprzedził incydent
 *    (marker `score:H:A` w notifiedEventIds) — w Django powodowało to duplikat,
 *  - cold-start: historia meczu sprzed pierwszego przetworzenia jest "uciszana".
 */

export const PUSH_INCIDENT_TYPES = new Set(['goal', 'card', 'varDecision', 'inGamePenalty']);

export const INCIDENT_LABELS: Record<string, [string, string]> = {
  'goal:regular': ['⚽', 'GOOOL!'],
  'goal:ownGoal': ['⚽', 'Own goal!'],
  'goal:penalty': ['⚽', 'Penalty goal!'],
  'card:yellow': ['🟨', 'Yellow card!'],
  'card:red': ['🟥', 'Red card!'],
  'card:yellowRed': ['🟨🟥', 'Second yellow → red!'],
  'varDecision:goalCancelled': ['❌', 'Goal cancelled (VAR)!'],
  'varDecision:cardUpgrade': ['📺', 'Card upgraded (VAR)!'],
  'varDecision:penaltyNotGiven': ['📺', 'Penalty overturned (VAR)!'],
  'varDecision:penaltyGiven': ['🎯', 'Penalty awarded (VAR)!'],
  'inGamePenalty:scored': ['🎯', 'Penalty - GOAL!'],
  'inGamePenalty:missed': ['💨', 'Penalty missed!'],
  'inGamePenalty:penaltyAwarded': ['🎯', 'Penalty awarded!'],
};

/** Zdarzenie starsze niż tyle minut jest przy cold-starcie uciszane. Okno > 0, bo sync
 *  działa co minutę i nowy gol bywa wykryty z opóźnieniem 1-2 min (Django: 0 → gubiło gole). */
export const COLD_START_INCIDENT_WINDOW_MIN = 2;
export const COLD_START_STATUS_WINDOW_MIN = 5;

export type NotificationKind = 'incident' | 'status' | 'score';

export interface PlannedNotification {
  kind: NotificationKind;
  /** Klucz deduplikacji po stronie klienta (toast + web push). */
  key: string;
  eventType: string;
  icon: string;
  title: string;
  body: string;
  homeScore: number;
  awayScore: number;
}

export interface PlanInput {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  status: string | null;
  /** Aktualna (obliczona) minuta meczu. */
  currentMinute: number;
  notifiedEventIds: string[];
  lastNotifiedScore: string;
  incidents: Json[];
}

export interface PushPlan {
  notifications: PlannedNotification[];
  newNotifiedIds: string[];
  /** Markery wyniku do usunięcia z bazy (po anulowaniu gola przez VAR). */
  removedNotifiedIds: string[];
  lastNotifiedScore: string;
  /** Czy stan (ids / wynik) wymaga zapisu w DB. */
  dirty: boolean;
}

const START_STATUSES = new Set(['1st half', 'first half', '1t']);
const HALFTIME_STATUSES = new Set(['halftime', 'ht', 'half-time']);
const ENDED_STATUSES = new Set(['ended', 'ft', 'fulltime', 'finished']);

export function parseScore(score: string | null | undefined): [number, number] {
  const m = /^(\d+):(\d+)$/.exec(score ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

export function buildIncidentBody(
  inc: Json,
  homeName: string,
  awayName: string,
  homeScore: number,
  awayScore: number,
): string {
  const player = str(obj(inc['player'])['name']) ?? '';
  const isHome = inc['isHome'] !== false;
  const team = isHome ? homeName : awayName;
  const time = num(inc['time']);
  const minute = time === null ? '' : String(time);
  const type = str(inc['incidentType']) ?? '';

  if (type === 'goal') {
    const scorer = player ? ` – ${player}` : '';
    return `${homeName} ${homeScore}:${awayScore} ${awayName}${scorer}${minute ? ` (${minute}')` : ''}`;
  }
  if (type === 'card') return `${player} (${team})${minute ? ` – ${minute}'` : ''}`.trim();
  if (type === 'varDecision' || type === 'inGamePenalty') {
    return `${team}${player ? ` ${player}` : ''}${minute ? ` – ${minute}'` : ''}`;
  }
  return `${homeName} vs ${awayName}`;
}

export function planNotifications(input: PlanInput): PushPlan {
  const { homeName, awayName, incidents } = input;
  const already = new Set(input.notifiedEventIds);
  const newIds: string[] = [];

  // Gol anulowany przez VAR: markery `score:H:A` z sumą większą niż aktualna już nie opisują
  // rzeczywistości — usuwamy je, żeby prawdziwy gol na ten sam wynik nie został uciszony.
  const [prevH, prevA] = parseScore(input.lastNotifiedScore);
  const currentTotal = input.homeScore + input.awayScore;
  const removedIds: string[] = [];
  if (currentTotal < prevH + prevA) {
    for (const id of input.notifiedEventIds) {
      const m = /^score:(\d+):(\d+)$/.exec(id);
      if (m && Number(m[1]) + Number(m[2]) > currentTotal) {
        removedIds.push(id);
        already.delete(id);
      }
    }
  }
  const out: PlannedNotification[] = [];
  const coldStart = input.notifiedEventIds.length === 0;
  const matchTitle = `${homeName} – ${awayName}`;
  const scoreStr = `${input.homeScore}:${input.awayScore}`;
  let goalHandled = false;

  const remember = (id: string) => {
    if (!already.has(id)) {
      already.add(id);
      newIds.push(id);
    }
  };

  // ── Incydenty ───────────────────────────────────────────────────────────
  for (const inc of incidents) {
    const id = str(inc['id']) ?? '';
    if (!id || already.has(id)) continue;

    const type = str(inc['incidentType']) ?? '';
    if (!PUSH_INCIDENT_TYPES.has(type)) continue;

    const klass = str(inc['incidentClass']) ?? '';
    let label = INCIDENT_LABELS[`${type}:${klass}`];
    if (!label) {
      if (type === 'goal') label = ['⚽', 'GOOOL!'];
      else if (type === 'card') label = ['🃏', 'Card!'];
      else continue; // nieznany wariant VAR/penalty — nie spamujemy
    }

    const isGoal = type === 'goal';
    if (isGoal) goalHandled = true;

    // Cold-start: stare zdarzenia zapamiętujemy, ale nie wysyłamy.
    const incMinute = (num(inc['time']) ?? 0) + (num(inc['addedTime']) ?? 0);
    if (coldStart && input.currentMinute - incMinute > COLD_START_INCIDENT_WINDOW_MIN) {
      remember(id);
      continue;
    }

    const incHome = isGoal ? num(inc['homeScore']) : null;
    const incAway = isGoal ? num(inc['awayScore']) : null;
    const h = incHome ?? input.homeScore;
    const a = incAway ?? input.awayScore;

    // Gol już ogłoszony przez fallback wynikowy → tylko zapamiętaj id.
    if (isGoal && incHome !== null && incAway !== null && already.has(`score:${incHome}:${incAway}`)) {
      remember(id);
      continue;
    }

    const [icon, text] = label;
    out.push({
      kind: 'incident',
      key: `incident:${id}`,
      eventType: type,
      icon,
      title: `${icon} ${text} | ${matchTitle}`,
      body: buildIncidentBody(inc, homeName, awayName, h, a),
      homeScore: h,
      awayScore: a,
    });
    remember(id);
  }

  // ── Status: start / przerwa / koniec ────────────────────────────────────
  const status = (input.status ?? '').toLowerCase().trim();
  const statusNote = (
    id: string,
    icon: string,
    text: string,
    body: string,
    eventType = 'period',
  ) => {
    out.push({
      kind: 'status',
      key: `status:${id}`,
      eventType,
      icon,
      title: `${icon} ${text} | ${matchTitle}`,
      body,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
    });
    remember(id);
  };

  if (START_STATUSES.has(status) && !already.has('status_started')) {
    if (coldStart && input.currentMinute > COLD_START_STATUS_WINDOW_MIN) {
      remember('status_started'); // mecz trwa już długo — "rozpoczął się" byłoby mylące
    } else {
      statusNote('status_started', '🟢', 'Match started!', 'Kick-off! Follow the match live.');
    }
  }
  if (HALFTIME_STATUSES.has(status) && !already.has('status_halftime')) {
    statusNote('status_halftime', '⏸️', 'Half-time', `First half over. Score at the break: ${scoreStr}`);
  }
  if (ENDED_STATUSES.has(status) && !already.has('status_ended')) {
    statusNote('status_ended', '🏁', 'Full time!', `Final whistle! Final score: ${scoreStr}.`);
  }

  // ── Fallback wynikowy (incydenty opóźnione względem live score) ─────────
  const [oldH, oldA] = parseScore(input.lastNotifiedScore);
  if (
    scoreStr !== input.lastNotifiedScore &&
    input.homeScore + input.awayScore > oldH + oldA &&
    !goalHandled
  ) {
    const marker = `score:${input.homeScore}:${input.awayScore}`;
    out.push({
      kind: 'score',
      key: marker,
      eventType: 'goal',
      icon: '⚽',
      title: `⚽ GOOOL! | ${matchTitle}`,
      body: `${homeName} ${scoreStr} ${awayName}`,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
    });
    remember(marker);
  }

  return {
    notifications: out,
    newNotifiedIds: newIds,
    removedNotifiedIds: removedIds,
    lastNotifiedScore: scoreStr,
    dirty: newIds.length > 0 || removedIds.length > 0 || scoreStr !== input.lastNotifiedScore,
  };
}
