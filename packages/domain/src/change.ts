export const CHANGE_STATUSES = ['added', 'modified', 'deleted', 'renamed', 'untracked'] as const;

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export interface ChangedFileSummary {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  contentTruncated: boolean;
}

export interface ChangedFile extends ChangedFileSummary {
  addedLines: string[];
}

export interface ChangeSet {
  schemaVersion: 1;
  target: { kind: 'worktree'; display: 'Current worktree' };
  files: ChangedFile[];
}
