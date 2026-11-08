import { type Json, arr, num, str } from '../../common/utils/json.js';

export interface StatItem {
  name: string;
  home: string | number;
  away: string | number;
  homePct: number;
  awayPct: number;
  isPossession: boolean;
}
export interface StatPeriod {
  period: string;
  items: StatItem[];
}

/** statsJson (okresy → grupy → pozycje) → lista gotowa do UI (Django _parse_stats). */
export function parseStats(statsJson: unknown): StatPeriod[] {
  if (!Array.isArray(statsJson)) return [];
  return (statsJson as Json[]).map((period) => {
    const items: StatItem[] = [];
    for (const group of arr(period['groups'])) {
      for (const item of arr(group['statisticsItems'])) {
        const homeVal = num(item['homeValue']) ?? 0;
        const awayVal = num(item['awayValue']) ?? 0;
        const total = homeVal + awayVal;
        const homePct = total > 0 ? Math.round((homeVal / total) * 100) : 50;
        const name = str(item['name']) ?? '';
        items.push({
          name,
          home: (item['home'] as string | number | undefined) ?? homeVal,
          away: (item['away'] as string | number | undefined) ?? awayVal,
          homePct,
          awayPct: 100 - homePct,
          isPossession: name === 'Ball possession',
        });
      }
    }
    return { period: str(period['period']) ?? 'ALL', items };
  });
}
