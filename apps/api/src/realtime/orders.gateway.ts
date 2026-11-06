import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export interface OrderRealtimeEvent {
  type: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

/** Socket.IO namespace consumed by the dashboard (`/orders`). */
@WebSocketGateway({ namespace: '/orders', cors: { origin: true } })
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  private server?: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`dashboard connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`dashboard disconnected: ${client.id}`);
  }

  broadcast(event: OrderRealtimeEvent): void {
    this.server?.emit('order.event', event);
  }
}
