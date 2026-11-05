import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateOrderInput, OrderQuery } from '@dme/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: OrderQuery) {
    return this.prisma.dmeOrder.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { patient: true },
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

    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.dmeOrder.create({
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
          entityId: order.id,
          action: 'created',
          actor: 'api',
          detail: {
            equipmentCode: order.equipmentCode,
            diagnosisCode: order.diagnosisCode,
          },
        },
      });

      return order;
    });
  }
}
