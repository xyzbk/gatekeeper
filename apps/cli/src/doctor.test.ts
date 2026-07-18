import { describe, expect, it } from 'vitest';

describe('runDoctor', () => {
  it('reports missing optional gh without crashing', async () => {
    const { runDoctor } = await import('./doctor.js');

    const result = await runDoctor({
      nodeVersion: 'v24.16.0',
      commandExists: (command) => Promise.resolve(command !== 'gh'),
      appDataPath: 'C:\\state\\gatekeeper',
      databasePath: 'C:\\state\\gatekeeper\\storage\\project-memory.sqlite3',
      ensureWritable: () => Promise.resolve(),
      probeProjectMemory: () =>
        Promise.resolve({ betterSqlite3: true, database: true, fts5: true, journalMode: 'wal' }),
    });

    expect(result.status).toBe('degraded');
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: 'gh', required: false, status: 'warn' }),
    );
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'betterSqlite3', status: 'pass' }),
        expect.objectContaining({ name: 'database', status: 'pass' }),
        expect.objectContaining({ name: 'fts5', status: 'pass' }),
      ]),
    );
  });

  it('fails when the Node major version is not 24', async () => {
    const { runDoctor } = await import('./doctor.js');

    const result = await runDoctor({
      nodeVersion: 'v22.0.0',
      commandExists: () => Promise.resolve(true),
      appDataPath: '/state/gatekeeper',
      databasePath: '/state/gatekeeper/storage/project-memory.sqlite3',
      ensureWritable: () => Promise.resolve(),
      probeProjectMemory: () =>
        Promise.resolve({ betterSqlite3: true, database: true, fts5: true, journalMode: 'wal' }),
    });

    expect(result.status).toBe('failed');
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: 'node', required: true, status: 'fail' }),
    );
  });

  it('fails safely when SQLite cannot open storage or provide FTS5', async () => {
    const { runDoctor } = await import('./doctor.js');

    const result = await runDoctor({
      nodeVersion: 'v24.16.0',
      commandExists: () => Promise.resolve(true),
      appDataPath: '/state/gatekeeper',
      databasePath: '/state/gatekeeper/storage/project-memory.sqlite3',
      ensureWritable: () => Promise.resolve(),
      probeProjectMemory: () =>
        Promise.resolve({
          betterSqlite3: true,
          database: false,
          fts5: false,
          journalMode: null,
        }),
    });

    expect(result.status).toBe('failed');
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database', required: true, status: 'fail' }),
        expect.objectContaining({ name: 'fts5', required: true, status: 'fail' }),
      ]),
    );
  });
});
