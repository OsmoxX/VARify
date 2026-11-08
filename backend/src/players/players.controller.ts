import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlayersService, playerView } from './players.service.js';
import { pageParams, paginated } from '../common/utils/pagination.js';

class PlayersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** api_id drużyny */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) team?: number;
}

@Controller('players')
export class PlayersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly players: PlayersService,
  ) {}

  /** GET /api/players?search=&team=&page= */
  @Get()
  async list(@Query() q: PlayersQueryDto) {
    const { page, skip, take } = pageParams(q.page);
    const where = {
      ...(q.search ? { name: { contains: q.search } } : {}),
      ...(q.team ? { team: { apiId: q.team } } : {}),
    };
    const [rows, count] = await Promise.all([
      this.prisma.player.findMany({
        where,
        include: { team: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.player.count({ where }),
    ]);
    return paginated(rows.map(playerView), count, page);
  }

  /** GET /api/players/:apiId — profil zawodnika */
  @Get(':apiId')
  async detail(@Param('apiId', ParseIntPipe) apiId: number) {
    const player = await this.players.getOrFetch(apiId);
    if (!player) throw new NotFoundException('Player not found');
    return playerView(player);
  }
}
