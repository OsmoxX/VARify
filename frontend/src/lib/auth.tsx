'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { useMounted } from './hooks';
import { getToken, setToken, subscribeToken } from './token';
import type { Tier } from './types';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  tier: Tier;
  subscriptionStatus: string | null;
}

interface AuthValue {
  user: AuthUser | null;
  tier: Tier;
  /** false dopóki nie wiemy, czy ktoś jest zalogowany (unikamy migania "Login" po odświeżeniu). */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  tier: 'FREE',
  ready: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refresh: async () => {},
});

const noopSubscribe = () => () => {};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = useSyncExternalStore(subscribeToken, getToken, () => null);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [profile, setProfile] = useState<{ token: string; user: AuthUser } | null>(null);

  const load = useCallback(async (forToken: string) => {
    const me = await api.get<AuthUser>('/auth/me');
    setProfile({ token: forToken, user: me });
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .get<AuthUser>('/auth/me')
      .then((me) => {
        if (!cancelled) setProfile({ token, user: me });
      })
      .catch(() => {
        /* 401 → api.ts wylogowało; błąd sieci → zostajemy "niezalogowani" do odświeżenia */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Użytkownik wynika z tokenu + pobranego profilu (bez synchronicznego setState w efekcie).
  const user = token && profile?.token === token ? profile.user : null;
  const ready = mounted && (!token || user !== null);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string }>('/auth/login', { email, password });
    setToken(res.accessToken);
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const res = await api.post<{ accessToken: string }>('/auth/register', { email, username, password });
    setToken(res.accessToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    const t = getToken();
    if (t) await load(t);
  }, [load]);

  const value = useMemo<AuthValue>(
    () => ({ user, tier: user?.tier ?? 'FREE', ready, login, register, logout, refresh }),
    [user, ready, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Konsument widzi wartości "serwerowe" (gość, ready=false), dopóki on sam się nie zamontuje.
 * Komponenty w granicach <Suspense> hydratują się późno — gdy kontekst zdążył już się zmienić —
 * i bez tej osłony czytałyby stan nieobecny w HTML z serwera (błąd hydratacji React #418).
 */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  const mounted = useMounted();
  if (mounted) return ctx;
  return { ...ctx, user: null, tier: 'FREE', ready: false };
}
