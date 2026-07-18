import { z } from 'zod';

import { repositoryStatusSchema } from './memory.js';
import { statusResponseSchema } from './status.js';

export const gatekeeperMcpStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: statusResponseSchema,
    memory: repositoryStatusSchema,
  })
  .strict()
  .superRefine(({ status, memory }, context) => {
    if (memory.state === 'ready' && memory.repository.root !== status.repository.root) {
      context.addIssue({
        code: 'custom',
        message: 'MCP status and memory must describe the same fixed repository.',
        path: ['memory', 'repository', 'root'],
      });
    }
  });

export type GatekeeperMcpStatus = z.infer<typeof gatekeeperMcpStatusSchema>;
