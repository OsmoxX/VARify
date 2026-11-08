import type { Prisma } from '@prisma/client';
import { type Json, nested, num, obj, str, bool } from '../../common/utils/json.js';

/** Pola MatchEvent wyznaczone z incydentu SportAPI (bez matchId). */
export type MappedIncident = Omit<Prisma.MatchEventUncheckedCreateInput, 'matchId'>;

const trunc = (v: string | null, n: number): string | null =>
  v === null ? null : v.length > n ? v.slice(0, n) : v;

function playerName(item: Json): string {
  return str(nested(item, 'player', 'name')) ?? str(item['playerName']) ?? '';
}

/**
 * Stabilny klucz zdarzenia. Incydenty bez `id` (np. HT/FT, injuryTime) dostają klucz
 * syntetyczny, dzięki czemu upsert po (matchId, eventId) nie tworzy duplikatów
 * przy każdym odświeżeniu (Django robiło osobną deduplikację tylko dla period/injuryTime).
 */
export function incidentEventId(item: Json): string {
  const id = str(item['id']);
  if (id) return id.slice(0, 100);
  const type = str(item['incidentType']) ?? 'unknown';
  const time = num(item['time']) ?? 0;
  switch (type) {
    case 'period':
      return `period:${str(item['text']) ?? time}`;
    case 'injuryTime':
      return `injuryTime:${time}`;
    default:
      return `${type}:${time}:${num(item['addedTime']) ?? 0}:${playerName(item)}`.slice(0, 100);
  }
}

/** Mapuje incydent API na pola modelu MatchEvent (odpowiednik Django _map_incident). */
export function mapIncident(item: Json): MappedIncident {
  const type = str(item['incidentType']) ?? '';
  const base: MappedIncident = {
    incidentType: type.slice(0, 50),
    eventId: incidentEventId(item),
    time: num(item['time']) ?? 0,
    addedTime: num(item['addedTime']) ?? 0,
    isHome: item['isHome'] !== false, // null/undefined → true (jak w Django)
  };

  switch (type) {
    case 'goal':
      return {
        ...base,
        playerName: trunc(playerName(item), 100),
        assistPlayerName: trunc(
          str(nested(item, 'assist1', 'name')) ?? str(item['assist1Name']),
          100,
        ),
        assist2PlayerName: trunc(
          str(nested(item, 'assist2', 'name')) ?? str(item['assist2Name']),
          100,
        ),
        homeScore: num(item['homeScore']),
        awayScore: num(item['awayScore']),
        incidentClass: trunc(str(item['incidentClass']), 50),
      };
    case 'card':
      return {
        ...base,
        playerName: trunc(playerName(item), 100),
        incidentClass: trunc(str(item['incidentClass']), 50),
        reason: trunc(str(item['reason']), 255),
        rescinded: bool(item['rescinded']) ?? false,
      };
    case 'substitution': {
      const inName = str(obj(item['playerIn'])['name']) ?? str(item['playerNameIn']) ?? '';
      const outName = str(obj(item['playerOut'])['name']) ?? str(item['playerNameOut']) ?? '';
      return {
        ...base,
        playerInName: trunc(inName, 100),
        playerOutName: trunc(outName, 100),
        playerName: trunc(inName, 100),
        injury: bool(item['injury']) ?? false,
      };
    }
    case 'period':
      return {
        ...base,
        text: trunc(str(item['text']), 100),
        homeScore: num(item['homeScore']),
        awayScore: num(item['awayScore']),
        isLive: bool(item['isLive']) ?? false,
      };
    case 'injuryTime':
      return { ...base, injuryTimeLength: num(item['length']) };
    case 'varDecision':
      return {
        ...base,
        playerName: trunc(playerName(item), 100),
        incidentClass: trunc(str(item['incidentClass']), 50),
        confirmed: bool(item['confirmed']),
      };
    case 'inGamePenalty':
      return {
        ...base,
        playerName: trunc(playerName(item), 100),
        incidentClass: trunc(str(item['incidentClass']), 50),
        reason: trunc(str(item['reason']), 255),
      };
    default:
      return {
        ...base,
        playerName: trunc(str(nested(item, 'player', 'name')) ?? '', 100),
        text: trunc(str(item['text']), 100),
        incidentClass: trunc(str(item['incidentClass']), 50),
      };
  }
}
