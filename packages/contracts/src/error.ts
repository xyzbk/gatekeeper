import { z } from 'zod';

export const ERROR_CODES = [
  'USAGE_ERROR',
  'CONFIGURATION_ERROR',
  'ENVIRONMENT_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string().trim().min(1).max(1_000),
        repair: z.string().trim().min(1).max(1_000).optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
