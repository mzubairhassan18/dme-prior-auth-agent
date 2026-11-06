import { z } from 'zod';

/** Metadata for a clinical document stored in object storage. */
export const ClinicalDocumentSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export type ClinicalDocument = z.infer<typeof ClinicalDocumentSchema>;
