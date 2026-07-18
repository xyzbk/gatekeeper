import { describe, expect, it } from 'vitest';

import { gitCommitRecordSchema, trackedFileRecordSchema } from './project-source.js';

describe('Project Memory Git-source contracts', () => {
  it('accepts bounded tracked-file metadata and rejects unsafe paths', () => {
    const file = {
      path: 'docs/architecture/Project Memory.md',
      objectId: 'a'.repeat(40),
      mode: '100644',
      sizeBytes: 128,
    } as const;

    expect(trackedFileRecordSchema.parse(file)).toEqual(file);
    expect(() => trackedFileRecordSchema.parse({ ...file, path: '../secret.md' })).toThrow();
    expect(() => trackedFileRecordSchema.parse({ ...file, objectId: 'not-a-hash' })).toThrow();
    expect(() => trackedFileRecordSchema.parse({ ...file, mode: '644' })).toThrow();
    expect(() => trackedFileRecordSchema.parse({ ...file, privateContent: 'secret' })).toThrow();
  });

  it('accepts bounded commit metadata and rejects malformed records', () => {
    const commit = {
      sha: 'b'.repeat(40),
      authoredAt: '2026-07-18T18:00:00+03:00',
      title: 'Document Redis rollback',
      message: 'Explain why required Redis was reverted.',
    } as const;

    expect(gitCommitRecordSchema.parse(commit)).toEqual(commit);
    expect(() => gitCommitRecordSchema.parse({ ...commit, title: '' })).toThrow();
    expect(() => gitCommitRecordSchema.parse({ ...commit, message: 'x'.repeat(2_001) })).toThrow();
    expect(() => gitCommitRecordSchema.parse({ ...commit, command: 'git push' })).toThrow();
  });
});
