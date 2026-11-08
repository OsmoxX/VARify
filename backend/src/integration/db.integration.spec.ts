/**
 * Testy integracyjne na prawdziwej bazie MySQL/MariaDB.
 * Uruchomienie:  TEST_DATABASE_URL=mysql://user:pass@127.0.0.1:3306/varify_test npm test
 * (baza musi mieć zastosowane migracje: DATABASE_URL=... npx prisma migrate deploy). Bez zmiennej — pomijane.
 */
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MatchesService } from '../matches/matches.service.js';
import { EntitiesService } from '../entities/entities.service.js';

const URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!URL)('integracja z bazą', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: URL ?? 'mysql://x:x@127.0.0.1/x' } } });
  const notifications = new NotificationsService(prisma as never);

  const broadcasts: Array<{ kind: string; apiId: number; payload: unknown }> = [];
  const gateway = {
    broadcastScoreUpdate: (apiId: number, payload: unknown) => broadcasts.push({ kind: 'score', apiId, payload }),
    broadcastStatusUpdate: (apiId: number, payload: unknown) => broadcasts.push({ kind: 'status', apiId, payload }),
  };

  let liveEvents: unknown[] = [];
  let incidents: Array<Record<string, unknown>> = [];
  const sportApi = {
    fetchLiveMatches: async () => ({ events: liveEvents }),
    fetchMatchDetail: async () => null,
    fetchIncidents: async () => [incidents, true] as [Array<Record<string, unknown>>, boolean],
    fetchLineups: async () => ({
      home: {
        formation: '4-4-2',
        players: [
          { player: { name: 'Keeper', id: 1, position: 'G', jerseyNumber: 1 }, captain: false, statistics: { rating: 7.2 } },
          { player: { name: 'Sub', id: 2, position: 'S', jerseyNumber: 12 } },
        ],
        missingPlayers: [{ player: { name: 'Injured' }, type: 'missing', reason: 'knee' }],
      },
      away: { formation: '4-3-3', players: [], missingPlayers: [] },
    }),
    fetchStatistics: async () => [{ period: 'ALL', groups: [] }],
  };
  const lock = { acquire: async () => 'tok', release: async () => {} };

  const entities = new EntitiesService(prisma as never);
  const matches = new MatchesService(prisma as never, sportApi as never, gateway as never, entities, lock as never);

  const liveEvent = (over: Record<string, unknown> = {}) => ({
    id: 5001,
    tournament: { uniqueTournament: { id: 17, name: 'Premier League' }, category: { name: 'England' } },
    homeTeam: { id: 10, name: 'Arsenal' },
    awayTeam: { id: 11, name: 'Chelsea' },
    status: { description: '1st half' },
    startTimestamp: 1_800_000_000,
    time: { currentPeriodStartTimestamp: 1_800_000_060, initial: 0 },
    homeScore: { current: 0 },
    awayScore: { current: 0 },
    ...over,
  });

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    entities.clearCache();
    broadcasts.length = 0;
    incidents = [];
    for (const t of ['match_subscriptions', 'favorite_teams', 'match_events', 'match_lineups', 'missing_players', 'live_matches', 'upcoming_matches', 'league_standings', 'players', 'teams', 'leagues', 'profiles', 'users', 'stripe_events']) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${t}`);
    }
  });

  const seedMatch = async () => {
    liveEvents = [liveEvent()];
    await matches.syncLiveMatches();
    return prisma.liveMatch.findUniqueOrThrow({ where: { apiId: 5001 } });
  };
  const seedUser = (n: number) =>
    prisma.user.create({ data: { email: `u${n}@x.pl`, username: `u${n}`, password: 'x', profile: { create: {} } } });

  describe('dzwoneczek — toggle atomowy (race condition)', () => {
    it('20 równoległych kliknięć gościa → 1 wiersz, stan = parzysta liczba przełączeń (wył.)', async () => {
      const m = await seedMatch();
      const guest = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
      await Promise.all(Array.from({ length: 20 }, () => notifications.toggleMatchSubscription(m.id, null, guest)));
      const rows = await prisma.matchSubscription.findMany({ where: { matchId: m.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.isActive).toBe(false);
    });

    it('7 równoległych kliknięć → nieparzysta liczba → aktywna', async () => {
      const m = await seedMatch();
      const user = await seedUser(1);
      await Promise.all(Array.from({ length: 7 }, () => notifications.toggleMatchSubscription(m.id, user.id, null)));
      const rows = await prisma.matchSubscription.findMany({ where: { matchId: m.id, userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.isActive).toBe(true);
    });

    it('sekwencyjnie: on → off → on, odpowiedź zgodna ze stanem', async () => {
      const m = await seedMatch();
      const g = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
      expect((await notifications.toggleMatchSubscription(m.id, null, g)).subscribed).toBe(true);
      expect((await notifications.toggleMatchSubscription(m.id, null, g)).subscribed).toBe(false);
      expect((await notifications.toggleMatchSubscription(m.id, null, g)).subscribed).toBe(true);
    });

    it('po zalogowaniu subskrypcja gościa jest scalona z kontem (bez duplikatu)', async () => {
      const m = await seedMatch();
      const user = await seedUser(2);
      const g = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
      await notifications.toggleMatchSubscription(m.id, null, g); // gość: aktywna
      const res = await notifications.toggleMatchSubscription(m.id, user.id, g); // ten sam człowiek po loginie
      expect(res.subscribed).toBe(false); // przejęta aktywna → przełączona
      expect(await prisma.matchSubscription.count({ where: { matchId: m.id } })).toBe(1);
      const row = await prisma.matchSubscription.findFirstOrThrow({ where: { matchId: m.id } });
      expect(row.userId).toBe(user.id);
    });

    it('gość A i gość B mają niezależne subskrypcje; lista tylko własnych', async () => {
      const m = await seedMatch();
      const a = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
      const b = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';
      await notifications.toggleMatchSubscription(m.id, null, a);
      expect((await notifications.getSubscribed(null, a)).matchIds).toEqual([m.id]);
      expect((await notifications.getSubscribed(null, b)).matchIds).toEqual([]);
    });

    it('nieistniejący mecz → 404, brak tożsamości → 400', async () => {
      await expect(notifications.toggleMatchSubscription(999999, null, '3f2504e0-4f89-41d3-9a0c-0305e82c3306')).rejects.toThrow(/not found/i);
      const m = await seedMatch();
      await expect(notifications.toggleMatchSubscription(m.id, null, null)).rejects.toThrow(/identity/i);
    });
  });

  describe('synchronizacja meczów live', () => {
    it('nowy mecz: tworzy ligę/drużyny, czas startu w UTC bez +2h, zegar połowy', async () => {
      const m = await seedMatch();
      expect(m.startDatetime!.toISOString()).toBe('2027-01-15T08:00:00.000Z');
      expect(m.matchTime).toBe('1800000060');
      expect(m.minute).toBe(0);
      expect(m.isTop).toBe(true);
      expect(await prisma.league.count()).toBe(1);
      expect(await prisma.team.count()).toBe(2);
    });

    it('nowo zauważony mecz live jest zgłaszany do kolejki powiadomień (np. "Match started")', async () => {
      liveEvents = [liveEvent()];
      expect(await matches.syncLiveMatches()).toEqual([5001]);
      expect(await matches.syncLiveMatches()).toEqual([]); // bez zmian → cisza
    });

    it('gol: wykrywa zmianę, rozgłasza goal=true i stronę strzelca', async () => {
      await seedMatch();
      liveEvents = [liveEvent({ homeScore: { current: 1 } })];
      expect(await matches.syncLiveMatches()).toEqual([5001]);
      const score = broadcasts.find((b) => b.kind === 'score');
      expect(score?.payload).toMatchObject({ homeScore: 1, awayScore: 0, goal: true, scoringSide: 'home' });
    });

    it('anulowany gol (spadek wyniku): aktualizuje wynik, ale goal=false i bez triggera push', async () => {
      liveEvents = [liveEvent({ homeScore: { current: 1 } })];
      await matches.syncLiveMatches();
      broadcasts.length = 0;
      liveEvents = [liveEvent({ homeScore: { current: 0 } })];
      expect(await matches.syncLiveMatches()).toEqual([]);
      expect(broadcasts.find((b) => b.kind === 'score')?.payload).toMatchObject({ homeScore: 0, goal: false });
      expect((await prisma.liveMatch.findUniqueOrThrow({ where: { apiId: 5001 } })).homeScore).toBe(0);
    });

    it('mecz znikający z feedu jest kończony (Ended) i zgłaszany; mecze zakończone nietknięte', async () => {
      await seedMatch();
      liveEvents = [];
      expect(await matches.syncLiveMatches()).toEqual([5001]);
      expect((await prisma.liveMatch.findUniqueOrThrow({ where: { apiId: 5001 } })).status).toBe('Ended');
      expect(broadcasts.some((b) => b.kind === 'status' && b.apiId === 5001)).toBe(true);
      expect(await matches.syncLiveMatches()).toEqual([]);
    });

    it('awaria API (null) NIE kończy meczów', async () => {
      await seedMatch();
      const orig = sportApi.fetchLiveMatches;
      sportApi.fetchLiveMatches = async () => null as never;
      expect(await matches.syncLiveMatches()).toEqual([]);
      sportApi.fetchLiveMatches = orig;
      expect((await prisma.liveMatch.findUniqueOrThrow({ where: { apiId: 5001 } })).status).toBe('1st half');
    });

    it('uszkodzone zdarzenie nie zatrzymuje reszty', async () => {
      liveEvents = [{ id: 1 }, liveEvent()];
      await matches.syncLiveMatches();
      expect(await prisma.liveMatch.count()).toBe(1);
    });

    it('odzyskuje się po usunięciu ligi/drużyn z bazy (nieaktualny cache ID → ponowienie)', async () => {
      await seedMatch();
      for (const t of ['live_matches', 'teams', 'leagues']) await prisma.$executeRawUnsafe(`DELETE FROM ${t}`);
      liveEvents = [liveEvent()]; // cache nadal trzyma stare ID → FK error → clearCache + retry
      await matches.syncLiveMatches();
      expect(await prisma.liveMatch.count()).toBe(1);
      expect(await prisma.team.count()).toBe(2);
    });

    it('findAllLive: tylko trwające (bez Ended / Not started)', async () => {
      liveEvents = [liveEvent(), liveEvent({ id: 5002, status: { description: 'Ended' } }), liveEvent({ id: 5003, status: { description: 'Not started' } })];
      await matches.syncLiveMatches();
      const live = await matches.findAllLive();
      expect(live.map((m) => m.apiId)).toEqual([5001]);
    });
  });

  describe('szczegóły meczu', () => {
    it('zapisuje zdarzenia, składy, formacje, brakujących i statystyki; ponowne pobranie nie duplikuje', async () => {
      const m = await seedMatch();
      incidents = [
        { id: 1, incidentType: 'goal', time: 10, isHome: true, player: { name: 'Saka' }, homeScore: 1, awayScore: 0, incidentClass: 'regular' },
        { incidentType: 'period', text: 'HT', time: 45 }, // bez id
      ];
      await matches.fetchMatchDetails(m.id, m.apiId);
      await matches.fetchMatchDetails(m.id, m.apiId);

      expect(await prisma.matchEvent.count({ where: { matchId: m.id } })).toBe(2);
      const lineups = await prisma.matchLineup.findMany({ where: { matchId: m.id }, orderBy: { id: 'asc' } });
      expect(lineups).toHaveLength(2);
      expect(lineups.find((l) => l.playerName === 'Keeper')).toMatchObject({ isStartingXi: true, avgRating: '7.2', position: 'G' });
      expect(lineups.find((l) => l.playerName === 'Sub')!.isStartingXi).toBe(false);
      expect(await prisma.missingPlayer.count({ where: { matchId: m.id } })).toBe(1);
      const row = await prisma.liveMatch.findUniqueOrThrow({ where: { id: m.id } });
      expect(row.homeFormation).toBe('4-4-2');
      expect(row.awayFormation).toBe('4-3-3');
      expect(row.statsJson).toEqual([{ period: 'ALL', groups: [] }]);
    });

    it('niszowa liga: pomija zdarzenia/składy/statystyki (oszczędność limitu API)', async () => {
      liveEvents = [liveEvent({ id: 6001, tournament: { uniqueTournament: { id: 99999, name: 'Obscure Cup' }, category: { name: 'X' } } })];
      await matches.syncLiveMatches();
      const m = await prisma.liveMatch.findUniqueOrThrow({ where: { apiId: 6001 } });
      incidents = [{ id: 1, incidentType: 'goal', time: 1 }];
      await matches.fetchMatchDetails(m.id, m.apiId);
      expect(await prisma.matchEvent.count()).toBe(0);
    });
  });

  describe('więzy bazy', () => {
    it('usunięcie meczu kaskadowo usuwa zdarzenia, składy i subskrypcje', async () => {
      const m = await seedMatch();
      await prisma.matchEvent.create({ data: { matchId: m.id, incidentType: 'goal', eventId: 'e1', time: 1 } });
      await prisma.matchSubscription.create({ data: { matchId: m.id, sessionKey: 's1' } });
      await prisma.liveMatch.delete({ where: { id: m.id } });
      expect(await prisma.matchEvent.count()).toBe(0);
      expect(await prisma.matchSubscription.count()).toBe(0);
    });

    it('usunięcie drużyny kaskadowo usuwa jej mecze (parytet z Django on_delete=CASCADE)', async () => {
      const m = await seedMatch();
      await prisma.team.delete({ where: { id: m.homeTeamId! } });
      expect(await prisma.liveMatch.count()).toBe(0);
    });

    it('unikalne (userId, teamId) w ulubionych i (leagueId, teamId) w tabeli', async () => {
      const m = await seedMatch();
      const user = await seedUser(3);
      await prisma.favoriteTeam.create({ data: { userId: user.id, teamId: m.homeTeamId! } });
      await expect(prisma.favoriteTeam.create({ data: { userId: user.id, teamId: m.homeTeamId! } })).rejects.toMatchObject({ code: 'P2002' });
      const row = { position: 1, points: 1, matchesPlayed: 1, matchesWon: 0, matchesDrawn: 1, matchesLost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0 };
      await prisma.leagueStandings.create({ data: { leagueId: m.leagueId!, teamId: m.homeTeamId!, ...row } });
      await expect(prisma.leagueStandings.create({ data: { leagueId: m.leagueId!, teamId: m.homeTeamId!, ...row } })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('odbiorcy powiadomień: subskrybenci + fani, bez wyciszonych', async () => {
      const m = await seedMatch();
      const [sub, fan, mutedFan, outsider] = await Promise.all([seedUser(10), seedUser(11), seedUser(12), seedUser(13)]);
      await prisma.matchSubscription.create({ data: { matchId: m.id, userId: sub.id, isActive: true } });
      await prisma.favoriteTeam.createMany({ data: [{ userId: fan.id, teamId: m.homeTeamId! }, { userId: mutedFan.id, teamId: m.homeTeamId! }] });
      await prisma.matchSubscription.create({ data: { matchId: m.id, userId: mutedFan.id, isActive: false } }); // wyciszył mecz
      const ids = await matches.resolveRecipientUserIds(m.id, [m.homeTeamId!, m.awayTeamId!]);
      const byId = (a: number, b: number) => a - b;
      expect([...ids].sort(byId)).toEqual([sub.id, fan.id].sort(byId));
      expect(ids).not.toContain(outsider.id);
      expect(await matches.isMatchOfInterest(m.id)).toBe(true);
    });
  });
});
