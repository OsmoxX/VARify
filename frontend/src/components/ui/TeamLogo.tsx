'use client';

import { useState } from 'react';
import { teamLogoUrl } from '@/lib/api';

/** Herb z proxy backendu (cache w DB); brak obrazka → inicjał, bez zepsutej ikonki. */
export function TeamLogo({ apiId, name, size = 24 }: { apiId?: number | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!apiId || failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-bold flex-shrink-0"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamLogoUrl(apiId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
