/**
 * Jednorazowe odświeżenie meczów live (1 zapytanie do SportAPI) bez uruchamiania crona.
 * Dla planu darmowego: SYNC_ENABLED=false w .env, a dane odświeżasz ręcznie:
 *   npm run sync:once            (lokalnie, po `npm run build`)
 *   docker compose -f docker-compose.nest.yml exec backend node dist/cli/sync-once.js
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { MatchesService } from '../matches/matches.service.js';
import { SportApiService } from '../sport-api/sport-api.service.js';

async function main() {
  process.env['SYNC_ENABLED'] = 'false'; // crony w tym kontekście mają milczeć
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const changed = await app.get(MatchesService).syncLiveMatches();
    console.log(`sync:once → ${changed.length} meczów ze zmianą`);
    console.log('limity:', JSON.stringify(await app.get(SportApiService).quotaStatus()));
  } finally {
    await app.close();
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
