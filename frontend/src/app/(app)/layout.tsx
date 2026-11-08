import { Suspense } from 'react';
import '@/styles/shell.css';
import '@/styles/live.css';
import '@/styles/search-lock.css';
import { Navbar } from '@/components/layout/Navbar';

/** Główna część aplikacji: nawigacja Django + kontener `.main-content`. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={<nav className="navbar" style={{ height: 68 }} />}>
        <Navbar />
      </Suspense>
      <main className="main-content">{children}</main>
    </>
  );
}
