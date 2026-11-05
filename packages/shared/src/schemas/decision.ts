import { z } from 'zod';

export const DecisionOutcomeSchema = z.enum(['APPROVE', 'NEEDS_MORE_INFO', 'DENY']);
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

/** The agent's prior-authorization recommendation for an order. */
export const AuthorizationDecisionSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  outcome: DecisionOutcomeSchema,
  rationale: z.string(),
  policyReference: z.string(),
  missingDocuments: z.array(z.string()),
  confidence: z.number().nullable(),
  modelUsed: z.string(),
  createdAt: z.string(),
});

export type AuthorizationDecision = z.infer<typeof AuthorizationDecisionSchema>;
