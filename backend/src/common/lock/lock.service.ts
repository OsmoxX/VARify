import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

/**
 * Rozproszona blokada na Redis (SET NX PX) — odpowiednik Django cache.add(lock, ttl).
 * Działa poprawnie przy wielu instancjach backendu (in-memory `isRunning` nie działało).
 * Gdy Redis jest niedostępny, spada do blokady w pamięci procesu.
 */
@Injectable()
export class LockService implements OnModuleDestroy {
  private readonly logger = new Logger(LockService.name);
  private readonly redis: Redis;
  private readonly local = new Map<string, number>();

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', (err: Error) => this.logger.debug(`Redis: ${err.message}`));
    this.redis.connect().catch((err: Error) =>
      this.logger.warn(`Redis lock unavailable, using in-process locks: ${err.message}`),
    );
  }

  /** Zwraca token blokady lub null, jeśli już zajęta. */
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    if (this.redis.status === 'ready') {
      try {
        const res = await this.redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
        return res === 'OK' ? token : null;
      } catch (err) {
        this.logger.warn(`Redis lock error (${key}): ${String(err)}`);
      }
    }
    const now = Date.now();
    const expires = this.local.get(key);
    if (expires && expires > now) return null;
    this.local.set(key, now + ttlMs);
    return token;
  }

  /** Zwalnia blokadę tylko jeśli nadal należy do nas. */
  async release(key: string, token: string): Promise<void> {
    this.local.delete(key);
    if (this.redis.status !== 'ready') return;
    try {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        `lock:${key}`,
        token,
      );
    } catch (err) {
      this.logger.warn(`Redis unlock error (${key}): ${String(err)}`);
    }
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
