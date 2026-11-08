'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api, type ApiError } from './api';

/** Bieżący czas odświeżany co `ms` — do tykającej minuty meczu (setState tylko w callbacku timera). */
export function useNow(ms = 15000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const noop = () => () => {};
/** true dopiero po hydratacji — do renderowania treści zależnych od daty/strefy klienta. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

interface ApiState<T> {
  path: string | null;
  key: number;
  data?: T;
  error?: ApiError;
}

/**
 * Pobieranie GET z obsługą wyścigów (anulowanie przy zmianie ścieżki), bez synchronicznego setState w efekcie.
 * `data` pozostaje (nieaktualne) w trakcie odświeżania; `loading` = brak jakiegokolwiek wyniku dla tej ścieżki.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<ApiState<T>>({ path: null, key: 0 });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api
      .get<T>(path)
      .then((data) => {
        if (!cancelled) setState({ path, key: nonce, data });
      })
      .catch((error: ApiError) => {
        if (!cancelled) setState({ path, key: nonce, error });
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const samePath = state.path === path;
  const settled = samePath && state.key === nonce;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: samePath ? state.data : undefined,
    error: settled ? state.error : undefined,
    loading: !!path && !settled && !(samePath && state.data),
    reload,
  };
}
