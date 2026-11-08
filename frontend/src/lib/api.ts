/** Klient API VARify: JWT + X-Guest-Id, spójna obsługa błędów (komunikat z backendu zamiast surowego tekstu). */
import { getGuestId } from './guest';
import { getToken, setToken } from './token';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
  /** 403 z backendu dla funkcji wyższego planu. */
  get isPaywall() {
    return this.status === 403 && (this.body as { error?: string } | undefined)?.error === 'access_denied';
  }
}

function messageFrom(body: unknown, fallback: string): string {
  const b = body as { message?: string | string[]; error?: string } | null;
  if (Array.isArray(b?.message)) return b.message.join(', ');
  return b?.message ?? b?.error ?? fallback;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('X-Guest-Id', getGuestId());
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* brak JSON */
    }
    // Token wygasł/unieważniony → wyloguj lokalnie
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(res.status, messageFrom(body, `Request failed (${res.status})`), body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) }),
};

export const teamLogoUrl = (apiId: number) => `${API_URL}/api/images/team/${apiId}`;
export const playerImageUrl = (apiId: number) => `${API_URL}/api/images/player/${apiId}`;
