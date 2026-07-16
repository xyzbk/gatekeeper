import { parse } from 'yaml';
import { z } from 'zod';

const globSchema = z.string().trim().min(1);
const enforcementSchema = z.enum(['advisory', 'required', 'hard']);
const relationshipBase = {
  id: z.string().trim().min(1),
  source: z.array(globSchema).min(1),
  enforcement: enforcementSchema,
};

const policySchema = z
  .object({
    version: z.literal(1),
    repository: z
      .object({ defaultBase: z.string().trim().min(1) })
      .strict()
      .optional(),
    review: z
      .object({
        linkedIssue: z
          .object({ required: z.boolean(), enforcement: enforcementSchema })
          .strict()
          .optional(),
        description: z
          .object({ required: z.boolean(), enforcement: enforcementSchema })
          .strict()
          .optional(),
        maxChangedFiles: z
          .object({ value: z.int().nonnegative(), enforcement: enforcementSchema })
          .strict()
          .optional(),
        maxChangedLines: z
          .object({ value: z.int().nonnegative(), enforcement: enforcementSchema })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    paths: z
      .object({ ignore: z.array(globSchema) })
      .strict()
      .optional(),
    tests: z
      .object({
        relationships: z.array(
          z.object({ ...relationshipBase, tests: z.array(globSchema).min(1) }).strict(),
        ),
      })
      .strict()
      .optional(),
    documentation: z
      .object({
        relationships: z.array(
          z.object({ ...relationshipBase, documentation: z.array(globSchema).min(1) }).strict(),
        ),
      })
      .strict()
      .optional(),
    riskZones: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            paths: z.array(globSchema).min(1),
            level: z.enum(['low', 'medium', 'high', 'critical']),
            verdictFloor: z.enum(['FAST_PATH', 'REQUIRE_CHANGES', 'ESCALATE']),
            requirements: z
              .array(z.enum(['tests', 'documentation', 'linkedIssue', 'description']))
              .optional(),
          })
          .strict(),
      )
      .optional(),
    protectedPaths: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            paths: z.array(globSchema).min(1),
            enforcement: enforcementSchema,
            message: z.string().trim().min(1),
          })
          .strict(),
      )
      .optional(),
    architecture: z
      .object({
        importBoundaries: z.array(
          z
            .object({
              id: z.string().trim().min(1),
              from: z.array(globSchema).min(1),
              deny: z.array(globSchema).min(1),
              enforcement: enforcementSchema,
              rationale: z.string().trim().min(1).optional(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
    generatedFiles: z
      .object({ deny: z.array(globSchema).min(1), enforcement: enforcementSchema })
      .strict()
      .optional(),
  })
  .strict();

export interface PolicyIssue {
  message: string;
  path: string;
}

export class PolicyValidationError extends Error {
  override readonly name = 'PolicyValidationError';

  constructor(readonly issues: PolicyIssue[]) {
    super(issues.map(({ message, path }) => `${path}: ${message}`).join('; '));
  }
}

export function parsePolicy(source: string): z.infer<typeof policySchema> {
  let input: unknown;

  try {
    input = parse(source);
  } catch (error) {
    throw new PolicyValidationError([
      { path: '$', message: error instanceof Error ? error.message : 'Invalid YAML.' },
    ]);
  }

  const result = policySchema.safeParse(input);
  if (!result.success) {
    throw new PolicyValidationError(
      result.error.issues.map(({ message, path }) => ({
        path: path.length === 0 ? '$' : path.map(String).join('.'),
        message,
      })),
    );
  }

  return result.data;
}

export type GatekeeperPolicy = z.infer<typeof policySchema>;
