import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { SocketProvider } from '@/lib/socket';
import { Navbar } from '@/components/layout/Navbar';
import { ToastManager } from '@/components/notifications/ToastManager';

export const metadata: Metadata = {
  title: 'VARify — Live Football Match Tracker',
  description: 'Real-time football scores, incidents, lineups and notifications',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col bg-[#121212] text-[#e0e0e0]">
        <SocketProvider>
          <Suspense fallback={<div className="h-16 bg-[#1e1e1e]" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
            <Suspense fallback={<div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>}>
              {children}
            </Suspense>
          </main>
          <ToastManager />
        </SocketProvider>
      </body>
    </html>
  );
}
