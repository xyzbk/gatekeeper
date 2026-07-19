import { describe, expect, it, vi } from 'vitest';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));

vi.mock('execa', () => ({ execa: execaMock }));

import { inspectLocalTool } from './start.js';

describe('startup tool inspection process safety', () => {
  it('bounds the local executable probe', async () => {
    execaMock.mockResolvedValue({ exitCode: 0, stdout: 'git version 2.50.1' });

    await expect(inspectLocalTool('git')).resolves.toEqual({
      available: true,
      version: 'git version 2.50.1',
    });

    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['--version'],
      expect.objectContaining({ maxBuffer: 1_024 * 1_024, shell: false, timeout: 30_000 }),
    );
  });
});
