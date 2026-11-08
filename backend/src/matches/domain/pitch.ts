/**
 * Układ zawodników na boisku z formacji (odpowiednik Django _build_pitch_data).
 * Zwraca współrzędne w % (top/left) gotowe do absolutnego pozycjonowania we froncie.
 */
export interface XiPlayer {
  playerName: string;
  position: string | null;
  shirtNumber: number | null;
  isCaptain: boolean;
  avgRating: string | null;
}

export interface PitchSpot<T extends XiPlayer = XiPlayer> {
  player: T;
  top: number;
  left: number;
  ratingClass: '' | 'rating-green' | 'rating-yellow' | 'rating-red';
}

export function ratingClass(avg: string | null | undefined): PitchSpot['ratingClass'] {
  if (!avg) return '';
  const v = Number(avg);
  if (!Number.isFinite(v)) return 'rating-yellow';
  if (v >= 7) return 'rating-green';
  if (v >= 6) return 'rating-yellow';
  return 'rating-red';
}

/** "4-2-3-1" → [4,2,3,1]; niepoprawny zapis → null. */
export function parseFormation(formation: string | null | undefined): number[] | null {
  if (!formation) return null;
  const rows = formation.split('-').map((x) => Number(x.trim()));
  if (rows.length === 0 || rows.some((n) => !Number.isInteger(n) || n <= 0 || n > 10)) return null;
  return rows;
}

export function buildPitchData<T extends XiPlayer>(
  xi: T[],
  formation: string | null | undefined,
  isHome = true,
): PitchSpot<T>[] {
  if (xi.length === 0) return [];

  const groups: Record<string, T[]> = { G: [], D: [], M: [], F: [] };
  for (const p of xi) (groups[p.position ?? 'M'] ?? groups['M']!).push(p);
  const outfield = [...groups['D']!, ...groups['M']!, ...groups['F']!];

  // Formacja musi sumować się do liczby graczy z pola; w innym razie wyprowadzamy ją z pozycji
  // (Django w takim przypadku gubiło zawodników lub zostawiało puste rzędy).
  let rows = parseFormation(formation);
  if (!rows || rows.reduce((a, b) => a + b, 0) !== outfield.length) {
    const derived = [groups['D']!.length, groups['M']!.length, groups['F']!.length].filter(
      (n) => n > 0,
    );
    rows = derived.length ? derived : [outfield.length];
  }

  const rowPlayers: T[][] = [groups['G']!];
  let idx = 0;
  for (const count of rows) {
    rowPlayers.push(outfield.slice(idx, idx + count));
    idx += count;
  }

  const totalRows = rowPlayers.length;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const spots: PitchSpot<T>[] = [];
  rowPlayers.forEach((players, rowIdx) => {
    if (players.length === 0) return;
    const ratio = rowIdx / Math.max(totalRows - 1, 1);
    const left = isHome ? 5 + ratio * 40 : 95 - ratio * 40;
    players.forEach((player, col) => {
      spots.push({
        player,
        top: round1(((col + 1) / (players.length + 1)) * 100),
        left: round1(left),
        ratingClass: ratingClass(player.avgRating),
      });
    });
  });
  return spots;
}
