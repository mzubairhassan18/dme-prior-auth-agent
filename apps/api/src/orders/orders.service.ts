import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateOrderInput, OrderQuery } from '@dme/shared';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  findAll(query: OrderQuery) {
    return this.prisma.dmeOrder.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { patient: true, decision: true },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.dmeOrder.findUnique({
      where: { id },
      include: { patient: true, decision: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
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

    // Publish only after the transaction commits. Failures are logged and
    // swallowed by EventsService; the manual /analyze endpoint remains a retry path.
    await this.events.publishOrderCreated(order);

    return order;
  }
}
