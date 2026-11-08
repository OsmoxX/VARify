/** Bezpieczne odczyty z nieotypowanego JSON-a SportAPI. */
export type Json = Record<string, unknown>;

export function obj(v: unknown): Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

export function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : [];
}

export function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export function nested(data: unknown, ...keys: string[]): unknown {
  let cur: unknown = data;
  for (const k of keys) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Json)[k];
  }
  return cur ?? null;
}
