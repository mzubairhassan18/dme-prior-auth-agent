import { z } from 'zod';

/** Validated at boot — the app refuses to start with a broken environment. */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
  RABBITMQ_URL: z.string().min(1).default('amqp://dme:dme@localhost:5672'),
  AGENT_GRPC_URL: z.string().min(1).default('localhost:50051'),
  AGENT_PROTO_PATH: z.string().optional(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  MINIO_ENDPOINT: z.string().min(1).default('localhost'),
  MINIO_PUBLIC_ENDPOINT: z.string().min(1).optional(),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MINIO_ACCESS_KEY: z.string().min(1).default('dme'),
  MINIO_SECRET_KEY: z.string().min(1).default('dme-local-secret'),
  MINIO_BUCKET: z.string().min(1).default('dme-clinical-documents'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
