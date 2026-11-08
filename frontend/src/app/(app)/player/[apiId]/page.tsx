'use client';

import '@/styles/player.css';
import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { playerImageUrl } from '@/lib/api';
import { useApi } from '@/lib/hooks';

interface Player {
  apiId: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  jerseyNumber: number | null;
  nationality: string | null;
  dateOfBirth: string | null;
  height: number | null;
  preferredFoot: string | null;
  contractUntil: string | null;
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
const formatDate = (d: string | null) => (d ? d.split('-').reverse().join('.') : '-');
const foot = (f: string | null) => (f === 'Right' ? 'Prawa' : f === 'Left' ? 'Lewa' : f === 'Both' ? 'Obie' : (f ?? '-'));

/** Profil zawodnika — port `player_detail.html` + `player_detail.js`. */
export default function PlayerPage({ params }: { params: Promise<{ apiId: string }> }) {
  const { apiId } = use(params);
  const router = useRouter();
  const { data: p, error, loading } = useApi<Player>(`/players/${apiId}`);
  const [imgFailed, setImgFailed] = useState(false);

  const a = p ? age(p.dateOfBirth) : null;
  const display = p ? (p.firstName || p.lastName ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : p.name) : '';
  const stats: Array<[string, string | null]> = p
    ? [
        ['Narodowość', p.nationality],
        ['Wiek', a ? `${a} lat` : null],
        ['Wzrost', p.height ? `${p.height} cm` : null],
        ['Lepsza Noga', foot(p.preferredFoot)],
        ['Kontrakt do', formatDate(p.contractUntil)],
      ]
    : [];

  return (
    <div className="vf-player">
      <div className="calendar-container">
        <div className="header-section">
          <h1 className="page-title"><i className="fa-solid fa-user" /> Profil Zawodnika</h1>
          <a className="back-link" onClick={() => router.back()} role="button" tabIndex={0}><i className="fa-solid fa-arrow-left" /> Wróć</a>
        </div>

        {error ? (
          <div className="no-matches-msg">
            <i className="fa-solid fa-circle-exclamation" />
            <h2>{error.status === 404 ? 'Zawodnik nie znaleziony' : error.message}</h2>
          </div>
        ) : loading || !p ? (
          <div className="loading-state"><i className="fa-solid fa-circle-notch fa-spin" /><p>Ładowanie profilu zawodnika...</p></div>
        ) : (
          <div className="player-profile-card">
            <div className="player-avatar">
              {imgFailed ? (
                <i className="fa-solid fa-user" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={playerImageUrl(p.apiId)} alt={p.name} onError={() => setImgFailed(true)} />
              )}
            </div>
            <div className="player-info-main">
              <h2>{display}</h2>
              <div className="player-tags">
                {p.jerseyNumber ? <span className="tag-jersey">#{p.jerseyNumber}</span> : null}
                {p.position ? <span className="tag-pos">{p.position}</span> : null}
                {p.team ? <Link href={`/team/${p.team.id}`} className="tag-team">{p.team.name}</Link> : null}
              </div>
              <div className="player-stats-grid">
                {stats.map(([k, v]) => (
                  <div key={k} className="stat-box"><div className="lbl">{k}</div><div className="val">{v || '-'}</div></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
