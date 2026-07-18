import { z } from 'zod';

import { repositoryStatusSchema } from './memory.js';
import { statusResponseSchema } from './status.js';

export const gatekeeperMcpStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: statusResponseSchema,
    memory: repositoryStatusSchema,
  })
  .strict();

export type GatekeeperMcpStatus = z.infer<typeof gatekeeperMcpStatusSchema>;
