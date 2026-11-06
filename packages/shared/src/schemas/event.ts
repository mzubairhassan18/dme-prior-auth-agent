import { z } from 'zod';

/** Payload published when a DME order is created. */
export const OrderCreatedDataSchema = z.object({
  orderId: z.uuid(),
  patientId: z.uuid(),
  equipmentCode: z.string(),
  diagnosisCode: z.string(),
  quantity: z.number().int().positive(),
});

export type OrderCreatedData = z.infer<typeof OrderCreatedDataSchema>;

export const OrderCreatedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal('order.created'),
  occurredAt: z.string(),
  data: OrderCreatedDataSchema,
});

export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;

/** Generic envelope for events on the `dme.events` topic exchange. */
export const EventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: z.string(),
  occurredAt: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
