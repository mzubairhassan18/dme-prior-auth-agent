import { z } from 'zod';

/** Patient as returned by the API (dates serialized as ISO strings). */
export const PatientSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  insuranceProvider: z.string(),
  memberId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Patient = z.infer<typeof PatientSchema>;
