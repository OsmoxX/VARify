import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { HealthController } from '../src/app.controller.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('HealthController (e2e, bez infrastruktury)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  const boot = async (queryRaw: () => Promise<unknown>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  it('GET /health → 200 gdy baza odpowiada', async () => {
    await boot(() => Promise.resolve([{ 1: 1 }]));
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /health → 503 gdy baza nie odpowiada', async () => {
    await boot(() => Promise.reject(new Error('down')));
    await request(app.getHttpServer()).get('/health').expect(503);
  });
});
