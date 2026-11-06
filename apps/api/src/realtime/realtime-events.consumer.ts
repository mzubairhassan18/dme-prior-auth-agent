import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { OrdersGateway, type OrderRealtimeEvent } from './orders.gateway.js';

const EXCHANGE = 'dme.events';
const QUEUE = 'api.dashboard';
const RECONNECT_MS = 5_000;

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface IncomingEvent {
  eventType?: string;
  occurredAt?: string;
  data?: unknown;
}

/**
 * Relays `order.*` events from RabbitMQ to connected dashboards.
 * The queue is durable, so the API can restart without losing order updates.
 */
@Injectable()
export class RealtimeEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEventsConsumer.name);
  private connection?: ChannelModel;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: OrdersGateway,
  ) {}

  onModuleInit(): void {
    // Tests should not need a broker; the gateway is still available for e2e.
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.stopped = false;
    void this.connect();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    void this.connection?.close().catch(() => undefined);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, RECONNECT_MS);
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }

    const url = this.config.get<string>('RABBITMQ_URL') ?? 'amqp://dme:dme@localhost:5672';

    try {
      const connection = await connect(url);
      if (this.stopped) {
        await connection.close().catch(() => undefined);
        return;
      }

      this.connection = connection;
      connection.on('error', (error: Error) => {
        this.logger.warn(`rabbitmq connection error: ${describe(error)}`);
      });
      connection.on('close', () => {
        if (!this.stopped) {
          this.logger.warn('rabbitmq connection closed — reconnecting');
          this.scheduleReconnect();
        }
      });

      const channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      const queue = await channel.assertQueue(QUEUE, { durable: true });
      await channel.bindQueue(queue.queue, EXCHANGE, 'order.*');
      await channel.prefetch(10);
      await channel.consume(queue.queue, (message) => this.handle(message, channel));

      this.logger.log(`dashboard event consumer ready — queue=${QUEUE}`);
    } catch (error) {
      this.logger.warn(`dashboard consumer unavailable: ${describe(error)}`);
      await this.connection?.close().catch(() => undefined);
      this.connection = undefined;
      this.scheduleReconnect();
    }
  }

  private handle(message: ConsumeMessage | null, channel: Channel): void {
    if (!message) {
      return;
    }

    try {
      const event = JSON.parse(message.content.toString()) as IncomingEvent;
      if (!event.eventType || typeof event.data !== 'object' || event.data === null) {
        throw new Error('invalid event envelope');
      }

      const payload: OrderRealtimeEvent = {
        type: event.eventType,
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        data: event.data as Record<string, unknown>,
      };
      this.gateway.broadcast(payload);
      channel.ack(message);
    } catch (error) {
      this.logger.warn(`dropping bad dashboard event: ${describe(error)}`);
      channel.nack(message, false, false);
    }
  }
}
