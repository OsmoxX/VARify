/** Polskie etykiety statusów i klasy kolorów — port STATUS_MAP z `live_matches.js`. */
const STATUS_MAP: Record<string, string> = {
  '1st half': '1. połowa',
  '2nd half': '2. połowa',
  halftime: 'Przerwa',
  ended: 'Zakończony',
  'not started': 'Nie rozpoczęty',
  'extra time 1st half': 'Dogrywka 1H',
  'extra time 2nd half': 'Dogrywka 2H',
  '1st extra': 'Dogrywka 1H',
  '2nd extra': 'Dogrywka 2H',
  'awaiting extra time': 'Oczekuje na dogrywkę',
  'awaiting penalties': 'Oczekuje na karne',
  'extra time halftime': 'Przerwa dogrywki',
  'after extra time': 'Po dogrywce',
  'after penalties': 'Po karnych',
  penalties: 'Karne',
  postponed: 'Przełożony',
  canceled: 'Odwołany',
  cancelled: 'Odwołany',
  abandoned: 'Przerwany',
  awarded: 'Walkower',
};

const LIVE = ['1st half', '2nd half', 'extra time 1st half', 'extra time 2nd half', '1st extra', '2nd extra', 'penalties'];
const BREAK = ['halftime', 'extra time halftime', 'awaiting extra time', 'awaiting penalties'];

export const statusLabel = (status: string) => STATUS_MAP[status.toLowerCase().trim()] ?? status;

export function statusClass(status: string): 'status-live' | 'status-break' | 'status-ended' {
  const s = status.toLowerCase().trim();
  if (LIVE.includes(s)) return 'status-live';
  if (BREAK.includes(s)) return 'status-break';
  return 'status-ended';
}
