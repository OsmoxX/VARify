import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * SportApiService — wrapper na SportAPI (RapidAPI / sportapi7.p.rapidapi.com)
 *
 * Pojedyncze miejsce dla wszystkich zapytań do zewnętrznego API piłkarskiego.
 * Odpowiednik Django: matches/services/football_api_service.py
 */
@Injectable()
export class SportApiService {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(SportApiService.name);

  // Top league IDs (SportAPI unique-tournament IDs) — odpowiednik PREMIUM_LEAGUE_IDS
  static readonly TOP_LEAGUE_IDS = new Set([
    '7', '679', '1703',              // European cups
    '17', '8', '23', '35', '34',     // Top 5 leagues
    '37', '238', '18', '52', '53', '44', '36', '54', '24', '40',
    '60', '329', '547', '67', '200', '210',
    '3', '336', '137', '98', '89', '570', '345', '90',
    '384', '480',
    '1346', '955',                   // Saudi Pro League
    '242',                           // MLS
    '325',                           // Brasileirao
    '230',                           // Liga MX
    '202',                           // Ekstraklasa
  ]);

  // FIX BUG #1: kompletna lista statusów live (Django filtrowało tylko "half")
  static readonly LIVE_STATUSES = new Set([
    '1st half',
    '2nd half',
    'extra time',
    'extra time first half',
    'extra time second half',
    'penalties',
    'overtime',
    'paused',    // halftime — mecz live, między połowami
  ]);

  static readonly ENDED_STATUSES = new Set([
    'ended',
    'ap',
    'aet',
    'cancelled',
    'postponed',
    'abandoned',
    'walkover',
  ]);

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: 'https://sportapi7.p.rapidapi.com/api/v1',
      timeout: 10_000,
      headers: {
        'x-rapidapi-key': this.config.get<string>('SPORT_API_KEY'),
        'x-rapidapi-host': this.config.get<string>(
          'SPORT_API_HOST',
          'sportapi7.p.rapidapi.com',
        ),
      },
    });

    // Log API request count for debugging
    this.http.interceptors.request.use((cfg) => {
      this.logger.debug(`SportAPI → ${cfg.method?.toUpperCase()} ${cfg.url}`);
      return cfg;
    });
  }

  /** GET /sport/football/events/live — wszystkie mecze live */
  async fetchLiveMatches(): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.http.get('/sport/football/events/live');
      return data;
    } catch (err: unknown) {
      this.logger.error('fetchLiveMatches error', err);
      return null;
    }
  }

  /** GET /sport/football/scheduled-events/{date} — zaplanowane mecze */
  async fetchScheduledEvents(
    date: string, // format: YYYY-MM-DD
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.http.get(
        `/sport/football/scheduled-events/${date}`,
      );
      return data;
    } catch (err: unknown) {
      this.logger.error(`fetchScheduledEvents(${date}) error`, err);
      return null;
    }
  }

  /**
   * GET /event/{id}/incidents — incydenty meczu (gole, kartki, zmiany)
   * Zwraca [incidents, hasData]
   * hasData=false → 404/403/204 → blacklistuj mecz w DB
   */
  async fetchIncidents(
    apiMatchId: number,
  ): Promise<[Record<string, unknown>[], boolean]> {
    try {
      const { data, status } = await this.http.get(
        `/event/${apiMatchId}/incidents`,
      );
      if (status === 200) {
        return [
          (data as { incidents?: Record<string, unknown>[] }).incidents ?? [],
          true,
        ];
      }
      return [[], true];
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404 || status === 403 || status === 204) {
          this.logger.log(
            `fetchIncidents(${apiMatchId}): HTTP ${status} — blacklisting match`,
          );
          return [[], false];
        }
        this.logger.warn(
          `fetchIncidents(${apiMatchId}): HTTP ${status} (transient)`,
        );
      }
      return [[], true]; // transient error — keep trying
    }
  }

  /** GET /event/{id}/lineups — składy meczu */
  async fetchLineups(
    apiMatchId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.http.get(`/event/${apiMatchId}/lineups`);
      return data;
    } catch (err: unknown) {
      this.logger.warn(`fetchLineups(${apiMatchId}) error`, err);
      return null;
    }
  }

  /** GET /search/players/{name}/more — wyszukiwarka zawodników */
  async searchPlayers(
    name: string,
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const encoded = encodeURIComponent(name);
      const { data } = await this.http.get(`/search/players/${encoded}/more`);
      return (
        (data as { players?: Record<string, unknown>[] }).players ?? null
      );
    } catch (err: unknown) {
      this.logger.warn(`searchPlayers(${name}) error`, err);
      return null;
    }
  }

  /** GET /player/{id} — profil zawodnika */
  async fetchPlayer(
    apiPlayerId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.http.get(`/player/${apiPlayerId}`);
      return data;
    } catch (err: unknown) {
      this.logger.warn(`fetchPlayer(${apiPlayerId}) error`, err);
      return null;
    }
  }

  /** GET /team/{id}/standings — tabela ligi dla drużyny */
  async fetchTeamStandings(
    apiTeamId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.http.get(`/team/${apiTeamId}/standings`);
      return data;
    } catch (err: unknown) {
      this.logger.warn(`fetchTeamStandings(${apiTeamId}) error`, err);
      return null;
    }
  }

  /** GET /event/{id} — szczegóły meczu */
  async fetchMatchDetail(
    apiMatchId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.http.get(`/event/${apiMatchId}`);
      return data;
    } catch (err: unknown) {
      this.logger.warn(`fetchMatchDetail(${apiMatchId}) error`, err);
      return null;
    }
  }

  /** GET /team/{id}/events/last/{page} — ostatnie mecze drużyny */
  async fetchTeamLastMatches(
    apiTeamId: number,
    page = 0,
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const { data } = await this.http.get(
        `/team/${apiTeamId}/events/last/${page}`,
      );
      return (data as { events?: Record<string, unknown>[] }).events ?? null;
    } catch (err: unknown) {
      this.logger.warn(`fetchTeamLastMatches(${apiTeamId}) error`, err);
      return null;
    }
  }
}
