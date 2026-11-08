'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSocketEvent, type MatchEventPayload } from '@/lib/socket';
import { playGoalSound } from '@/lib/sound';

interface Toast {
  id: string;
  icon: string;
  title: string;
  message: string;
  goal: boolean;
}

/** Toasty z `match_event`. Deduplikacja po `key` (to samo zdarzenie z pokoju meczu i pokoju użytkownika). */
export function ToastManager() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  useSocketEvent<MatchEventPayload>('match_event', (e) => {
    if (seen.current.has(e.key)) return;
    seen.current.add(e.key);
    if (seen.current.size > 300) seen.current = new Set([...seen.current].slice(-150));

    const goal = e.eventType === 'goal';
    if (goal) playGoalSound();
    setToasts((prev) => [...prev.slice(-3), { id: e.key, icon: e.icon || '⚽', title: e.title, message: e.message, goal }]);
    timers.current.set(e.key, setTimeout(() => dismiss(e.key), goal ? 9000 : 6000));
  });

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2.5rem)] pointer-events-none" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto anim-toast-in bg-[#1e1e1e] border-l-4 ${t.goal ? 'border-emerald-400' : 'border-amber-500'} border-y border-r border-[#333] shadow-2xl rounded-lg p-3.5 flex items-start gap-3`}
        >
          <span className={`text-2xl flex-shrink-0 ${t.goal ? 'anim-ball' : ''}`}>{t.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-100 leading-snug">{t.title}</p>
            <p className="text-xs text-zinc-400 mt-0.5 break-words">{t.message}</p>
          </div>
          <button onClick={() => dismiss(t.id)} className="text-zinc-500 hover:text-zinc-300" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
