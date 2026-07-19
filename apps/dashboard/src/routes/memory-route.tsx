import type { FormEvent } from 'react';
import { useState } from 'react';
import type { MemorySearchResult } from '@gatekeeper/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

import type { MemoryClient } from '../api/memory-client.js';
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

export function MemoryRoute({ searchMemory }: { searchMemory: MemoryClient['search'] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('query')?.trim() ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [submittedQuery, setSubmittedQuery] = useState(urlQuery);
  const searchQuery = useQuery({
    enabled: submittedQuery.length > 0,
    queryFn: () => searchMemory(submittedQuery),
    queryKey: ['memory-search', submittedQuery],
    retry: false,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length > 0) {
      setSubmittedQuery(value);
      setSearchParams({ query: value }, { replace: true });
    }
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
    </section>
  );
}
