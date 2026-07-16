import type { RepositorySnapshot, ToolAvailability } from '@gatekeeper/contracts';
import { describe, expect, it, vi } from 'vitest';

const repository: RepositorySnapshot = {
  root: 'D:\\work\\gatekeeper',
  branch: 'master',
  head: 'a'.repeat(40),
  dirty: false,
  remote: 'https://github.com/xyzbk/gatekeeper.git',
};

const git: ToolAvailability = { available: true, version: 'git version 2.50.1' };
const gh: ToolAvailability = { available: false, version: null };

describe('start command lifecycle', () => {
  it('starts one fixed repository and closes the foreground service on shutdown', async () => {
    const events: string[] = [];
    const output: string[] = [];
    const close = vi.fn(() => {
      events.push('close');
      return Promise.resolve();
    });
    const { runStartCommand } = await import('./start.js');

    await runStartCommand('D:\\work\\gatekeeper', {
      dashboardRoot: 'D:\\work\\gatekeeper\\apps\\dashboard\\dist',
      inspectRepository: (path) => {
        events.push(`inspect:${path}`);
        return Promise.resolve(repository);
      },
      inspectTool: (name) => {
        events.push(`tool:${name}`);
        return Promise.resolve(name === 'git' ? git : gh);
      },
      startService: (options) => {
        events.push('start');
        expect(options).toMatchObject({
          dashboardRoot: 'D:\\work\\gatekeeper\\apps\\dashboard\\dist',
          repository,
          tools: { git, gh },
          version: '0.1.0',
        });
        return Promise.resolve({ baseUrl: 'http://127.0.0.1:43127', close });
      },
      waitUntilShutdown: () => {
        events.push('wait');
        return Promise.resolve();
      },
      write: (message) => {
        output.push(message);
      },
    });

    expect(events).toEqual([
      'inspect:D:\\work\\gatekeeper',
      'tool:git',
      'tool:gh',
      'start',
      'wait',
      'close',
    ]);
    expect(output.join('')).toBe(
      [
        'Gatekeeper is running.\n',
        'Repository: D:\\work\\gatekeeper\n',
        'Dashboard: http://127.0.0.1:43127\n',
        'Press Ctrl+C to stop.\n',
      ].join(''),
    );
    expect(output.join('')).not.toContain('Bearer');
  });

  it('still closes the service when foreground waiting fails', async () => {
    const close = vi.fn(() => Promise.resolve());
    const { runStartCommand } = await import('./start.js');

    await expect(
      runStartCommand('.', {
        dashboardRoot: 'dashboard',
        inspectRepository: () => Promise.resolve(repository),
        inspectTool: (name) => Promise.resolve(name === 'git' ? git : gh),
        startService: () => Promise.resolve({ baseUrl: 'http://127.0.0.1:43127', close }),
        waitUntilShutdown: () => Promise.reject(new Error('signal failure')),
        write: () => undefined,
      }),
    ).rejects.toThrow('signal failure');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('local tool inspection', () => {
  it('uses an executable and argument array and returns the first version line', async () => {
    const runCommand = vi.fn(() =>
      Promise.resolve({ exitCode: 0, stdout: 'gh version 2.76.2\nhttps://example.invalid' }),
    );
    const { inspectLocalTool } = await import('./start.js');

    await expect(inspectLocalTool('gh', runCommand)).resolves.toEqual({
      available: true,
      version: 'gh version 2.76.2',
    });
    expect(runCommand).toHaveBeenCalledWith('gh', ['--version']);
  });

  it('treats a missing optional tool as unavailable without exposing errors', async () => {
    const { inspectLocalTool } = await import('./start.js');

    await expect(
      inspectLocalTool('gh', () => Promise.reject(new Error('private host detail'))),
    ).resolves.toEqual({ available: false, version: null });
  });

  it('keeps unexpected startup details out of CLI errors', async () => {
    const { formatStartError } = await import('./start.js');

    const message = formatStartError(new Error('private path and token detail'));

    expect(message).toBe(
      'Gatekeeper could not start the local service. Build the workspace and try again.',
    );
    expect(message).not.toContain('private path');
  });
});
