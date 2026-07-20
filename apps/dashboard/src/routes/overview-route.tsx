import { useMutation, useQuery } from '@tanstack/react-query';
import type { GitHubSyncResult, IndexResult } from '@gatekeeper/contracts';
import type { ReactNode } from 'react';

import type { MemoryClient } from '../api/memory-client.js';
import type { StatusClient } from '../api/status-client.js';
import styles from '../styles/dashboard.module.css';

interface OverviewRouteProps {
  getMemoryStatus: MemoryClient['getMemoryStatus'];
  indexLocalMemory: MemoryClient['indexLocalMemory'];
  loadStatus: StatusClient['getStatus'];
  syncGitHubHistory: MemoryClient['syncGitHubHistory'];
  lastAction?: RepositoryControlAction | null;
  onActionResult?: (action: RepositoryControlAction) => void;
}

export type RepositoryControlAction =
  | { kind: 'index'; result: IndexResult }
  | { kind: 'sync'; result: GitHubSyncResult };

interface FieldProps {
  label: string;
  mono?: boolean;
  value: ReactNode;
}

function Field({ label, mono = false, value }: FieldProps) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd className={mono ? styles.mono : undefined}>{value}</dd>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-label="Reading repository status…" className={styles.loadingState} role="status">
      <div>
        <div className={`${styles.skeleton} ${styles.skeletonContext}`} />
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <p>Reading repository status…</p>
      </div>
      <div className={styles.loadingGrid}>
        <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
        <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
        <div className={`${styles.skeleton} ${styles.skeletonWide}`} />
      </div>
    </div>
  );
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <section className={styles.errorState}>
      <p className={styles.contextLabel}>Local service</p>
      <h1>Status is unavailable</h1>
      <div role="alert">
        <p>Gatekeeper could not read local status.</p>
        <p>Confirm the foreground service is still running, then retry.</p>
      </div>
      <button onClick={retry} type="button">
        Retry status request
      </button>
    </section>
  );
}

export function OverviewRoute({
  getMemoryStatus,
  indexLocalMemory,
  loadStatus,
  syncGitHubHistory,
  lastAction = null,
  onActionResult,
}: OverviewRouteProps) {
  const statusQuery = useQuery({
    queryFn: ({ signal }) => loadStatus(signal),
    queryKey: ['gatekeeper', 'status'],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5_000,
  });
  const memoryStatusQuery = useQuery({
    queryFn: ({ signal }) => getMemoryStatus(signal),
    queryKey: ['gatekeeper', 'memory-status'],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5_000,
  });
  const indexMemory = useMutation({
    mutationFn: () => indexLocalMemory(),
    onSuccess: (result) => {
      onActionResult?.({ kind: 'index', result });
      void memoryStatusQuery.refetch();
    },
  });
  const syncGitHub = useMutation({
    mutationFn: () => syncGitHubHistory(),
    onSuccess: (result) => onActionResult?.({ kind: 'sync', result }),
  });

  if (statusQuery.isPending) {
    return <LoadingState />;
  }

  if (statusQuery.isError) {
    return <ErrorState retry={() => void statusQuery.refetch()} />;
  }

  const { features, paths, repository, service, tools } = statusQuery.data;
  const repositoryName = repository.root.split(/[\\/]/).filter(Boolean).at(-1) ?? repository.root;
  const memoryStatus = memoryStatusQuery.data;
  const indexedHead = memoryStatus?.state === 'ready' ? memoryStatus.indexState?.head : null;
  const memoryState =
    memoryStatusQuery.isError
      ? 'Unavailable — local memory status could not be read.'
      : memoryStatus === undefined
      ? 'Reading Project Memory state…'
      : memoryStatus.state === 'not_initialized'
        ? 'Not initialized'
        : indexedHead === null
          ? 'Not indexed'
          : indexedHead === repository.head
            ? 'Ready — indexed HEAD matches local HEAD.'
            : 'Stale — local HEAD changed since the last index.';
  const rememberedIndexResult = lastAction?.kind === 'index' ? lastAction.result : undefined;
  const rememberedSyncResult = lastAction?.kind === 'sync' ? lastAction.result : undefined;
  const indexResult = indexMemory.data ?? rememberedIndexResult;
  const syncResult = syncGitHub.data ?? rememberedSyncResult;

  return (
    <>
      <header className={styles.repositoryHeader}>
        <div>
          <p className={styles.contextLabel}>Repository overview</p>
          <h1>{repositoryName}</h1>
          <p className={`${styles.repositoryRoot} ${styles.mono}`}>{repository.root}</p>
        </div>
        <div aria-label="Repository state" className={styles.repositoryState}>
          <span>{repository.branch ?? 'Detached HEAD'}</span>
          <span>{repository.dirty ? 'Uncommitted changes' : 'Clean worktree'}</span>
        </div>
      </header>

      <div className={styles.overviewGrid}>
        <section className={`${styles.panel} ${styles.repositoryPanel}`}>
          <div className={styles.panelHeader}>
            <h2>Repository</h2>
            <p>Live Git state for the repository fixed when Gatekeeper started.</p>
          </div>
          <dl className={styles.fieldList}>
            <Field label="Root" mono value={repository.root} />
            <Field label="Branch" mono value={repository.branch ?? 'Detached HEAD'} />
            <Field label="HEAD" mono value={repository.head} />
            <Field label="Worktree" value={repository.dirty ? 'Uncommitted changes' : 'Clean'} />
            <Field label="Origin" mono value={repository.remote ?? 'No origin remote configured'} />
          </dl>
        </section>

        <section className={`${styles.panel} ${styles.environmentPanel}`}>
          <div className={styles.panelHeader}>
            <h2>Environment</h2>
            <p>Local capabilities, without authentication checks.</p>
          </div>
          <dl className={styles.fieldList}>
            <Field
              label="Git"
              mono
              value={tools.git.available ? (tools.git.version ?? 'Available') : 'Not installed'}
            />
            <Field
              label="GitHub CLI"
              mono
              value={tools.gh.available ? (tools.gh.version ?? 'Available') : 'Not installed'}
            />
            <Field
              label="Model reasoning"
              value={features.modelReasoning === 'disabled' ? 'Disabled' : features.modelReasoning}
            />
            <Field
              label="Project Memory"
              value={
                features.projectMemory === 'not_initialized'
                  ? 'Not initialized'
                  : features.projectMemory
              }
            />
          </dl>
        </section>

        <section className={`${styles.panel} ${styles.repositoryControlPanel}`}>
          <div className={styles.panelHeader}>
            <h2>Repository Control</h2>
            <p>Explicit local indexing and bounded, read-only GitHub history retrieval.</p>
          </div>
          <dl className={styles.fieldList}>
            <Field label="Memory state" value={memoryState} />
            <Field label="Local HEAD" mono value={repository.head} />
            <Field label="Indexed HEAD" mono value={indexedHead ?? 'Not indexed'} />
          </dl>
          <div className={styles.repositoryControls}>
            <div>
              <button
                className={styles.primaryButton}
                disabled={indexMemory.isPending || syncGitHub.isPending}
                onClick={() => indexMemory.mutate()}
                type="button"
              >
                {indexMemory.isPending ? 'Indexing local memory…' : 'Index local memory'}
              </button>
              <p>Reads the fixed local repository and updates only its local Project Memory.</p>
            </div>
            <div>
              <button
                className={styles.secondaryButton}
                disabled={indexMemory.isPending || syncGitHub.isPending}
                onClick={() => syncGitHub.mutate()}
                type="button"
              >
                {syncGitHub.isPending ? 'Syncing GitHub history…' : 'Sync GitHub history'}
              </button>
              <p>Reads GitHub via configured gh; stores bounded local evidence; makes no GitHub changes.</p>
            </div>
          </div>
          {memoryStatusQuery.isError ? (
            <p className={styles.repositoryControlError} role="alert">
              Project Memory status is unavailable. Confirm the foreground service is running, then
              retry a control when it is ready.
            </p>
          ) : null}
          {indexResult !== undefined ? (
            <p className={styles.repositoryControlResult} role="status">
              Indexed {indexResult.files.scanned} files, {indexResult.documents.scanned} documents, and{' '}
              {indexResult.commits.scanned} commits.
            </p>
          ) : null}
          {indexMemory.isError ? (
            <p className={styles.repositoryControlError} role="alert">
              Local indexing could not be completed. Confirm the fixed repository remains accessible,
              then retry.
            </p>
          ) : null}
          {syncResult !== undefined ? (
            <div className={styles.repositoryControlResult} role="status">
              <p>
                {syncResult.partial ? 'Sync completed partially.' : 'Sync completed.'}{' '}
                {syncResult.documents.received} documents received; {syncResult.links.received} links received.
              </p>
              {syncResult.partial ? (
                <p>Some history was unavailable. Retry sync after resolving local gh access.</p>
              ) : null}
            </div>
          ) : null}
          {syncGitHub.isError ? (
            <p className={styles.repositoryControlError} role="alert">
              GitHub history could not be synced. Confirm gh can read the fixed repository, then retry.
            </p>
          ) : null}
        </section>

        <section className={`${styles.panel} ${styles.pathsPanel}`}>
          <div className={styles.panelHeader}>
            <h2>Local service</h2>
            <p>Machine-local connection and storage locations.</p>
          </div>
          <div className={styles.serviceSummary}>
            <div>
              <span>State</span>
              <strong>{service.state === 'ready' ? 'Ready' : service.state}</strong>
            </div>
            <div>
              <span>Version</span>
              <strong className={styles.mono}>{service.version}</strong>
            </div>
            <div>
              <span>Started</span>
              <strong>
                <time dateTime={service.startedAt}>
                  {new Date(service.startedAt).toLocaleString()}
                </time>
              </strong>
            </div>
          </div>
          <dl className={styles.pathList}>
            <Field label="Endpoint" mono value={service.baseUrl} />
            <Field label="App data" mono value={paths.appData} />
            <Field label="Service metadata" mono value={paths.serviceMetadata} />
            <Field label="Storage" mono value={paths.storage} />
          </dl>
        </section>
      </div>
    </>
  );
}
