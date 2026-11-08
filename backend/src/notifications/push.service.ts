import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  key: string;
}

/** Web Push (VAPID) — odpowiednik django-webpush send_user_notification. */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!pub || !priv || !subject) {
      this.logger.warn('VAPID_* not configured — Web Push disabled (WebSocket notifications still work)');
      return;
    }
    webpush.setVapidDetails(subject, pub, priv);
    this.publicKey = pub;
    this.enabled = true;
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  async subscribe(userId: number, endpoint: string, p256dh: string, auth: string) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      // endpoint może przejść na inne konto (wspólne urządzenie) — przepisujemy właściciela
      update: { userId, p256dh, auth },
    });
  }

  async unsubscribe(userId: number, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Wysyła push do wszystkich urządzeń użytkowników; martwe endpointy (404/410) są usuwane. */
  async sendToUsers(userIds: number[], payload: PushPayload): Promise<number> {
    if (!this.enabled || userIds.length === 0) return 0;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const body = JSON.stringify(payload);
    let sent = 0;
    const CHUNK = 20;
    for (let i = 0; i < subs.length; i += CHUNK) {
      const results = await Promise.allSettled(
        subs.slice(i, i + CHUNK).map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
              { TTL: 3600, urgency: 'high', topic: payload.key.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') || undefined },
            );
            sent++;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) {
              await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
            } else {
              this.logger.warn(`push to user ${s.userId} failed: ${code ?? String(err)}`);
            }
          }
        }),
      );
      void results;
    }
    return sent;
  }
}
