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
        Promise.resolve({
          betterSqlite3: true,
          database: true,
          fts5: true,
          journalMode: 'wal',
          storedState: { integrity: 'ok', corruptReviewOperations: 0 },
        }),
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
        Promise.resolve({
          betterSqlite3: true,
          database: true,
          fts5: true,
          journalMode: 'wal',
          storedState: { integrity: 'ok', corruptReviewOperations: 0 },
        }),
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
          storedState: { integrity: 'corrupt', corruptReviewOperations: 0 },
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

  it('reports corrupt review operations with an explicit local repair command', async () => {
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
          database: true,
          fts5: true,
          journalMode: 'wal',
          storedState: { integrity: 'corrupt' as const, corruptReviewOperations: 1 },
        }),
    });

    expect(result.status).toBe('failed');
    expect(result.checks).toContainEqual({
      name: 'storedState',
      required: true,
      status: 'fail',
      message: 'Stored review operation state is corrupt.',
      repair:
        'Run gatekeeper doctor --repair to back up and remove only corrupt review operations.',
    });
  });

  it('repairs only after the explicit flag, then reports the local backup', async () => {
    const { runDoctor } = await import('./doctor.js');
    let repaired = false;
    const result = await runDoctor(
      {
        nodeVersion: 'v24.16.0',
        commandExists: () => Promise.resolve(true),
        appDataPath: '/state/gatekeeper',
        databasePath: '/state/gatekeeper/storage/project-memory.sqlite3',
        ensureWritable: () => Promise.resolve(),
        probeProjectMemory: () =>
          Promise.resolve({
            betterSqlite3: true,
            database: true,
            fts5: true,
            journalMode: 'wal',
            storedState: repaired
              ? { integrity: 'ok' as const, corruptReviewOperations: 0 }
              : { integrity: 'corrupt' as const, corruptReviewOperations: 1 },
          }),
        repairProjectMemory: () => {
          repaired = true;
          return Promise.resolve({
            repaired: 1,
            backupPath: '/state/gatekeeper/storage/backups/project-memory-before-repair.sqlite3',
          });
        },
      },
      { repair: true },
    );

    expect(result.status).toBe('ok');
    expect(result.checks).toContainEqual({
      name: 'storedState',
      required: true,
      status: 'pass',
      message:
        'Repaired 1 corrupt review operation. Backup: /state/gatekeeper/storage/backups/project-memory-before-repair.sqlite3',
    });
  });
});
