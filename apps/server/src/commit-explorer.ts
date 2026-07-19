import {
  commitExplorerInputSchema,
  commitExplorerResponseSchema,
  type CommitExplorerInput,
  type CommitExplorerResponse,
} from '@gatekeeper/contracts';
import type { GitProvider } from '@gatekeeper/git-adapter';
import type { ProjectMemory } from '@gatekeeper/project-memory';

const PAGE_SIZE = 24;
const GIT_BATCH_SIZE = 48;
const MAX_CANDIDATES_PER_REQUEST = 1_200;

export class CommitExplorerBranchUnavailableError extends Error {
  public constructor() {
    super('The selected local branch is unavailable.');
    this.name = 'CommitExplorerBranchUnavailableError';
  }
}

export interface CommitExplorerOptions {
  currentBranch: string | null;
  git: Pick<GitProvider, 'listBranchCommits' | 'listLocalBranches'>;
  memory: Pick<ProjectMemory, 'commitStates'>;
  repositoryId: string;
  repositoryRoot: string;
}

function matchesQuery(input: CommitExplorerInput, commit: { sha: string; title: string }): boolean {
  if (input.query === undefined) {
    return true;
  }
  const query = input.query.toLowerCase();
  return commit.sha.includes(query) || commit.title.toLowerCase().includes(query);
}

function matchesReviewState(
  reviewState: CommitExplorerInput['reviewState'],
  reviewed: boolean,
): boolean {
  return reviewState === 'all' || (reviewState === 'reviewed' ? reviewed : !reviewed);
}

export async function exploreCommits(
  input: CommitExplorerInput,
  options: CommitExplorerOptions,
): Promise<CommitExplorerResponse> {
  const parsed = commitExplorerInputSchema.parse(input);
  const branches = await options.git.listLocalBranches(options.repositoryRoot);
  const requestedBranch =
    parsed.branch ??
    (branches.some(({ name }) => name === 'master') ? 'master' : options.currentBranch);
  const branch = branches.find(({ name }) => name === requestedBranch);
  if (branch === undefined) {
    throw new CommitExplorerBranchUnavailableError();
  }

  const commits = [] as CommitExplorerResponse['commits'];
  let cursor = parsed.cursor ?? 0;
  let scanned = 0;
  while (commits.length < PAGE_SIZE && scanned < MAX_CANDIDATES_PER_REQUEST) {
    const page = await options.git.listBranchCommits(options.repositoryRoot, {
      ref: branch.ref,
      cursor,
      limit: GIT_BATCH_SIZE,
      sort: parsed.sort,
      ...(parsed.authoredAfter === undefined ? {} : { authoredAfter: parsed.authoredAfter }),
      ...(parsed.authoredBefore === undefined ? {} : { authoredBefore: parsed.authoredBefore }),
    });
    if (page.length === 0) {
      break;
    }
    const states = new Map(
      (
        await options.memory.commitStates(
          options.repositoryId,
          page.map(({ sha }) => sha),
        )
      ).map((state) => [state.sha, state]),
    );
    for (const [index, commit] of page.entries()) {
      cursor += 1;
      scanned += 1;
      const state = states.get(commit.sha) ?? { indexed: false, reviewed: false };
      if (
        (parsed.source === 'project_memory' && !state.indexed) ||
        !matchesQuery(parsed, commit) ||
        !matchesReviewState(parsed.reviewState, state.reviewed)
      ) {
        continue;
      }
      commits.push({
        sha: commit.sha,
        authoredAt: commit.authoredAt,
        title: commit.title,
        indexed: state.indexed,
        reviewed: state.reviewed,
      });
      if (commits.length === PAGE_SIZE) {
        return commitExplorerResponseSchema.parse({
          schemaVersion: 1,
          branches: branches.map(({ name }) => name),
          selection: { ...parsed, branch: branch.name },
          commits,
          nextCursor: index + 1 < page.length || page.length === GIT_BATCH_SIZE ? cursor : null,
        });
      }
    }
    if (page.length < GIT_BATCH_SIZE) {
      break;
    }
  }

  return commitExplorerResponseSchema.parse({
    schemaVersion: 1,
    branches: branches.map(({ name }) => name),
    selection: { ...parsed, branch: branch.name },
    commits,
    nextCursor: scanned === MAX_CANDIDATES_PER_REQUEST ? cursor : null,
  });
}
