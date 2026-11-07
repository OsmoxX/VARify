'use client';

import { useState } from 'react';
import { Sparkles, Send, Bot, User, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am VARify AI, your expert football analyst. Ask me anything about football tactics, player stats, upcoming fixtures, or historical match analysis!',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');

    const newHistory: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await api.post<{ reply?: string; error?: string }>('/ai/chat', {
        history: newHistory.slice(-6),
        message: userText,
      });

      if (res.error) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠️ ${res.error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.reply ?? 'No response.' },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Failed to connect to AI Analyst service. Please check your connection.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-[#222]">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            AI Football Analyst
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold uppercase">
              Llama 3.3 70B
            </span>
          </h1>
          <p className="text-xs text-zinc-400">Tactical insights, head-to-head analysis & statistics</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-[#181818] border border-[#252525] rounded-xl">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${
              m.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`p-3.5 rounded-xl max-w-[80%] text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'bg-[#222] border border-[#2f2f2f] text-zinc-200'
              }`}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-300 flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-purple-400 pl-11">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing tactics...
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question (e.g., 'Analyze Real Madrid's 4-3-3 pressing structure')..."
          className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2 transition-all"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
}
