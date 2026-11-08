'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Bot, User, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/types';
import { Paywall } from '@/components/ui/Paywall';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

const MAX_LEN = 500; // limit backendu
const GREETING: Message = {
  role: 'assistant',
  content: 'Hello! I am VARify AI, your football analyst. Ask me about tactics, players, history, rules or transfers!',
};

export default function AiPage() {
  const { user, tier, ready } = useAuth();
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  if (!ready) return <div className="py-20 text-center text-zinc-500 text-sm">Loading...</div>;
  if (!hasAccess(tier, 'PREMIUM')) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <Paywall required="PREMIUM" feature="The AI Football Analyst" loggedIn={!!user} />
      </div>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const history = [...messages.filter((m) => !m.error), { role: 'user' as const, content: text }];
    setMessages([...messages, { role: 'user', content: text }]);
    setLoading(true);
    try {
      // Backend: ostatnie 40 tur, ostatnia od użytkownika
      const res = await api.post<{ response: string }>('/ai/chat', {
        history: history.slice(-40).map(({ role, content }) => ({ role, content })),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 429
          ? `${err.message}`
          : err instanceof Error
            ? err.message
            : 'Failed to reach the AI analyst.';
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}`, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-190px)] min-h-[420px] flex flex-col gap-4">
      <div className="flex items-center gap-3 pb-3 border-b border-[#222]">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">AI Football Analyst</h1>
          <p className="text-xs text-zinc-400">Tactical insights, history & statistics</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-[#181818] border border-[#252525] rounded-xl">
        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 flex-shrink-0"><Bot className="w-4 h-4" /></div>
            )}
            <div className={`p-3.5 rounded-xl max-w-[80%] text-xs leading-relaxed whitespace-pre-wrap break-words ${
              m.role === 'user' ? 'bg-emerald-600 text-white font-medium' : m.error ? 'bg-red-950/40 border border-red-900/50 text-red-200' : 'bg-[#222] border border-[#2f2f2f] text-zinc-200'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-300 flex-shrink-0"><User className="w-4 h-4" /></div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-purple-400 pl-11"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          maxLength={MAX_LEN}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question (max 500 characters)..."
          className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
        />
        <button type="submit" disabled={!input.trim() || loading} className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2">
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </form>
    </div>
  );
}
