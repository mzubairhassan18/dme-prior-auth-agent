import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import type { OrderCreatedEvent } from '@dme/shared';

const EXCHANGE = 'dme.events';
const ORDER_CREATED_KEY = 'order.created';

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

type EventMessage = { eventId: string; eventType: string } & Record<string, unknown>;

interface OrderForEvent {
  id: string;
  patientId: string;
  equipmentCode: string;
  diagnosisCode: string;
  quantity: number;
}

/**
 * Publishes domain events to the `dme.events` topic exchange in confirm mode.
 * Publishing is best effort: an intake must never fail because the broker is down.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private channelPromise?: Promise<ConfirmChannel>;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async publishOrderCreated(order: OrderForEvent): Promise<void> {
    const event: OrderCreatedEvent = {
      eventId: randomUUID(),
      eventType: 'order.created',
      occurredAt: new Date().toISOString(),
      data: {
        orderId: order.id,
        patientId: order.patientId,
        equipmentCode: order.equipmentCode,
        diagnosisCode: order.diagnosisCode,
        quantity: order.quantity,
      },
    };

    await this.publish(ORDER_CREATED_KEY, event);
  }

  private async publish(routingKey: string, event: EventMessage): Promise<void> {
    try {
      const channel = await this.getChannel();

      channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        type: event.eventType,
        timestamp: Date.now(),
      });
      await channel.waitForConfirms();

      this.logger.log(`published ${routingKey} (${event.eventId})`);
    } catch (error) {
      this.logger.warn(`event ${routingKey} not published: ${describe(error)}`);
      this.reset();
    }
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    this.channelPromise ??= this.connect();
    return this.channelPromise;
  }

  private async connect(): Promise<ConfirmChannel> {
    const url = this.config.get<string>('RABBITMQ_URL') ?? 'amqp://dme:dme@localhost:5672';

    try {
      const connection = await connect(url);
      connection.on('error', (error: Error) => {
        this.logger.warn(`rabbitmq connection error: ${describe(error)}`);
      });
      connection.on('close', () => {
        this.logger.warn('rabbitmq connection closed');
        this.reset();
      });

      const channel = await connection.createConfirmChannel();
      channel.on('error', (error: Error) => {
        this.logger.warn(`rabbitmq channel error: ${describe(error)}`);
      });
      channel.on('close', () => {
        this.channel = undefined;
        this.channelPromise = undefined;
      });

      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

      this.connection = connection;
      this.channel = channel;
      this.logger.log(`connected to ${url.replace(/\/\/.*@/, '//***@')}`);

      return channel;
    } catch (error) {
      this.channelPromise = undefined;
      throw error;
    }
  }

  private reset(): void {
    this.channel = undefined;
    this.connection = undefined;
    this.channelPromise = undefined;
  }

  private async close(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.reset();

    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
