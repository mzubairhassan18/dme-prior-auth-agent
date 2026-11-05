import { z } from 'zod';
import { AuthorizationDecisionSchema } from './decision.js';
import { PatientSchema } from './patient.js';

export const OrderStatusSchema = z.enum(['SUBMITTED', 'ANALYZING', 'DECISION_READY', 'FAILED']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const HCPCS_PATTERN = /^[A-Z]\d{4}$/;
export const ICD10_PATTERN = /^[A-Z]\d{2}(\.\d{1,4})?$/;

/** Body for POST /orders — validated identically on API and (later) web forms. */
export const CreateOrderSchema = z.object({
  patientId: z.uuid(),
  equipmentCode: z.string().regex(HCPCS_PATTERN, 'HCPCS code, e.g. E0601'),
  diagnosisCode: z.string().regex(ICD10_PATTERN, 'ICD-10 code, e.g. G47.33'),
  quantity: z.number().int().min(1).max(99).default(1),
  clinicalNotes: z.string().min(20).max(5000),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

/** Query filters for GET /orders. */
export const OrderQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
  patientId: z.uuid().optional(),
});

export type OrderQuery = z.infer<typeof OrderQuerySchema>;

/** Order as returned by the API. */
export const OrderSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  equipmentCode: z.string(),
  diagnosisCode: z.string(),
  quantity: z.number(),
  clinicalNotes: z.string(),
  status: OrderStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  patient: PatientSchema.optional(),
  decision: AuthorizationDecisionSchema.nullable().optional(),
});

export type Order = z.infer<typeof OrderSchema>;
