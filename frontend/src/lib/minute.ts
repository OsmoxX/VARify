/** Zegar meczu po stronie klienta (lustro backendu: matches/domain/match-minute.ts). */
export interface MinuteSource {
  periodStartMinute: number;
  matchTime: string | null;
  status: string;
}

const STOPPED = ['halftime', 'half-time', 'paused', 'ended', 'finished', 'not started', 'after ', 'cancel', 'postponed', 'abandoned'];

export const isEndedStatus = (s: string) => /^(ended|finished|after |cancel|postponed|abandoned|awarded|aet$|ap$)/i.test(s.trim());
export const isLiveStatus = (s: string) => !isEndedStatus(s) && !/^not/i.test(s.trim()) && s.trim() !== '';

export function liveMinute(m: MinuteSource, nowMs: number): number {
  const status = m.status.toLowerCase();
  if (!m.matchTime || STOPPED.some((x) => status.includes(x))) return m.periodStartMinute;
  const start = Number(m.matchTime);
  if (!Number.isFinite(start) || start <= 0) return m.periodStartMinute;
  const elapsed = Math.max(0, Math.floor((nowMs / 1000 - start) / 60));
  return Math.min(130, m.periodStartMinute + elapsed);
}
