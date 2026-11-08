/** Logika prezentacji zdarzeń (odpowiednik właściwości MatchEvent + _should_show_event). */
export interface EventLike {
  incidentType: string;
  time: number;
  addedTime: number | null;
  text: string | null;
}

export const isPeriodMarker = (e: EventLike) => e.incidentType === 'period';
export const isInjuryTimeAnnouncement = (e: EventLike) => e.incidentType === 'injuryTime';

export function formattedTime(e: EventLike): string {
  if (isPeriodMarker(e) || isInjuryTimeAnnouncement(e)) return '';
  const added = e.addedTime ?? 0;
  if (added > 0 && added < 900) return `${e.time}+${added}`;
  return String(e.time);
}

/** Ukrywa przedwczesne markery HT/FT dla meczów trwających. */
export function shouldShowEvent(
  e: EventLike,
  status: string | null | undefined,
  currentMinute: number,
): boolean {
  if (!isPeriodMarker(e)) return true;
  const s = (status ?? '').toLowerCase().trim();
  const isFirstHalf = s.includes('1st') || s.includes('first');
  const isSecondHalf = s.includes('2nd') || s.includes('second');
  const isHalftime = s.includes('half') && s.includes('time');

  if ((e.text === 'HT' || e.time === 45) && isFirstHalf) return false;
  if ((e.text === 'FT' || e.time === 90) && (isFirstHalf || isHalftime || isSecondHalf)) {
    return false;
  }
  return e.time <= currentMinute;
}

export function cardColor(incidentClass: string | null, incidentType: string): string | null {
  if (incidentType !== 'card') return null;
  const map: Record<string, string> = { yellow: 'yellow', yellowRed: 'yellow-red', red: 'red' };
  return map[incidentClass ?? ''] ?? 'yellow';
}
