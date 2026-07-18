import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { parsePolicy, PolicyValidationError, type GatekeeperPolicy } from './policy.js';

const MAX_POLICY_BYTES = 256 * 1_024;

export type RepositoryPolicyErrorCode =
  | 'INVALID_REPOSITORY_ROOT'
  | 'INVALID_POLICY'
  | 'INVALID_POLICY_FILE'
  | 'MISSING_POLICY'
  | 'UNSAFE_POLICY_PATH';

export class RepositoryPolicyError extends Error {
  public constructor(
    public readonly code: RepositoryPolicyErrorCode,
    message: string,
    public readonly issuePaths: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RepositoryPolicyError';
  }
}

export interface LoadedRepositoryPolicy {
  path: string;
  policy: GatekeeperPolicy;
  source: 'default' | 'file';
}

export interface LoadRepositoryPolicyOptions {
  required?: boolean;
}

function isPathWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

async function canonicalRepositoryRoot(repositoryRoot: string): Promise<string> {
  try {
    const canonicalRoot = await realpath(resolve(repositoryRoot));
    if (!(await stat(canonicalRoot)).isDirectory()) {
      throw new RepositoryPolicyError(
        'INVALID_REPOSITORY_ROOT',
        'The repository root must be a directory.',
      );
    }
    return canonicalRoot;
  } catch (error) {
    if (error instanceof RepositoryPolicyError) {
      throw error;
    }
    throw new RepositoryPolicyError(
      'INVALID_REPOSITORY_ROOT',
      'The repository root is not accessible.',
      [],
      { cause: error },
    );
  }
}

export async function loadRepositoryPolicy(
  repositoryRoot: string,
  options: LoadRepositoryPolicyOptions = {},
): Promise<LoadedRepositoryPolicy> {
  const root = await canonicalRepositoryRoot(repositoryRoot);
  const policyPath = join(root, '.gatekeeper', 'policies.yaml');
  let policyStat;

  try {
    policyStat = await lstat(policyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (options.required === true) {
        throw new RepositoryPolicyError(
          'MISSING_POLICY',
          'No .gatekeeper/policies.yaml file was found.',
        );
      }
      return { path: policyPath, policy: { version: 1 }, source: 'default' };
    }
    throw new RepositoryPolicyError(
      'INVALID_POLICY_FILE',
      'The repository policy file could not be inspected safely.',
      [],
      { cause: error },
    );
  }

  if (policyStat.size > MAX_POLICY_BYTES) {
    throw new RepositoryPolicyError(
      'INVALID_POLICY_FILE',
      'The repository policy file exceeds the 256 KiB limit.',
    );
  }

  let canonicalPolicyPath: string;
  try {
    canonicalPolicyPath = await realpath(policyPath);
  } catch (error) {
    throw new RepositoryPolicyError(
      'INVALID_POLICY_FILE',
      'The repository policy file is not accessible.',
      [],
      { cause: error },
    );
  }
  if (!isPathWithin(root, canonicalPolicyPath)) {
    throw new RepositoryPolicyError(
      'UNSAFE_POLICY_PATH',
      'The repository policy file resolves outside the repository.',
    );
  }

  const canonicalPolicyStat = await stat(canonicalPolicyPath);
  if (!canonicalPolicyStat.isFile() || canonicalPolicyStat.size > MAX_POLICY_BYTES) {
    throw new RepositoryPolicyError(
      'INVALID_POLICY_FILE',
      'The repository policy must be a regular file no larger than 256 KiB.',
    );
  }

  let source: string;
  try {
    source = await readFile(canonicalPolicyPath, 'utf8');
  } catch (error) {
    throw new RepositoryPolicyError(
      'INVALID_POLICY_FILE',
      'The repository policy file could not be read.',
      [],
      { cause: error },
    );
  }

  try {
    return { path: policyPath, policy: parsePolicy(source), source: 'file' };
  } catch (error) {
    if (error instanceof PolicyValidationError) {
      const issuePaths = [...new Set(error.issues.map(({ path }) => path))];
      throw new RepositoryPolicyError(
        'INVALID_POLICY',
        `The repository policy is invalid at: ${issuePaths.join(', ')}.`,
        issuePaths,
      );
    }
    throw error;
  }
}
