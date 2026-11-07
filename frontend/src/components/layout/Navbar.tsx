'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Bell, Sparkles, Calendar, Star, Radio, Shield } from 'lucide-react';
import { useSocket } from '@/lib/socket';

interface NotificationItem {
  id: string;
  icon: string;
  message: string;
  time: string;
}

export function Navbar() {
  const pathname = usePathname();
  const { onGlobalNotification, connected } = useSocket();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const unsub = onGlobalNotification((notif) => {
      const item: NotificationItem = {
        id: Math.random().toString(),
        icon: notif.icon || '⚽',
        message: notif.message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setNotifications((prev) => [item, ...prev.slice(0, 19)]);
      setUnreadCount((c) => c + 1);
    });

    return unsub;
  }, [onGlobalNotification]);

  const navItems = [
    { label: 'Live Matches', href: '/', icon: Radio },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Favorites', href: '/favorites', icon: Star },
    { label: 'AI Analyst', href: '/ai', icon: Sparkles },
    { label: 'Pricing', href: '/subscribe', icon: Shield },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#1e1e1e] border-b border-[#2a2a2a]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white tracking-wide">
          <span className="text-2xl">⚽</span>
          <span className="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">VARify</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Status + Notifications */}
        <div className="flex items-center gap-3 relative">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="hidden sm:inline">{connected ? 'Live' : 'Connecting'}</span>
          </div>

          {/* Bell Icon & Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
                if (!dropdownOpen) setUnreadCount(0);
              }}
              className="relative p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#242424] border border-[#333] rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[#333] flex justify-between items-center bg-[#1c1c1c]">
                  <h3 className="text-sm font-semibold text-white">Live Notifications</h3>
                  {notifications.length > 0 && (
                    <button
                      onClick={() => setNotifications([])}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[#333]">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-500">
                      No notifications yet. Subscribe to live matches by clicking the bell icon!
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="p-3 hover:bg-zinc-800/40 transition-colors flex items-start gap-3">
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
        </div>
      </div>
    </header>
  );
}
