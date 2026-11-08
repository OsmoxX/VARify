/** Token JWT w localStorage + subskrypcja zmian (useSyncExternalStore). Każdy dostęp w try/catch. */
const KEY = 'varify_token';
const listeners = new Set<() => void>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* tryb prywatny / zablokowany storage */
  }
  listeners.forEach((l) => l());
}

export function subscribeToken(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
