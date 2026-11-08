import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { AuthProvider } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { SubscriptionsProvider } from '@/lib/subscriptions';
import { Navbar } from '@/components/layout/Navbar';
import { ToastManager } from '@/components/notifications/ToastManager';

export const metadata: Metadata = {
  title: 'VARify — Live Football Match Tracker',
  description: 'Real-time football scores, incidents, lineups and notifications',
};

export const viewport: Viewport = { themeColor: '#121212' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col bg-[#121212] text-[#e0e0e0]">
        <AuthProvider>
          <SocketProvider>
            <SubscriptionsProvider>
              <Suspense fallback={<div className="h-16 bg-[#1e1e1e]" />}>
                <Navbar />
              </Suspense>
              <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
                <Suspense fallback={<div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>}>{children}</Suspense>
              </main>
              <ToastManager />
            </SubscriptionsProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
