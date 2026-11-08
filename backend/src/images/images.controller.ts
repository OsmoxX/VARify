import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe, StreamableFile } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';
import { isUniqueViolation } from '../entities/entities.service.js';

const NEGATIVE_TTL_MS = 10 * 60_000;

/** Proxy herbów/zdjęć z trwałym cache w DB (Django proxy_image_view / CachedImage). */
@Controller('images')
export class ImagesController {
  private readonly missing = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportApi: SportApiService,
  ) {}

  @Get(':type/:apiId')
  @Header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  async image(@Param('type') type: string, @Param('apiId', ParseIntPipe) apiId: number) {
    if (type !== 'team' && type !== 'player') throw new NotFoundException('Unknown image type');

    const cached = await this.prisma.cachedImage.findUnique({
      where: { entityType_apiId: { entityType: type, apiId } },
    });
    if (cached) return new StreamableFile(Buffer.from(cached.content), { type: cached.contentType });

    // Negatywny cache: brak obrazka nie może palić limitu API przy każdym renderze listy.
    const key = `${type}:${apiId}`;
    const missUntil = this.missing.get(key);
    if (missUntil && missUntil > Date.now()) throw new NotFoundException();

    const img = await this.sportApi.fetchImage(type, apiId);
    if (!img) {
      this.missing.set(key, Date.now() + NEGATIVE_TTL_MS);
      throw new NotFoundException();
    }
    try {
      await this.prisma.cachedImage.create({
        data: {
          entityType: type,
          apiId,
          content: new Uint8Array(img.content),
          contentType: img.contentType.slice(0, 100),
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // równoległy zapis tego samego obrazka
    }
    return new StreamableFile(img.content, { type: img.contentType });
  }
}
