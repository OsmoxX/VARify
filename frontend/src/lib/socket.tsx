'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

interface MatchEvent {
  eventType: string;
  icon: string;
  message: string;
  homeScore?: number;
  awayScore?: number;
  status?: string;
}

interface LiveScoreUpdate {
  matchApiId: number;
  homeScore: number;
  awayScore: number;
  status: string;
}

interface GlobalNotification extends MatchEvent {
  matchApiId: number;
}

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  joinMatch: (matchApiId: number) => void;
  leaveMatch: (matchApiId: number) => void;
  onMatchEvent: (handler: (event: MatchEvent) => void) => () => void;
  onScoreUpdate: (handler: (update: LiveScoreUpdate) => void) => () => void;
  onGlobalNotification: (handler: (n: GlobalNotification) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  joinMatch: () => {},
  leaveMatch: () => {},
  onMatchEvent: () => () => {},
  onScoreUpdate: () => () => {},
  onGlobalNotification: () => () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ['websocket'],
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinMatch = (matchApiId: number) => {
    socketRef.current?.emit('join_match', { matchApiId });
  };

  const leaveMatch = (matchApiId: number) => {
    socketRef.current?.emit('leave_match', { matchApiId });
  };

  const onMatchEvent = (handler: (e: MatchEvent) => void) => {
    socketRef.current?.on('match_event', handler);
    return () => { socketRef.current?.off('match_event', handler); };
  };

  const onScoreUpdate = (handler: (u: LiveScoreUpdate) => void) => {
    socketRef.current?.on('live_score_update', handler);
    return () => { socketRef.current?.off('live_score_update', handler); };
  };

  const onGlobalNotification = (handler: (n: GlobalNotification) => void) => {
    socketRef.current?.on('global_notification', handler);
    return () => { socketRef.current?.off('global_notification', handler); };
  };

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        joinMatch,
        leaveMatch,
        onMatchEvent,
        onScoreUpdate,
        onGlobalNotification,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
