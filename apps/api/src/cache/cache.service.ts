import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * Redis-backed cache for hot order reads. Every operation degrades to a miss when
 * Redis is unavailable, so the API keeps serving from Postgres.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client?: Redis;
  private degraded = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 300, 5_000),
    });

    this.client.on('ready', () => {
      this.degraded = false;
      this.logger.log('redis ready');
    });
    this.client.on('error', (error: Error) => {
      if (!this.degraded) {
        this.degraded = true;
        this.logger.warn(`redis unavailable — serving from postgres: ${error.message}`);
      }
    });

    void this.client.connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    await client.quit().catch(() => undefined);
    client.disconnect();
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client?.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client?.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache is optional; reads still work without it.
    }
  }

  /** Invalidate list reads and (optionally) one order after any write. */
  async invalidateOrders(orderId?: string): Promise<void> {
    await this.invalidate('orders:list:*');
    if (orderId) {
      await this.invalidate(`orders:item:${orderId}`);
    }
  }

  private async invalidate(pattern: string): Promise<void> {
    const client = this.client;
    if (!client || client.status !== 'ready') {
      return;
    }

    try {
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // A failed invalidation still expires within the TTL.
    }
  }
}
