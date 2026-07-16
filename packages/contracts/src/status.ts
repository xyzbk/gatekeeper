import { z } from 'zod';

const nonEmptyStringSchema = z.string().trim().min(1);
const loopbackServiceUrlSchema = z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/);
const bearerTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,}$/);

export const repositorySnapshotSchema = z
  .object({
    root: nonEmptyStringSchema,
    branch: nonEmptyStringSchema.nullable(),
    head: z.string().regex(/^[0-9a-f]{40,64}$/),
    dirty: z.boolean(),
    remote: nonEmptyStringSchema.nullable(),
  })
  .strict();

export const toolAvailabilitySchema = z
  .object({
    available: z.boolean(),
    version: nonEmptyStringSchema.nullable(),
  })
  .strict();

export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    version: nonEmptyStringSchema,
  })
  .strict();

export const statusResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    service: z
      .object({
        state: z.literal('ready'),
        version: nonEmptyStringSchema,
        startedAt: z.iso.datetime(),
        baseUrl: loopbackServiceUrlSchema,
      })
      .strict(),
    repository: repositorySnapshotSchema,
    tools: z
      .object({
        git: toolAvailabilitySchema,
        gh: toolAvailabilitySchema,
      })
      .strict(),
    features: z
      .object({
        modelReasoning: z.literal('disabled'),
        projectMemory: z.literal('not_initialized'),
      })
      .strict(),
    paths: z
      .object({
        appData: nonEmptyStringSchema,
        serviceMetadata: nonEmptyStringSchema,
        storage: nonEmptyStringSchema,
      })
      .strict(),
  })
  .strict();

export const dashboardBootstrapSchema = z
  .object({
    apiBaseUrl: z.literal('/v1'),
    bearerToken: bearerTokenSchema,
  })
  .strict();

export const serviceMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    pid: z.int().positive(),
    port: z.int().min(1).max(65_535),
    baseUrl: loopbackServiceUrlSchema,
    bearerToken: bearerTokenSchema,
    repositoryRoot: nonEmptyStringSchema,
    startedAt: z.iso.datetime(),
  })
  .strict();

export const emptyRequestSchema = z.object({}).strict();

export const healthResponseJsonSchema = {
  $id: 'gatekeeper:health-response',
  ...z.toJSONSchema(healthResponseSchema, { target: 'draft-7' }),
};

export const statusResponseJsonSchema = {
  $id: 'gatekeeper:status-response-v1',
  ...z.toJSONSchema(statusResponseSchema, { target: 'draft-7' }),
};

export const dashboardBootstrapJsonSchema = {
  $id: 'gatekeeper:dashboard-bootstrap-v1',
  ...z.toJSONSchema(dashboardBootstrapSchema, { target: 'draft-7' }),
};

export const emptyRequestJsonSchema = {
  $id: 'gatekeeper:empty-request',
  ...z.toJSONSchema(emptyRequestSchema, { target: 'draft-7' }),
};

export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type ToolAvailability = z.infer<typeof toolAvailabilitySchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type DashboardBootstrap = z.infer<typeof dashboardBootstrapSchema>;
export type ServiceMetadata = z.infer<typeof serviceMetadataSchema>;
