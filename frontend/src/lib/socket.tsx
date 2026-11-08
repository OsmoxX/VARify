'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './token';
import { useAuth } from './auth';
import { useMounted } from './hooks';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface MatchEventPayload {
  matchApiId: number;
  key: string;
  eventType: string;
  icon: string;
  title: string;
  message: string;
  homeScore: number;
  awayScore: number;
  status?: string | null;
}
export interface LiveScoreUpdate {
  matchApiId: number;
  homeScore: number;
  awayScore: number;
  status: string;
  goal: boolean;
  scoringSide: 'home' | 'away' | null;
}
export interface LiveStatusUpdate {
  matchApiId: number;
  status: string;
}

/**
 * Jedno gniazdo na kartę, tworzone leniwie. Poprzednia wersja tworzyła je w useEffect rodzica
 * i odczytywała `socketRef.current` w renderze — efekty dzieci uruchamiają się PRZED efektem
 * rodzica, więc handlery nigdy się nie podpinały i UI w ogóle nie dostawał zdarzeń na żywo.
 */
let singleton: Socket | null = null;
function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  singleton ??= io(WS_URL, {
    autoConnect: false,
    transports: ['websocket'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
    auth: (cb) => cb({ token: getToken() }),
  });
  return singleton;
}

// Pokoje z licznikiem referencji — przeżywają reconnect (serwer nie pamięta pokoi po rozłączeniu).
const rooms = new Map<number, number>();

function emitJoin(apiId: number) {
  const s = getSocket();
  if (s?.connected) s.emit('join_match', { matchApiId: apiId });
}

interface SocketValue {
  connected: boolean;
  joinMatch: (apiId: number) => void;
  leaveMatch: (apiId: number) => void;
}

const SocketContext = createContext<SocketValue>({ connected: false, joinMatch: () => {}, leaveMatch: () => {} });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const prevUser = useRef<number | null>(null);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onConnect = () => {
      setConnected(true);
      rooms.forEach((_, apiId) => emitJoin(apiId)); // przywróć pokoje po reconnect
    };
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (!s.connected) s.connect();
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  // Zmiana konta (login/logout) → nowe połączenie z właściwym tokenem (pokój user:{id}).
  useEffect(() => {
    if (prevUser.current === userId) return;
    prevUser.current = userId;
    const s = getSocket();
    if (s?.connected) {
      s.disconnect();
      s.connect();
    }
  }, [userId]);

  const joinMatch = useCallback((apiId: number) => {
    rooms.set(apiId, (rooms.get(apiId) ?? 0) + 1);
    if (rooms.get(apiId) === 1) emitJoin(apiId);
  }, []);

  const leaveMatch = useCallback((apiId: number) => {
    const n = (rooms.get(apiId) ?? 0) - 1;
    if (n > 0) {
      rooms.set(apiId, n);
      return;
    }
    rooms.delete(apiId);
    const s = getSocket();
    if (s?.connected) s.emit('leave_match', { matchApiId: apiId });
  }, []);

  const value = useMemo(() => ({ connected, joinMatch, leaveMatch }), [connected, joinMatch, leaveMatch]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketValue {
  const ctx = useContext(SocketContext);
  const mounted = useMounted();
  return mounted ? ctx : { ...ctx, connected: false }; // jak HTML z serwera — patrz useAuth
}

/** Subskrypcja zdarzenia Socket.IO; handler może się zmieniać bez ponownego podpinania. */
export function useSocketEvent<T>(event: 'match_event' | 'live_score_update' | 'live_status_update', handler: (payload: T) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}

/** Dołącza do pokoju meczu na czas życia komponentu. */
export function useMatchRoom(apiId: number | null | undefined) {
  const { joinMatch, leaveMatch } = useSocket();
  useEffect(() => {
    if (!apiId) return;
    joinMatch(apiId);
    return () => leaveMatch(apiId);
  }, [apiId, joinMatch, leaveMatch]);
}
