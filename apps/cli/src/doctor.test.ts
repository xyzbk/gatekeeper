import { describe, expect, it } from 'vitest';

describe('runDoctor', () => {
  it('reports missing optional gh without crashing', async () => {
    const { runDoctor } = await import('./doctor.js');

    const result = await runDoctor({
      nodeVersion: 'v24.16.0',
      commandExists: (command) => Promise.resolve(command !== 'gh'),
      appDataPath: 'C:\\state\\gatekeeper',
      ensureWritable: () => Promise.resolve(),
    });

    expect(result.status).toBe('degraded');
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: 'gh', required: false, status: 'warn' }),
    );
  });

  it('fails when the Node major version is not 24', async () => {
    const { runDoctor } = await import('./doctor.js');

    const result = await runDoctor({
      nodeVersion: 'v22.0.0',
      commandExists: () => Promise.resolve(true),
      appDataPath: '/state/gatekeeper',
      ensureWritable: () => Promise.resolve(),
    });

    expect(result.status).toBe('failed');
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: 'node', required: true, status: 'fail' }),
    );
  });
});
