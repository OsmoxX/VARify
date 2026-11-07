import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard.js';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  /**
   * GET /api/matches/live
   * FIX BUG #5: jeden endpoint (Django miało dwa widoki dla tej samej URL).
   * FIX BUG #1: zwraca WSZYSTKIE statusy live (nie tylko "half").
   */
  @Get('live')
  @UseGuards(OptionalJwtGuard)
  async getLiveMatches() {
    const matches = await this.matchesService.findAllLive();

    // Grupuj po ligach (odpowiednik Django _build_league_groups)
    const leagueMap = new Map<
      string,
      {
        leagueApiId: string;
        leagueName: string;
        country: string | null;
        isTop: boolean;
        matches: typeof matches;
      }
    >();

    for (const match of matches) {
      const key = match.league?.apiId ?? 'unknown';
      if (!leagueMap.has(key)) {
        leagueMap.set(key, {
          leagueApiId: key,
          leagueName: match.league?.name ?? 'Unknown League',
          country: match.league?.country ?? null,
          isTop: match.isTop,
          matches: [],
        });
      }
      leagueMap.get(key)!.matches.push(match);
    }

    // Top leagues first, then alphabetically
    const leagues = [...leagueMap.values()].sort((a, b) => {
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
      return a.leagueName.localeCompare(b.leagueName);
    });

    return { leagues, total: matches.length };
  }

  /**
   * GET /api/matches/:id
   */
  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  async getMatch(@Param('id', ParseIntPipe) id: number) {
    const match = await this.matchesService.findMatchById(id);
    if (!match) {
      return { error: 'Match not found' };
    }

    // Build pitch data from lineups
    const homeXi = match.lineups.filter((l) => l.isHomeTeam && l.isStartingXi);
    const awayXi = match.lineups.filter((l) => !l.isHomeTeam && l.isStartingXi);

    return {
      match,
      lineups: {
        homeXi,
        homeSubs: match.lineups.filter((l) => l.isHomeTeam && !l.isStartingXi),
        awayXi,
        awaySubs: match.lineups.filter((l) => !l.isHomeTeam && !l.isStartingXi),
      },
      pitchHome: buildPitchData(homeXi, match.homeFormation),
      pitchAway: buildPitchData(awayXi, match.awayFormation),
      missingHome: match.missingPlayers.filter((p) => p.isHomeTeam),
      missingAway: match.missingPlayers.filter((p) => !p.isHomeTeam),
    };
  }
}

// Helper: build pitch rows (odpowiednik Django _build_pitch_data)
function buildPitchData(
  xi: Array<{ position: string | null; playerName: string; shirtNumber: number | null; isCaptain: boolean }>,
  formation: string | null,
): Array<{ row: number; players: typeof xi }> {
  if (!formation || xi.length === 0) return [];

  const rows = formation.split('-').map(Number);
  const result: Array<{ row: number; players: typeof xi }> = [];

  const sortedPlayers = [...xi].sort(
    (a, b) => (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
  );

  let idx = 0;
  // GK first
  const gk = sortedPlayers.find((p) => p.position === 'G');
  if (gk) {
    result.push({ row: 0, players: [gk] });
    sortedPlayers.splice(sortedPlayers.indexOf(gk), 1);
  }

  for (let i = 0; i < rows.length; i++) {
    const count = rows[i];
    result.push({
      row: i + 1,
      players: sortedPlayers.slice(idx, idx + count),
    });
    idx += count;
  }

  return result;
}
