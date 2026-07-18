import { describe, expect, it, vi } from 'vitest';

import { runSeedGitHub, type RunSeedGh } from './seed-github.js';

function result(stdout = '') {
  return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
}

function branchResult(arguments_: readonly string[]) {
  return result(
    JSON.stringify({ name: decodeURIComponent(arguments_.at(-1)?.split('/').at(-1) ?? '') }),
  );
}

const invalidArgumentSets: string[][] = [
  [],
  ['--apply'],
  ['--repo', 'owner'],
  ['--repo', 'https://github.com/owner/repo'],
  ['--repo', 'owner/repo;echo'],
  ['--repo', 'owner/repo', '--apply', '--dry-run'],
  ['--repo', 'owner/repo', '--unknown'],
];

describe('GitHub Ghost Change seeder', () => {
  it('defaults to a stable dry-run without contacting GitHub', async () => {
    const runGh = vi.fn<RunSeedGh>();
    const lines: string[] = [];

    const outcome = await runSeedGitHub(['--repo', 'Example/Ghost-Change'], {
      runGh,
      write: (line) => lines.push(line),
    });

    expect(outcome).toMatchObject({ mode: 'dry-run', planned: 6, applied: 0, skipped: 0 });
    expect(runGh).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('gatekeeper-demo:ghost-change:pull_request:12');
    expect(lines.join('\n')).toContain('No GitHub requests were made.');
  });

  it.each(invalidArgumentSets.map((arguments_) => [arguments_] as const))(
    'rejects an inexact target or ambiguous mode before execution: %j',
    async (arguments_) => {
      const runGh = vi.fn<RunSeedGh>();

      await expect(runSeedGitHub(arguments_, { runGh, write: () => undefined })).rejects.toThrow();
      expect(runGh).not.toHaveBeenCalled();
    },
  );

  it('discovers every stable marker and skips all writes without touching unrelated records', async () => {
    const discovered = [
      { number: 41, state: 'closed', body: '<!-- gatekeeper-demo:ghost-change:issue:4 -->' },
      {
        number: 42,
        state: 'closed',
        body: '<!-- gatekeeper-demo:ghost-change:pull_request:8 -->',
        pull_request: {},
      },
      { number: 43, state: 'closed', body: '<!-- gatekeeper-demo:ghost-change:issue:9 -->' },
      {
        number: 44,
        state: 'closed',
        body: '<!-- gatekeeper-demo:ghost-change:pull_request:10 -->',
        pull_request: {},
      },
      { number: 45, state: 'open', body: '<!-- gatekeeper-demo:ghost-change:issue:99 -->' },
      {
        number: 46,
        state: 'open',
        body: '<!-- gatekeeper-demo:ghost-change:pull_request:12 -->',
        pull_request: {},
      },
      { number: 500, state: 'open', body: 'Unrelated maintainer content' },
    ];
    const runGh = vi.fn<RunSeedGh>((arguments_) => {
      if (arguments_[0] === 'repo') {
        return result(JSON.stringify({ nameWithOwner: 'example/ghost-change' }));
      }
      return arguments_.at(-1)?.includes('/branches/') === true
        ? branchResult(arguments_)
        : result(JSON.stringify(discovered));
    });

    const outcome = await runSeedGitHub(['--repo', 'example/ghost-change', '--apply'], {
      runGh,
      write: () => undefined,
    });

    expect(outcome).toMatchObject({ mode: 'apply', planned: 6, applied: 0, skipped: 6 });
    expect(runGh).toHaveBeenCalledTimes(5);
    const invoked = runGh.mock.calls.flatMap(([arguments_]) => arguments_);
    expect(invoked).not.toEqual(expect.arrayContaining(['create', 'delete', 'close', 'merge']));
  });

  it('writes only under explicit apply and resolves logical links to created GitHub numbers', async () => {
    const createdUrls = [
      'https://github.com/example/ghost-change/issues/101',
      'https://github.com/example/ghost-change/pull/102',
      'https://github.com/example/ghost-change/issues/103',
      'https://github.com/example/ghost-change/pull/104',
      'https://github.com/example/ghost-change/issues/105',
      'https://github.com/example/ghost-change/pull/106',
    ];
    const runGh = vi.fn<RunSeedGh>((arguments_) => {
      if (arguments_[0] === 'repo') {
        return result(JSON.stringify({ nameWithOwner: 'example/ghost-change' }));
      }
      if (arguments_[0] === 'api') {
        return arguments_.at(-1)?.includes('/branches/') === true
          ? branchResult(arguments_)
          : result('[]');
      }
      return arguments_.includes('create') ? result(createdUrls.shift()) : result();
    });

    const outcome = await runSeedGitHub(['--repo', 'example/ghost-change', '--apply'], {
      runGh,
      write: () => undefined,
    });

    expect(outcome).toMatchObject({ mode: 'apply', planned: 6, applied: 6, skipped: 0 });
    const createCalls = runGh.mock.calls
      .map(([arguments_]) => arguments_)
      .filter((arguments_) => arguments_.includes('create'));
    expect(createCalls).toHaveLength(6);
    expect(createCalls.every((arguments_) => !arguments_.includes('--delete-branch'))).toBe(true);
    const closeCalls = runGh.mock.calls
      .map(([arguments_]) => arguments_)
      .filter((arguments_) => arguments_.includes('close'));
    expect(closeCalls).toEqual([
      ['issue', 'close', '101', '--repo', 'example/ghost-change'],
      ['pr', 'close', '102', '--repo', 'example/ghost-change'],
      ['issue', 'close', '103', '--repo', 'example/ghost-change'],
      ['pr', 'close', '104', '--repo', 'example/ghost-change'],
    ]);
    const revivedCall = createCalls.at(-1)!;
    const revivedBody = revivedCall[revivedCall.indexOf('--body') + 1];
    expect(revivedBody).toContain('issue #101');
    expect(revivedBody).toContain('pull_request #102');
    expect(revivedBody).toContain('issue #103');
    expect(revivedBody).toContain('pull_request #104');
  });

  it('checks every required branch before the first write', async () => {
    const runGh = vi.fn<RunSeedGh>((arguments_) => {
      if (arguments_[0] === 'repo') {
        return result(JSON.stringify({ nameWithOwner: 'example/ghost-change' }));
      }
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'private branch detail' });
    });

    await expect(
      runSeedGitHub(['--repo', 'example/ghost-change', '--apply'], {
        runGh,
        write: () => undefined,
      }),
    ).rejects.toThrow('required demo branch');
    expect(runGh.mock.calls.some(([arguments_]) => arguments_.includes('create'))).toBe(false);
  });

  it('rejects a lookalike created-object URL immediately', async () => {
    const runGh = vi.fn<RunSeedGh>((arguments_) => {
      if (arguments_[0] === 'repo') {
        return result(JSON.stringify({ nameWithOwner: 'example.org/ghost-change' }));
      }
      if (arguments_[0] === 'api') {
        return arguments_.at(-1)?.includes('/branches/') === true
          ? branchResult(arguments_)
          : result('[]');
      }
      return result('https://github.com/exampleXorg/ghost-change/issues/101');
    });

    await expect(
      runSeedGitHub(['--repo', 'example.org/ghost-change', '--apply'], {
        runGh,
        write: () => undefined,
      }),
    ).rejects.toThrow('unexpected created object URL');
    expect(runGh.mock.calls.filter(([arguments_]) => arguments_.includes('create'))).toHaveLength(
      1,
    );
  });

  it('rejects target drift before branch discovery or writes', async () => {
    const runGh = vi.fn<RunSeedGh>(() =>
      result(JSON.stringify({ nameWithOwner: 'attacker/different-repository' })),
    );

    await expect(
      runSeedGitHub(['--repo', 'example/ghost-change', '--apply'], {
        runGh,
        write: () => undefined,
      }),
    ).rejects.toThrow('different repository');
    expect(runGh).toHaveBeenCalledOnce();
  });

  it('refuses saturated discovery and duplicate stable markers before writes', async () => {
    for (const discovered of [
      Array.from({ length: 100 }, (_, number) => ({ number: number + 1, state: 'open', body: '' })),
      [
        { number: 41, state: 'closed', body: '<!-- gatekeeper-demo:ghost-change:issue:4 -->' },
        { number: 42, state: 'closed', body: '<!-- gatekeeper-demo:ghost-change:issue:4 -->' },
      ],
    ]) {
      const runGh = vi.fn<RunSeedGh>((arguments_) => {
        if (arguments_[0] === 'repo') {
          return result(JSON.stringify({ nameWithOwner: 'example/ghost-change' }));
        }
        return arguments_.at(-1)?.includes('/branches/') === true
          ? branchResult(arguments_)
          : result(JSON.stringify(discovered));
      });

      await expect(
        runSeedGitHub(['--repo', 'example/ghost-change', '--apply'], {
          runGh,
          write: () => undefined,
        }),
      ).rejects.toThrow();
      expect(runGh.mock.calls.some(([arguments_]) => arguments_.includes('create'))).toBe(false);
    }
  });

  it('preflights an unexpectedly closed revived PR before creating missing objects', async () => {
    const runGh = vi.fn<RunSeedGh>((arguments_) => {
      if (arguments_[0] === 'repo') {
        return result(JSON.stringify({ nameWithOwner: 'example/ghost-change' }));
      }
      return arguments_.at(-1)?.includes('/branches/') === true
        ? branchResult(arguments_)
        : result(
            JSON.stringify([
              {
                number: 46,
                state: 'closed',
                body: '<!-- gatekeeper-demo:ghost-change:pull_request:12 -->',
                pull_request: {},
              },
            ]),
          );
    });

    await expect(
      runSeedGitHub(['--repo', 'example/ghost-change', '--apply'], {
        runGh,
        write: () => undefined,
      }),
    ).rejects.toThrow('unexpectedly closed');
    expect(runGh.mock.calls.some(([arguments_]) => arguments_.includes('create'))).toBe(false);
  });
});
