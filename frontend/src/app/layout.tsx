import type { Metadata, Viewport } from 'next';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './globals.css';
import { Suspense } from 'react';
import { AuthProvider } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { SubscriptionsProvider } from '@/lib/subscriptions';
import { ToastManager } from '@/components/notifications/ToastManager';

export const metadata: Metadata = {
  title: 'VARify — Centrum Wyników',
  description: 'Wyniki piłkarskie na żywo, składy, powiadomienia i statystyki',
};

export const viewport: Viewport = { themeColor: '#121212' };

/** Korzeń: tylko dostawcy stanu. Układ (nawigacja / strony samodzielne) dają grupy tras. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <AuthProvider>
          <SocketProvider>
            <SubscriptionsProvider>
              <Suspense fallback={<div className="py-20 text-center text-zinc-500 text-sm">Ładowanie...</div>}>{children}</Suspense>
              <ToastManager />
            </SubscriptionsProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
