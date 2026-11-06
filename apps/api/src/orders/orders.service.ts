import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateOrderInput, OrderQuery } from '@dme/shared';
import { CacheService } from '../cache/cache.service.js';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const LIST_TTL_SECONDS = 15;
const ITEM_TTL_SECONDS = 30;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly cache: CacheService,
  ) {}

  findAll(query: OrderQuery) {
    const key = `orders:list:${query.status ?? 'all'}:${query.patientId ?? 'all'}`;

    return this.cached(key, LIST_TTL_SECONDS, () =>
      this.prisma.dmeOrder.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.patientId ? { patientId: query.patientId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: { patient: true, decision: true },
      }),
    );
  }

  findOne(id: string) {
    return this.cached(`orders:item:${id}`, ITEM_TTL_SECONDS, async () => {
      const order = await this.prisma.dmeOrder.findUnique({
        where: { id },
        include: {
          patient: true,
          decision: true,
          documents: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              orderId: true,
              fileName: true,
              contentType: true,
              size: true,
              createdAt: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      return order;
    });
  }

  async create(input: CreateOrderInput) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const order = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.dmeOrder.create({
        data: {
          patientId: input.patientId,
          equipmentCode: input.equipmentCode,
          diagnosisCode: input.diagnosisCode,
          quantity: input.quantity,
          clinicalNotes: input.clinicalNotes,
        },
        include: { patient: true },
      });

      await transaction.auditLog.create({
        data: {
          entityType: 'dme_order',
          entityId: created.id,
          action: 'created',
          actor: 'api',
          detail: {
            equipmentCode: created.equipmentCode,
            diagnosisCode: created.diagnosisCode,
          },
        },
      });

      return created;
    });

    await this.cache.invalidateOrders(order.id);

    // Publish only after the transaction commits. Failures are logged and
    // swallowed by EventsService; the manual /analyze endpoint remains a retry path.
    await this.events.publishOrderCreated(order);

    return order;
  }

  private async cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.cache.getJson<T>(key);
    if (hit !== null) {
      return hit;
    }

    const value = await load();
    await this.cache.setJson(key, value, ttlSeconds);
    return value;
  }
}
