import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

const MAX_ROOMS_PER_CLIENT = 300;

export interface MatchEventPayload {
  /** Klucz deduplikacji po stronie klienta. */
  key: string;
  eventType: string;
  icon: string;
  title: string;
  message: string;
  homeScore: number;
  awayScore: number;
  status?: string | null;
}

export interface ScoreUpdatePayload {
  homeScore: number;
  awayScore: number;
  status: string;
  /** true gdy wynik wzrósł (animacja gola); false np. dla anulowanego gola. */
  goal: boolean;
  scoringSide: 'home' | 'away' | null;
}

/**
 * MatchesGateway — Socket.IO (odpowiednik Django Channels MatchConsumer).
 *
 * Pokoje:
 *  - `global`            — wszyscy (tylko lekkie aktualizacje wyniku/statusu listy live),
 *  - `match:{apiId}`     — klienci oglądający / subskrybujący dany mecz,
 *  - `user:{userId}`     — zalogowany użytkownik (ulubione drużyny i subskrypcje z wielu urządzeń).
 *
 * Zdarzenia `match_event` trafiają WYŁĄCZNIE do zainteresowanych (pokój meczu ∪ pokoje
 * użytkowników-odbiorców), a nie do wszystkich jak w pierwszej wersji przepisania.
 * CORS konfiguruje CorsIoAdapter (main.ts) — decorator czyta env zbyt wcześnie.
 */
@WebSocketGateway({ namespace: '/' })
export class MatchesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(MatchesGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    void client.join('global');
    const token = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token === 'string' && token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: number }>(token);
        client.data.userId = payload.sub;
        await client.join(`user:${payload.sub}`);
      } catch {
        // przeterminowany/niepoprawny token → traktujemy jak gościa
      }
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  private static roomFor(data: unknown): string | null {
    const id = (data as { matchApiId?: unknown } | null)?.matchApiId;
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? `match:${id}` : null;
  }

  @SubscribeMessage('join_match')
  async handleJoinMatch(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
    const room = MatchesGateway.roomFor(data);
    if (!room) return { ok: false };
    const joined = [...client.rooms].filter((r) => r.startsWith('match:')).length;
    if (joined >= MAX_ROOMS_PER_CLIENT) return { ok: false, error: 'too_many_rooms' };
    await client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('leave_match')
  async handleLeaveMatch(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
    const room = MatchesGateway.roomFor(data);
    if (!room) return { ok: false };
    await client.leave(room);
    return { ok: true, room };
  }

  // ===========================================================================
  //  Wywoływane przez backend
  // ===========================================================================

  /** Zdarzenie meczowe → pokój meczu + pokoje użytkowników-odbiorców (jedna emisja na socket). */
  broadcastMatchEvent(matchApiId: number, userIds: number[], payload: MatchEventPayload) {
    const rooms = [`match:${matchApiId}`, ...userIds.map((u) => `user:${u}`)];
    this.server?.to(rooms).emit('match_event', { matchApiId, ...payload });
  }

  /** Zmiana wyniku → lista live i strony meczów (wszyscy). */
  broadcastScoreUpdate(matchApiId: number, payload: ScoreUpdatePayload) {
    this.server?.to('global').emit('live_score_update', { matchApiId, ...payload });
  }

  /** Zmiana statusu (HT, 2nd half, Ended…). */
  broadcastStatusUpdate(matchApiId: number, payload: { status: string }) {
    this.server?.to('global').emit('live_status_update', { matchApiId, ...payload });
  }
}
