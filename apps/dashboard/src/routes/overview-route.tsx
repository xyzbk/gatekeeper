import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { StatusClient } from '../api/status-client.js';
import styles from '../styles/dashboard.module.css';

interface OverviewRouteProps {
  loadStatus: StatusClient['getStatus'];
}

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

export function OverviewRoute({ loadStatus }: OverviewRouteProps) {
  const statusQuery = useQuery({
    queryFn: ({ signal }) => loadStatus(signal),
    queryKey: ['gatekeeper', 'status'],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5_000,
  });

  if (statusQuery.isPending) {
    return <LoadingState />;
  }

  if (statusQuery.isError) {
    return <ErrorState retry={() => void statusQuery.refetch()} />;
  }

  const { features, paths, repository, service, tools } = statusQuery.data;
  const repositoryName = repository.root.split(/[\\/]/).filter(Boolean).at(-1) ?? repository.root;

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
            <p>Git state captured when Gatekeeper started.</p>
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
