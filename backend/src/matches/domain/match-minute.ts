/**
 * Minuta meczu (odpowiednik Django _current_match_minute).
 *
 * `minute` = minuta na początku bieżącej połowy (z `time.initial / 60`),
 * `matchTime` = Unix timestamp (s) początku połowy. Bieżąca minuta = minute + upływ czasu.
 * Poprawki względem Django: brak ujemnego upływu (rozjazd zegarów), brak tykania
 * w przerwie / po meczu i twardy limit (mecz nie ma minuty 400).
 */
export interface MinuteInput {
  minute: number | null;
  matchTime: string | null;
  status?: string | null;
}

const MAX_MINUTE = 130;

export function isClockStopped(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return (
    s.includes('halftime') ||
    s.includes('half-time') ||
    s.includes('paused') ||
    s.includes('ended') ||
    s.includes('finished') ||
    s.includes('not started') ||
    s.includes('after ') ||
    s.includes('cancel') ||
    s.includes('postponed') ||
    s.includes('abandoned')
  );
}

export function currentMatchMinute(m: MinuteInput, nowMs: number = Date.now()): number {
  const base = m.minute ?? 0;
  if (!m.matchTime || isClockStopped(m.status)) return base;
  const start = Number(m.matchTime);
  if (!Number.isFinite(start) || start <= 0) return base;
  const elapsed = Math.max(0, Math.floor((nowMs / 1000 - start) / 60));
  return Math.min(MAX_MINUTE, base + elapsed);
}
