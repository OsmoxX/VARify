import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, type INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ServerOptions } from 'socket.io';
import { AppModule } from './app.module.js';

/** FRONTEND_URL może zawierać kilka originów rozdzielonych przecinkami. */
export function allowedOrigins(): string[] {
  return (process.env['FRONTEND_URL'] ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** CORS dla Socket.IO ustawiany w runtime (decorator gateway czytał env przed załadowaniem .env). */
class CorsIoAdapter extends IoAdapter {
  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: allowedOrigins(), credentials: true },
    } as ServerOptions);
  }
}

async function bootstrap() {
  // Prisma BigInt (np. marketValue) nie serializuje się do JSON — zabezpieczenie globalne.
  (BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
    return Number(this);
  };

  const app: INestApplication = await NestFactory.create(AppModule, {
    rawBody: true, // wymagane do weryfikacji podpisu webhooka Stripe
  });

  // Za reverse proxy (nginx/Caddy) — poprawny IP klienta dla rate limitu
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: allowedOrigins(), credentials: true });
  app.useWebSocketAdapter(new CorsIoAdapter(app));
  app.enableShutdownHooks();

  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('VARify API')
      .setDescription('Real-time football match tracker API')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`VARify backend running on http://localhost:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  new Logger('Bootstrap').error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
