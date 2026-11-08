import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { EntitiesService } from '../entities/entities.service.js';
import { type Json, num, obj, str } from '../common/utils/json.js';
import { unixToDate } from '../common/utils/timezone.js';

const dateOnly = (d: Date | null) => (d ? new Date(d.toISOString().slice(0, 10)) : null);

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
    private readonly entities: EntitiesService,
  ) {}

  /** Profil z DB; brakujący lub niepełny (bez daty urodzenia) → dociągnięcie z API (jak Django). */
  async getOrFetch(apiId: number) {
    const existing = await this.prisma.player.findUnique({ where: { apiId }, include: { team: true } });
    if (existing?.dateOfBirth) return existing;

    const data = await this.sportApi.fetchPlayer(apiId);
    if (!data || Object.keys(data).length === 0) return existing; // API zawiodło → zwróć to, co mamy

    const teamData = obj(data['team']);
    const teamApiId = num(teamData['id']);
    const teamId =
      teamApiId !== null
        ? await this.entities.ensureTeam(teamApiId, str(teamData['name']) ?? 'Unknown')
        : null;

    const fields = {
      name: (str(data['name']) ?? existing?.name ?? 'Unknown').slice(0, 255),
      firstName: str(data['firstName'])?.slice(0, 100) ?? null,
      lastName: str(data['lastName'])?.slice(0, 100) ?? null,
      position: str(data['position'])?.slice(0, 50) ?? null,
      jerseyNumber: num(data['jerseyNumber']) ?? num(data['shirtNumber']),
      height: num(data['height']),
      weight: num(data['weight']),
      preferredFoot: str(data['preferredFoot'])?.slice(0, 50) ?? null,
      marketValue: this.bigint(num(data['proposedMarketValue']) ?? num(data['marketValue'])),
      dateOfBirth: dateOnly(unixToDate(data['dateOfBirthTimestamp'])),
      contractUntil: dateOnly(unixToDate(data['contractUntilTimestamp'])),
      nationality: str(obj(data['country'])['name'])?.slice(0, 50) ?? null,
      retired: data['retired'] === true,
      teamId,
    };
    return this.prisma.player.upsert({
      where: { apiId },
      create: { apiId, ...fields },
      update: fields,
      include: { team: true },
    });
  }

  private bigint(v: number | null): bigint | null {
    return v !== null && Number.isFinite(v) ? BigInt(Math.round(v)) : null;
  }

  /** Zapisuje podstawowe dane z wyników wyszukiwania (bez nadpisywania istniejących). */
  async upsertSearchResult(entity: Json) {
    const apiId = num(entity['id']);
    const name = str(entity['name'])?.trim();
    if (apiId === null || !name) return null;
    return this.prisma.player.upsert({
      where: { apiId },
      create: {
        apiId,
        name: name.slice(0, 255),
        firstName: str(entity['firstName'])?.slice(0, 100) ?? null,
        lastName: str(entity['lastName'])?.slice(0, 100) ?? null,
        position: str(entity['position'])?.slice(0, 50) ?? null,
      },
      update: {},
      include: { team: true },
    });
  }
}

export const playerView = (p: {
  id: number;
  apiId: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  jerseyNumber: number | null;
  nationality: string | null;
  dateOfBirth: Date | null;
  height: number | null;
  weight: number | null;
  preferredFoot: string | null;
  marketValue: bigint | null;
  contractUntil: Date | null;
  retired: boolean;
  team: { id: number; apiId: number; name: string } | null;
}) => ({
  id: p.id,
  apiId: p.apiId,
  name: p.name,
  firstName: p.firstName,
  lastName: p.lastName,
  position: p.position,
  jerseyNumber: p.jerseyNumber,
  nationality: p.nationality,
  dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  height: p.height,
  weight: p.weight,
  preferredFoot: p.preferredFoot,
  // BigInt nie serializuje się do JSON (pierwotna wersja zwracała 500) → Number
  marketValue: p.marketValue === null ? null : Number(p.marketValue),
  contractUntil: p.contractUntil?.toISOString().slice(0, 10) ?? null,
  retired: p.retired,
  team: p.team && { id: p.team.id, apiId: p.team.apiId, name: p.team.name },
});
