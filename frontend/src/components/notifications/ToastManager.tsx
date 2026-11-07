'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/lib/socket';
import { X } from 'lucide-react';

interface Toast {
  id: string;
  icon: string;
  message: string;
}

export function ToastManager() {
  const { onGlobalNotification } = useSocket();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsub = onGlobalNotification((notif) => {
      const id = Math.random().toString();
      const newToast: Toast = {
        id,
        icon: notif.icon || '⚽',
        message: notif.message,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    });

    return unsub;
  }, [onGlobalNotification]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-[#1e1e1e] border-l-4 border-emerald-500 border-y border-r border-[#333] shadow-2xl rounded-lg p-3.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          <span className="text-xl flex-shrink-0">{toast.icon}</span>
          <p className="text-xs text-zinc-100 flex-1 leading-snug">{toast.message}</p>
          <button
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
