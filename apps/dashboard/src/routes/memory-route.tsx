import type { FormEvent } from 'react';
import { useState } from 'react';
import type { MemorySearchResult, RecentCommitEvidence } from '@gatekeeper/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';

import type { MemoryClient } from '../api/memory-client.js';
import type { ReviewClient } from '../api/review-client.js';
import styles from '../styles/dashboard.module.css';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  timeZoneName: 'short',
  year: 'numeric',
});

function EvidenceResult({ result }: { result: MemorySearchResult }) {
  const path = result.evidence.path ?? result.evidence.sourceId;
  return (
    <li className={styles.memoryResult}>
      <article>
        <div className={styles.memoryResultHeading}>
          <p className={styles.mono}>{path}</p>
          <span>{result.status}</span>
        </div>
        <p className={styles.memoryExcerpt}>
          {result.evidence.excerpt ?? 'No bounded excerpt is available.'}
        </p>
        <div aria-label="Evidence metadata" className={styles.memoryMetadata}>
          <span>Source: {result.evidence.sourceType}</span>
          <span>Match: {result.match}</span>
          {result.relationship === undefined ? null : (
            <span>Relationship: {result.relationship.replaceAll('_', ' ')}</span>
          )}
          <span>Trust: {result.trust.replaceAll('_', ' ')}</span>
          <span>
            Occurred:{' '}
            {result.occurredAt === null
              ? 'Not dated'
              : dateFormatter.format(new Date(result.occurredAt))}
          </span>
        </div>
      </article>
    </li>
  );
}

function SearchResults({ query, results }: { query: string; results: MemorySearchResult[] }) {
  if (results.length === 0) {
    return (
      <section aria-live="polite" className={styles.memoryEmpty}>
        <h2>No indexed evidence matched “{query}”.</h2>
        <p>Try a path, decision phrase, or commit topic.</p>
      </section>
    );
  }
  return (
    <section aria-live="polite" aria-labelledby="memory-results" className={styles.memoryResults}>
      <div className={styles.memoryResultsHeader}>
        <h2 id="memory-results">Evidence</h2>
        <span>{results.length}</span>
      </div>
      <ol>
        {results.map((result) => (
          <EvidenceResult key={result.documentId} result={result} />
        ))}
      </ol>
    </section>
  );
}

function RecentCommitHistory({
  commits,
  onReview,
  pendingSha,
}: {
  commits: RecentCommitEvidence[];
  onReview: (sha: string) => void;
  pendingSha: string | undefined;
}) {
  if (commits.length === 0) {
    return (
      <section className={styles.memoryEmpty}>
        <h2>No indexed commits yet.</h2>
        <p>Index this repository to add its latest local commit evidence.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="recent-commits" className={styles.memoryResults}>
      <div className={styles.memoryResultsHeader}>
        <h2 id="recent-commits">Recent commit evidence</h2>
        <span>{commits.length}</span>
      </div>
      <p className={styles.memoryHistoryNote}>
        Last 10 indexed commits. Titles are untrusted repository text.
      </p>
      <div className={styles.memoryTableWrap}>
        <table className={styles.memoryTable}>
          <caption>Historical commits use a first-parent review.</caption>
          <thead>
            <tr>
              <th scope="col">Commit</th>
              <th scope="col">SHA</th>
              <th scope="col">Authored</th>
              <th scope="col">
                <span className={styles.srOnly}>Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {commits.map((commit) => (
              <tr key={commit.sha}>
                <td>{commit.title}</td>
                <td className={styles.mono}>{commit.sha.slice(0, 12)}</td>
                <td>{dateFormatter.format(new Date(commit.authoredAt))}</td>
                <td>
                  <button
                    className={styles.secondaryButton}
                    disabled={pendingSha !== undefined}
                    onClick={() => onReview(commit.sha)}
                    type="button"
                  >
                    {pendingSha === commit.sha ? 'Starting…' : 'Review commit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MemoryRoute({
  recentCommits,
  searchMemory,
  startCommitReview,
}: {
  recentCommits: MemoryClient['recentCommits'];
  searchMemory: MemoryClient['search'];
  startCommitReview: ReviewClient['startCommitReview'];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = searchParams.get('query')?.trim() ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [submittedQuery, setSubmittedQuery] = useState(urlQuery);
  const searchQuery = useQuery({
    enabled: submittedQuery.length > 0,
    queryFn: () => searchMemory(submittedQuery),
    queryKey: ['memory-search', submittedQuery],
    retry: false,
  });
  const historyQuery = useQuery({
    enabled: submittedQuery.length === 0,
    queryFn: () => recentCommits(),
    queryKey: ['memory-recent-commits'],
    retry: false,
  });
  const reviewCommit = useMutation({
    mutationFn: (sha: string) => startCommitReview(sha),
    onSuccess: (operation) => navigate(`/reviews/${operation.reviewId}`),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length > 0) {
      setSubmittedQuery(value);
      setSearchParams({ query: value }, { replace: true });
    }
  };
  const clearSearch = () => {
    setQuery('');
    setSubmittedQuery('');
    setSearchParams({}, { replace: true });
  };

  return (
    <section className={styles.memoryPage}>
      <header className={styles.memoryPageHeader}>
        <p className={styles.contextLabel}>Project Memory</p>
        <h1>Search project memory</h1>
        <p>
          Find bounded evidence from repository decisions, documentation, policy, and recent commit
          history. Results are untrusted repository content.
        </p>
      </header>
      <form className={styles.memorySearchForm} onSubmit={submit} role="search">
        <label htmlFor="memory-query">Evidence query</label>
        <div>
          <input
            autoComplete="off"
            id="memory-query"
            maxLength={256}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. cache decision, README.md, or commit topic…"
            required
            type="search"
            value={query}
          />
          <button className={styles.primaryButton} disabled={searchQuery.isFetching} type="submit">
            {searchQuery.isFetching ? 'Searching…' : 'Search memory'}
          </button>
        </div>
      </form>
      {submittedQuery.length > 0 ? (
        <button className={styles.secondaryButton} onClick={clearSearch} type="button">
          Clear search
        </button>
      ) : null}
      {searchQuery.isFetching ? (
        <div aria-label="Searching project memory…" className={styles.memoryProgress} role="status">
          <div className={`${styles.skeleton} ${styles.memorySkeletonPath}`} />
          <div className={`${styles.skeleton} ${styles.memorySkeletonExcerpt}`} />
          <span>Searching project memory…</span>
        </div>
      ) : null}
      {searchQuery.isError ? (
        <div className={styles.memoryError} role="alert">
          <p>Project Memory search did not complete.</p>
          <p>Confirm the local service is ready, then retry the same query.</p>
          <button
            className={styles.secondaryButton}
            onClick={() => void searchQuery.refetch()}
            type="button"
          >
            Retry search
          </button>
        </div>
      ) : null}
      {searchQuery.isSuccess && submittedQuery.length > 0 ? (
        <SearchResults query={submittedQuery} results={searchQuery.data} />
      ) : null}
      {reviewCommit.isError ? (
        <p className={styles.memoryError} role="alert">
          Gatekeeper could not start the historical review.
        </p>
      ) : null}
      {submittedQuery.length === 0 && historyQuery.isPending ? (
        <div className={styles.memoryProgress} role="status">
          Loading recent commit evidence…
        </div>
      ) : null}
      {submittedQuery.length === 0 && historyQuery.isError ? (
        <div className={styles.memoryError} role="alert">
          <p>Recent commit evidence could not be loaded.</p>
          <button
            className={styles.secondaryButton}
            onClick={() => void historyQuery.refetch()}
            type="button"
          >
            Retry history
          </button>
        </div>
      ) : null}
      {submittedQuery.length === 0 && historyQuery.isSuccess ? (
        <RecentCommitHistory
          commits={historyQuery.data}
          onReview={(sha) => reviewCommit.mutate(sha)}
          pendingSha={reviewCommit.isPending ? reviewCommit.variables : undefined}
        />
      ) : null}
    </section>
  );
}
