import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * MatchesGateway — WebSocket Gateway (Socket.IO)
 * Odpowiednik Django: matches/consumers.py (MatchConsumer)
 *
 * Rooms: `match:{apiId}` — każdy subskrybujący dany mecz.
 * Global room: `global` — wszyscy połączeni klienci (panel powiadomień).
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/',
})
export class MatchesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(MatchesGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
    client.join('global');
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Klient dołącza do pokoju meczu (klik na dzwoneczek) */
  @SubscribeMessage('join_match')
  handleJoinMatch(
    @MessageBody() data: { matchApiId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `match:${data.matchApiId}`;
    client.join(room);
    this.logger.debug(`${client.id} joined ${room}`);
    return { event: 'joined', room };
  }

  /** Klient opuszcza pokój meczu */
  @SubscribeMessage('leave_match')
  handleLeaveMatch(
    @MessageBody() data: { matchApiId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `match:${data.matchApiId}`;
    client.leave(room);
    return { event: 'left', room };
  }

  // ===========================================================================
  //  Metody wywoływane przez backend (jobs, service)
  // ===========================================================================

  /** Bramka / zdarzenie meczowe → pokój meczu */
  broadcastMatchEvent(
    matchApiId: number,
    payload: {
      eventType: string; // 'goal' | 'card' | 'substitution' | 'period' | ...
      icon: string;
      message: string;
      homeScore?: number;
      awayScore?: number;
      status?: string;
    },
  ) {
    this.server.to(`match:${matchApiId}`).emit('match_event', payload);
    // Również do globalnego panelu powiadomień
    this.server.to('global').emit('global_notification', {
      matchApiId,
      ...payload,
    });
  }

  /** Aktualizacja wyniku (bez pełnego zdarzenia) */
  broadcastScoreUpdate(
    matchApiId: number,
    payload: { homeScore: number; awayScore: number; status: string },
  ) {
    this.server.to(`match:${matchApiId}`).emit('score_update', payload);
    // Live match list update — wszyscy widzą zmiany wyniku na stronie głównej
    this.server.to('global').emit('live_score_update', {
      matchApiId,
      ...payload,
    });
  }

  /** Zmiana statusu (HT, 2nd half, itp.) */
  broadcastStatusUpdate(
    matchApiId: number,
    payload: { status: string },
  ) {
    this.server.to(`match:${matchApiId}`).emit('status_update', payload);
    this.server.to('global').emit('live_status_update', { matchApiId, ...payload });
  }
}
