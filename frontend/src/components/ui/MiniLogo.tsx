'use client';

import { useState } from 'react';
import { teamLogoUrl } from '@/lib/api';

/** Mały herb 24px w wierszach meczów; przy błędzie ładowania znika (jak `onerror` w Django). */
export function MiniLogo({ apiId, className = 'team-icon' }: { apiId?: number | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!apiId || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={teamLogoUrl(apiId)} alt="" className={className} onError={() => setFailed(true)} style={{ width: 24, height: 24, objectFit: 'contain', verticalAlign: 'middle' }} />;
}
