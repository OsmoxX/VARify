'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { playerImageUrl } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Player {
  apiId: number;
  name: string;
  position: string | null;
  jerseyNumber: number | null;
  nationality: string | null;
  dateOfBirth: string | null;
  height: number | null;
  weight: number | null;
  preferredFoot: string | null;
  marketValue: number | null;
  contractUntil: string | null;
  retired: boolean;
  team: { id: number; apiId: number; name: string } | null;
}

function age(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

export default function PlayerPage({ params }: { params: Promise<{ apiId: string }> }) {
  const { apiId } = use(params);
  const { data: p, error, loading } = useApi<Player>(`/players/${apiId}`);
  const [imgFailed, setImgFailed] = useState(false);

  if (error) return <div className="py-20 text-center text-zinc-400">{error.status === 404 ? 'Player not found.' : error.message}</div>;
  if (loading || !p) return <div className="py-20 text-center text-zinc-500 text-sm">Loading player...</div>;

  const rows: Array<[string, string | null]> = [
    ['Position', p.position],
    ['Shirt number', p.jerseyNumber?.toString() ?? null],
    ['Nationality', p.nationality],
    ['Age', age(p.dateOfBirth)?.toString() ?? null],
    ['Date of birth', p.dateOfBirth],
    ['Height', p.height ? `${p.height} cm` : null],
    ['Weight', p.weight ? `${p.weight} kg` : null],
    ['Preferred foot', p.preferredFoot],
    ['Market value', p.marketValue ? `€${p.marketValue.toLocaleString()}` : null],
    ['Contract until', p.contractUntil],
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-5">
        {imgFailed ? (
          <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">👤</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={playerImageUrl(p.apiId)} alt={p.name} width={96} height={96} onError={() => setImgFailed(true)} className="w-24 h-24 rounded-full object-cover bg-zinc-800" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{p.name}</h1>
          {p.retired && <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">Retired</span>}
          {p.team && <Link href={`/team/${p.team.id}`} className="block text-sm text-zinc-400 hover:text-emerald-400 mt-1">{p.team.name}</Link>}
        </div>
      </div>
      <dl className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl divide-y divide-[#252525]">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between p-3 text-sm"><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-100">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
