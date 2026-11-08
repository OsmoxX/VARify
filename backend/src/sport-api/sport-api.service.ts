import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, ResponseType } from 'axios';
import { withRetry } from '../common/utils/retry.js';
import { arr, obj, type Json } from '../common/utils/json.js';

export type ApiResult<T> =
  | { ok: true; status: number; data: T; headers: Record<string, unknown> }
  | { ok: false; status?: number; error: string };

/**
 * SportApiService — wrapper na SportAPI v7 (RapidAPI / sportapi7.p.rapidapi.com)
 * Odpowiednik Django: matches/services/football_api_service.py + api_tracker.py
 *
 * Odporność na błędy:
 *  - retry z exponential backoff + jitter dla 5xx / timeoutów / błędów sieci,
 *  - 429: respektuje Retry-After; przy długim limicie włącza globalny "cooldown",
 *    w trakcie którego kolejne zapytania są odrzucane lokalnie (nie palimy limitu),
 *  - 503: respektuje Retry-After, inaczej backoff.
 */
@Injectable()
export class SportApiService {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(SportApiService.name);
  private cooldownUntil = 0;
  private readonly retries: number;

  // Top league IDs (SportAPI unique-tournament IDs) — odpowiednik PREMIUM_LEAGUE_IDS
  static readonly TOP_LEAGUE_IDS = new Set([
    '7', '679', '1703', // European cups
    '17', '8', '23', '35', '34', // Top 5 leagues
    '37', '238', '18', '52', '53', '44', '36', '54', '24', '40',
    '60', '329', '547', '67', '200', '210',
    '3', '336', '137', '98', '89', '570', '345', '90',
    '384', '480',
    '1346', '955', // Saudi Pro League
    '242', // MLS
    '325', // Brasileirao
    '230', // Liga MX
    '202', // Ekstraklasa
  ]);

  /** Tabele pobierane codziennie (Django fetch_top_leagues_standings_task, poprawione ID). */
  static readonly STANDINGS_LEAGUE_IDS = [
    // Django miało tu 2/3/8 dla pucharów (błędne ID + zduplikowane 8) — używamy ID z TOP_LEAGUES_CONFIG
    '7', '679', '1703', '17', '8', '23', '35', '34', '202', '37', '238', '18', '52', '53', '44',
  ];

  // Statusy oznaczające zakończony mecz (Django helpers.ENDED_STATUSES)
  static readonly ENDED_STATUSES = new Set([
    'ended',
    'finished',
    'canceled',
    'cancelled',
    'postponed',
    'abandoned',
    'awarded',
    'after penalties',
    'after extra time',
    'ap',
    'aet',
    'walkover',
    'interrupted',
    'removed',
  ]);

  static isEndedStatus(status: string | null | undefined): boolean {
    return SportApiService.ENDED_STATUSES.has((status ?? '').toLowerCase().trim());
  }

  static isNotStartedStatus(status: string | null | undefined): boolean {
    return (status ?? '').toLowerCase().trim().startsWith('not');
  }

  static isTopLeague(leagueApiId: string | null | undefined): boolean {
    return !!leagueApiId && SportApiService.TOP_LEAGUE_IDS.has(leagueApiId);
  }

  constructor(private readonly config: ConfigService) {
    this.retries = Number(this.config.get('SPORT_API_MAX_RETRIES') ?? 3);
    this.http = axios.create({
      baseURL: this.config.get<string>(
        'SPORT_API_BASE_URL',
        'https://sportapi7.p.rapidapi.com/api/v1',
      ),
      timeout: Number(this.config.get('SPORT_API_TIMEOUT_MS') ?? 10_000),
      headers: {
        'x-rapidapi-key': this.config.get<string>('SPORT_API_KEY') ?? '',
        'x-rapidapi-host': this.config.get<string>(
          'SPORT_API_HOST',
          'sportapi7.p.rapidapi.com',
        ),
      },
    });
  }

  // ===========================================================================
  //  Core request
  // ===========================================================================

  async get<T = Json>(
    path: string,
    opts: { responseType?: ResponseType; retries?: number } = {},
  ): Promise<ApiResult<T>> {
    if (Date.now() < this.cooldownUntil) {
      return { ok: false, status: 429, error: 'rate-limit cooldown active' };
    }
    try {
      const res = await withRetry(
        () => {
          this.logger.debug(`[API CALL] GET ${path}`);
          return this.http.get<T>(path, { responseType: opts.responseType });
        },
        {
          retries: opts.retries ?? this.retries,
          baseDelayMs: 500,
          maxDelayMs: 8_000,
          getStatus: (e) => (axios.isAxiosError(e) ? e.response?.status : undefined),
          getRetryAfter: (e) =>
            axios.isAxiosError(e)
              ? (e.response?.headers?.['retry-after'] as string | undefined)
              : undefined,
          onRetry: (attempt, delay, e) =>
            this.logger.warn(
              `SportAPI ${path} failed (${axios.isAxiosError(e) ? (e.response?.status ?? e.code) : String(e)}), retry ${attempt} in ${delay}ms`,
            ),
        },
      );
      if (res.status === 204) {
        return { ok: false, status: 204, error: 'no content' };
      }
      return {
        ok: true,
        status: res.status,
        data: res.data,
        headers: res.headers as Record<string, unknown>,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429) this.startCooldown(err.response?.headers?.['retry-after']);
        if (status !== 404) {
          this.logger.warn(`SportAPI ${path}: ${status ?? err.code ?? err.message}`);
        }
        return { ok: false, status, error: err.message };
      }
      return { ok: false, error: String(err) };
    }
  }

  private startCooldown(retryAfter: unknown) {
    const seconds = Number(retryAfter);
    const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
    this.cooldownUntil = Date.now() + Math.min(ms, 15 * 60_000);
    this.logger.error(
      `SportAPI quota exhausted (429) — pausing outbound calls for ${Math.round(ms / 1000)}s`,
    );
  }

  private async getJson(path: string): Promise<Json | null> {
    const res = await this.get<Json>(path);
    return res.ok ? obj(res.data) : null;
  }

  // ===========================================================================
  //  Endpoints
  // ===========================================================================

  /** GET /sport/football/events/live — wszystkie mecze live */
  fetchLiveMatches(): Promise<Json | null> {
    return this.getJson('/sport/football/events/live');
  }

  /** GET /sport/football/scheduled-events/{YYYY-MM-DD} */
  fetchScheduledEvents(date: string): Promise<Json | null> {
    return this.getJson(`/sport/football/scheduled-events/${date}`);
  }

  /** GET /event/{id} — stan meczu (wynik, status, czas) */
  async fetchMatchDetail(apiMatchId: number): Promise<Json | null> {
    const data = await this.getJson(`/event/${apiMatchId}`);
    return data ? obj(data['event']) : null;
  }

  /**
   * GET /event/{id}/incidents — incydenty meczu.
   * Zwraca [incidents, hasData]; hasData=false (404/403/204) → blacklista meczu.
   * Błędy przejściowe (5xx, 429, timeout) → hasData=true (spróbujemy później).
   */
  async fetchIncidents(apiMatchId: number): Promise<[Json[], boolean]> {
    const res = await this.get<Json>(`/event/${apiMatchId}/incidents`);
    if (res.ok) {
      const data = obj(res.data);
      // Django obsługiwało też warianty data.incidents / response
      const incidents =
        data['incidents'] ??
        obj(data['data'])['incidents'] ??
        (Array.isArray(data['response']) ? data['response'] : obj(data['response'])['incidents']);
      return [arr(incidents), true];
    }
    if (res.status === 404 || res.status === 403 || res.status === 204) {
      this.logger.log(`fetchIncidents(${apiMatchId}): HTTP ${res.status} — no incident data`);
      return [[], false];
    }
    return [[], true];
  }

  /** GET /event/{id}/lineups */
  fetchLineups(apiMatchId: number): Promise<Json | null> {
    return this.getJson(`/event/${apiMatchId}/lineups`);
  }

  /** GET /event/{id}/statistics */
  async fetchStatistics(apiMatchId: number): Promise<Json[] | null> {
    const data = await this.getJson(`/event/${apiMatchId}/statistics`);
    return data ? arr(data['statistics']) : null;
  }

  /** GET /search/players/{name}/more (fallback: /search/players/{name}) */
  async searchPlayers(name: string): Promise<Json[]> {
    const encoded = encodeURIComponent(name);
    let res = await this.get<Json>(`/search/players/${encoded}/more`, { retries: 1 });
    if (!res.ok && res.status !== 429) {
      res = await this.get<Json>(`/search/players/${encoded}`, { retries: 1 });
    }
    if (!res.ok) return [];
    const data = obj(res.data);
    const rows = arr(data['results']).length ? arr(data['results']) : arr(data['players']);
    return rows.map((r) => ('entity' in r ? obj(r['entity']) : r));
  }

  /** GET /player/{id} */
  async fetchPlayer(apiPlayerId: number): Promise<Json | null> {
    const data = await this.getJson(`/player/${apiPlayerId}`);
    return data ? obj(data['player'] ?? data) : null;
  }

  /** GET /unique-tournament/{id}/seasons → id najnowszego sezonu */
  async fetchCurrentSeasonId(tournamentId: string): Promise<number | null> {
    const data = await this.getJson(`/unique-tournament/${tournamentId}/seasons`);
    const first = arr(data?.['seasons'])[0];
    return typeof first?.['id'] === 'number' ? first['id'] : null;
  }

  /** GET /unique-tournament/{id}/season/{sid}/standings/total */
  async fetchLeagueStandings(tournamentId: string, seasonId: number): Promise<Json[] | null> {
    const data = await this.getJson(
      `/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`,
    );
    return data ? arr(data['standings']) : null;
  }

  /** GET /team/{id}/events/last/{page} — ostatnie mecze drużyny */
  async fetchTeamLastMatches(apiTeamId: number, page = 0): Promise<Json[] | null> {
    const data = await this.getJson(`/team/${apiTeamId}/events/last/${page}`);
    return data ? arr(data['events']) : null;
  }

  /** GET /{team|player}/{id}/image — herb / zdjęcie (binarnie) */
  async fetchImage(
    entityType: 'team' | 'player',
    apiId: number,
  ): Promise<{ content: Buffer; contentType: string } | null> {
    const res = await this.get<ArrayBuffer>(`/${entityType}/${apiId}/image`, {
      responseType: 'arraybuffer',
      retries: 1,
    });
    if (!res.ok) return null;
    const rawType = res.headers['content-type'];
    const contentType = typeof rawType === 'string' ? rawType : 'image/png';
    if (!contentType.startsWith('image/')) return null;
    return { content: Buffer.from(res.data), contentType };
  }
}
