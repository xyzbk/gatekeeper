import { CHANGE_STATUSES } from '@gatekeeper/domain';
import { z } from 'zod';

export { CHANGE_STATUSES } from '@gatekeeper/domain';

export const repositoryRelativePathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine(
    (value) =>
      value === value.trim() &&
      !value.startsWith('/') &&
      !value.includes('\\') &&
      [...value].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      }) &&
      !/^[A-Za-z]:\//.test(value) &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a canonical repository-relative POSIX path.',
  );

const changedFileSummaryShape = {
  path: repositoryRelativePathSchema,
  previousPath: repositoryRelativePathSchema.optional(),
  status: z.enum(CHANGE_STATUSES),
  additions: z.int().nonnegative(),
  deletions: z.int().nonnegative(),
  binary: z.boolean(),
  contentTruncated: z.boolean(),
};

function validateRename(
  value: { previousPath?: string | undefined; status: ChangeStatus },
  context: z.RefinementCtx,
): void {
  const { previousPath, status } = value;

  if (status === 'renamed' && previousPath === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'A renamed file requires previousPath.',
      path: ['previousPath'],
    });
  }

  if (status !== 'renamed' && previousPath !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Only a renamed file may include previousPath.',
      path: ['previousPath'],
    });
  }
}

export const changedFileSummarySchema = z
  .object(changedFileSummaryShape)
  .strict()
  .superRefine(validateRename);

export const changedFileSchema = z
  .object({
    ...changedFileSummaryShape,
    addedLines: z.array(z.string().max(2_000)).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const { addedLines, binary } = value;
    validateRename(value, context);

    if (binary && addedLines.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Binary files cannot include inspected added lines.',
        path: ['addedLines'],
      });
    }
  });

export const changeSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    target: z
      .object({
        kind: z.literal('worktree'),
        display: z.literal('Current worktree'),
      })
      .strict(),
    files: z.array(changedFileSchema).max(500),
  })
  .strict();

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export type ChangedFile = z.infer<typeof changedFileSchema>;
export type ChangedFileSummary = z.infer<typeof changedFileSummarySchema>;
export type ChangeSet = z.infer<typeof changeSetSchema>;
