import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from './auth.service.js';

function roomForUser(userId: string): string {
  return `user:${userId}`;
}

@Injectable()
@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authService.getCurrentApplicationUser(
        client.handshake.headers,
      );
      await client.join(roomForUser(user.id));
    } catch (error) {
      this.logger.debug(
        `Rejecting unauthenticated socket connection: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect(true);
    }
  }

  notifyUsers(userIds: string[]): void {
    for (const userId of new Set(userIds)) {
      this.server?.to(roomForUser(userId)).emit('sync');
    }
  }
}
