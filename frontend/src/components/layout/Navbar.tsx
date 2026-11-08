'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, Calendar, Crown, LogOut, Lock, Radio, Search, Shield, Sparkles, Star, User, Volume2, VolumeX } from 'lucide-react';
import { useSocket, useSocketEvent, type MatchEventPayload } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/types';
import { isSoundEnabled, setSoundEnabled } from '@/lib/sound';

interface NotificationItem {
  id: string;
  icon: string;
  message: string;
  time: string;
}

const NAV = [
  { label: 'Live', href: '/', icon: Radio },
  { label: 'Calendar', href: '/calendar', icon: Calendar },
  { label: 'Favorites', href: '/favorites', icon: Star },
  { label: 'AI Analyst', href: '/ai', icon: Sparkles },
  { label: 'Pricing', href: '/subscribe', icon: Shield },
];

const TIER_BADGE: Record<string, string> = {
  FREE: 'bg-zinc-800 text-zinc-400',
  PLUS: 'bg-emerald-500/15 text-emerald-400',
  PREMIUM: 'bg-purple-500/20 text-purple-300',
};

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { connected } = useSocket();
  const { user, tier, ready, logout } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sound, setSound] = useState(() => isSoundEnabled());
  const canSearch = hasAccess(tier, 'PLUS');

  useSocketEvent<MatchEventPayload>('match_event', (e) => {
    setItems((prev) => {
      if (prev.some((p) => p.id === e.key)) return prev; // to samo zdarzenie z dwóch pokoi
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return [{ id: e.key, icon: e.icon || '⚽', message: `${e.title} — ${e.message}`, time }, ...prev].slice(0, 30);
    });
    setUnread((n) => n + 1);
  });

  const submitSearch = (ev: React.FormEvent) => {
    ev.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#1e1e1e] border-b border-[#2a2a2a]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white tracking-wide flex-shrink-0">
          <span className="text-2xl">⚽</span>
          <span className="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">VARify</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-emerald-500/10 text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Wyszukiwarka: PLUS+ (soft paywall dla FREE) */}
        <div className="hidden md:block flex-1 max-w-xs">
          {canSearch ? (
            <form onSubmit={submitSearch} className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search team or player (Enter)"
                className="w-full bg-[#181818] border border-[#333] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </form>
          ) : (
            <Link
              href="/subscribe"
              className="flex items-center gap-2 bg-[#181818] border border-dashed border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
              title="Search is available on the PLUS plan"
            >
              <Lock className="w-3.5 h-3.5" /> Search (PLUS)
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 relative">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
            title={connected ? 'Live updates connected' : 'Reconnecting…'}
          />
          <button
            onClick={() => {
              const next = !sound;
              setSound(next);
              setSoundEnabled(next);
            }}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            aria-label={sound ? 'Mute goal sound' : 'Unmute goal sound'}
            title={sound ? 'Goal sound on' : 'Goal sound off'}
          >
            {sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              onClick={() => {
                setBellOpen(!bellOpen);
                setMenuOpen(false);
                if (!bellOpen) setUnread(0);
              }}
              className="relative p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#242424] border border-[#333] rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[#333] flex justify-between items-center bg-[#1c1c1c]">
                  <h3 className="text-sm font-semibold text-white">Live notifications</h3>
                  {items.length > 0 && (
                    <button onClick={() => setItems([])} className="text-xs text-zinc-400 hover:text-zinc-200">Clear</button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#333]">
                  {items.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-500">No notifications yet. Click the bell next to a match to get alerts.</div>
                  ) : (
                    items.map((n) => (
                      <div key={n.id} className="p-3 flex items-start gap-3">
                        <span className="text-lg">{n.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-200 break-words leading-tight">{n.message}</p>
                          <span className="text-[10px] text-zinc-500 mt-1 block">{n.time}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {!ready ? (
            <div className="w-20 h-8" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => {
                  setMenuOpen(!menuOpen);
                  setBellOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-sm text-zinc-200"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline max-w-[8rem] truncate">{user.username}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_BADGE[tier]}`}>
                  {tier === 'PREMIUM' && <Crown className="w-3 h-3 inline -mt-0.5 mr-0.5" />}
                  {tier}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#242424] border border-[#333] rounded-xl shadow-2xl overflow-hidden z-50 text-sm">
                  <Link href="/account" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-zinc-200 hover:bg-zinc-800">Account</Link>
                  <Link href="/favorites" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-zinc-200 hover:bg-zinc-800">Favorite teams</Link>
                  <Link href="/subscribe" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-zinc-200 hover:bg-zinc-800">Plans</Link>
                  <button
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                      router.push('/');
                    }}
                    className="w-full text-left px-4 py-2.5 text-red-400 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link href="/login" className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800">Log in</Link>
              <Link href="/register" className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white">Sign up</Link>
            </div>
          )}
        </div>
      </div>

      {/* Nawigacja mobilna */}
      <nav className="lg:hidden flex overflow-x-auto gap-1 px-3 pb-2 border-t border-[#262626] pt-2">
        {NAV.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
              pathname === href ? 'bg-emerald-500/10 text-emerald-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
