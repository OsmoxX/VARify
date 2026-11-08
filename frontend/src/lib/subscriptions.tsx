'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { useSocket } from './socket';
import { useMounted } from './hooks';

interface SubsValue {
  isSubscribed: (matchId: number) => boolean;
  isPending: (matchId: number) => boolean;
  toggle: (matchId: number, apiId: number) => Promise<void>;
}

const SubsContext = createContext<SubsValue>({ isSubscribed: () => false, isPending: () => false, toggle: async () => {} });

/**
 * Stan dzwoneczków dla całej aplikacji.
 * Race condition: kolejne kliknięcia w trakcie żądania są ignorowane (jedno żądanie na mecz),
 * UI aktualizuje się optymistycznie i wraca do stanu z serwera (który przełącza atomowo).
 */
export function SubscriptionsProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { joinMatch, leaveMatch } = useSocket();
  const [subs, setSubs] = useState<Map<number, number>>(new Map()); // matchId -> apiId
  const [pending, setPending] = useState<Set<number>>(new Set());
  const inFlight = useRef(new Set<number>());
  const joined = useRef(new Set<number>());
  const userId = user?.id ?? null;

  // (Re)ładowanie po zmianie konta; pokoje dla subskrybowanych meczów dołączamy po załadowaniu.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    api
      .get<{ matchIds: number[]; matchApiIds: number[] }>('/notifications/subscribed')
      .then((res) => {
        if (cancelled) return;
        setSubs(new Map(res.matchIds.map((id, i) => [id, res.matchApiIds[i]!] as const)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, userId]);

  // Synchronizacja pokoi Socket.IO z listą subskrypcji
  useEffect(() => {
    const wanted = new Set(subs.values());
    wanted.forEach((apiId) => {
      if (!joined.current.has(apiId)) {
        joined.current.add(apiId);
        joinMatch(apiId);
      }
    });
    joined.current.forEach((apiId) => {
      if (!wanted.has(apiId)) {
        joined.current.delete(apiId);
        leaveMatch(apiId);
      }
    });
  }, [subs, joinMatch, leaveMatch]);

  const toggle = useCallback(async (matchId: number, apiId: number) => {
    if (inFlight.current.has(matchId)) return; // ignoruj równoległe kliknięcia
    inFlight.current.add(matchId);
    setPending((p) => new Set(p).add(matchId));
    const apply = (on: boolean) =>
      setSubs((prev) => {
        const next = new Map(prev);
        if (on) next.set(matchId, apiId);
        else next.delete(matchId);
        return next;
      });
    try {
      const res = await api.post<{ subscribed: boolean }>(`/notifications/matches/${matchId}/toggle`);
      apply(res.subscribed); // prawda z serwera
    } finally {
      inFlight.current.delete(matchId);
      setPending((p) => {
        const next = new Set(p);
        next.delete(matchId);
        return next;
      });
    }
  }, []);

  const value = useMemo<SubsValue>(
    () => ({ isSubscribed: (id) => subs.has(id), isPending: (id) => pending.has(id), toggle }),
    [subs, pending, toggle],
  );
  return <SubsContext.Provider value={value}>{children}</SubsContext.Provider>;
}

export function useSubscriptions(): SubsValue {
  const ctx = useContext(SubsContext);
  const mounted = useMounted();
  return mounted ? ctx : { ...ctx, isSubscribed: () => false, isPending: () => false }; // jak HTML z serwera
}
