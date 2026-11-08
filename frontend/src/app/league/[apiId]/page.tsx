'use client';

import Link from 'next/link';
import { use } from 'react';
import { Trophy } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { formatLocalTime } from '@/lib/time';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { TeamRef } from '@/lib/types';

interface MatchRowData {
  id: number;
  apiId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  startDatetime: string | null;
  homeTeam: TeamRef | null;
  awayTeam: TeamRef | null;
}
interface Standing {
  id: number;
  position: number;
  points: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  team: TeamRef;
}
interface LeagueResponse {
  league: { id: number; apiId: string; name: string; country: string | null };
  standings: Standing[];
  upcoming: MatchRowData[];
  recent: MatchRowData[];
}

function Fixtures({ title, rows, scores }: { title: string; rows: MatchRowData[]; scores: boolean }) {
  return (
    <section className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <h3 className="px-4 py-2.5 bg-[#181818] text-xs font-semibold text-zinc-300 border-b border-[#252525]">{title}</h3>
      <div className="divide-y divide-[#252525]">
        {rows.length === 0 && <p className="p-4 text-xs text-zinc-500 text-center">Nothing to show.</p>}
        {rows.map((m) => (
          <Link key={m.id} href={scores ? `/match/${m.id}` : '#'} className="flex items-center p-3 text-xs hover:bg-zinc-800/40">
            <span className="w-14 text-center font-mono text-zinc-500">{scores ? '' : formatLocalTime(m.startDatetime)}</span>
            <span className="flex-1 text-right text-zinc-200 truncate">{m.homeTeam?.name}</span>
            <span className="px-3 font-bold text-zinc-100 font-mono">{scores ? `${m.homeScore ?? 0} : ${m.awayScore ?? 0}` : 'vs'}</span>
            <span className="flex-1 text-zinc-200 truncate">{m.awayTeam?.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function LeaguePage({ params }: { params: Promise<{ apiId: string }> }) {
  const { apiId } = use(params);
  const { data, loading, error } = useApi<LeagueResponse>(`/leagues/${apiId}`);

  if (error) return <div className="py-20 text-center text-zinc-400">{error.status === 404 ? 'This league has not been loaded yet.' : error.message}</div>;
  if (loading || !data) return <div className="py-20 text-center text-zinc-500 text-sm">Loading league...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-[#222]">
        <Trophy className="w-6 h-6 text-amber-400" />
        <div>
          <h1 className="text-xl font-bold text-white">{data.league.name}</h1>
          {data.league.country && <p className="text-xs text-zinc-400">{data.league.country}</p>}
        </div>
      </div>

      <section className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#181818] text-zinc-500">
            <tr>
              <th className="p-2.5 text-left w-8">#</th>
              <th className="p-2.5 text-left">Team</th>
              {['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map((h) => <th key={h} className="p-2.5 text-center">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#252525]">
            {data.standings.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-zinc-500">No standings available.</td></tr>}
            {data.standings.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-800/40">
                <td className="p-2.5 text-zinc-500">{s.position}</td>
                <td className="p-2.5"><Link href={`/team/${s.team.id}`} className="flex items-center gap-2 text-zinc-200 hover:text-emerald-400"><TeamLogo apiId={s.team.apiId} name={s.team.name} size={18} />{s.team.name}</Link></td>
                <td className="p-2.5 text-center">{s.matchesPlayed}</td><td className="p-2.5 text-center">{s.matchesWon}</td><td className="p-2.5 text-center">{s.matchesDrawn}</td><td className="p-2.5 text-center">{s.matchesLost}</td>
                <td className="p-2.5 text-center">{s.goalsFor}</td><td className="p-2.5 text-center">{s.goalsAgainst}</td>
                <td className="p-2.5 text-center">{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                <td className="p-2.5 text-center font-bold text-white">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <Fixtures title="Upcoming" rows={data.upcoming} scores={false} />
        <Fixtures title="Recent results" rows={data.recent} scores />
      </div>
    </div>
  );
}
