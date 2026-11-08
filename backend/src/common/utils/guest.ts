/**
 * Tożsamość gościa (odpowiednik Django session_key dla niezalogowanych).
 * Frontend generuje UUID v4 w localStorage i wysyła go w nagłówku X-Guest-Id.
 * Akceptujemy wyłącznie poprawny UUID — inaczej każdy anonim dzieliłby
 * subskrypcje z sessionKey=null (błąd w pierwotnym przepisaniu).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseGuestId(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return UUID_RE.test(v) ? v : null;
}
