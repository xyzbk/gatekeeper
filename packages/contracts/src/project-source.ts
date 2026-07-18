import { z } from 'zod';

import { repositoryRelativePathSchema } from './change.js';

export const trackedFileRecordSchema = z
  .object({
    path: repositoryRelativePathSchema,
    objectId: z.string().regex(/^[0-9a-f]{40,64}$/),
    mode: z.string().regex(/^\d{6}$/),
    sizeBytes: z.int().nonnegative().nullable(),
  })
  .strict();

export const gitCommitRecordSchema = z
  .object({
    sha: z.string().regex(/^[0-9a-f]{40,64}$/),
    authoredAt: z.iso.datetime({ offset: true }),
    title: z.string().trim().min(1).max(300),
    message: z.string().max(2_000),
  })
  .strict();

export type TrackedFileRecord = z.infer<typeof trackedFileRecordSchema>;
export type GitCommitRecord = z.infer<typeof gitCommitRecordSchema>;
