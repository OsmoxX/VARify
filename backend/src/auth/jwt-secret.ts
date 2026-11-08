import type { ConfigService } from '@nestjs/config';

/** W produkcji brak JWT_SECRET to błąd startu (wcześniej cichy fallback 'dev-secret' = podatność). */
export function getJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (secret && secret.length >= 16) return secret;
  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET (min. 16 chars) is required in production');
  }
  return secret ?? 'dev-secret-change-me-please';
}
