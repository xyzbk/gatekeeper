import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runJudgeDemoSmoke, startJudgeDemo } from './judge-demo.js';

describe('judge demo', () => {
  it('starts the real local service with the fixture transport and removes only its disposable root', async () => {
    const dashboardRoot = await createDashboardFixture();
    const demo = await startJudgeDemo({ dashboardRoot });

    try {
      expect(demo.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(demo.githubTransport).toBe('fixture');
      expect(demo.modelCalls).toBe(0);
      expect(demo.initialReviewId).toMatch(/^review_[a-f0-9]+$/);
      await expect(fetch(`${demo.baseUrl}/health`)).resolves.toMatchObject({ status: 200 });
    } finally {
      await demo.close();
      await rm(dashboardRoot, { recursive: true, force: true });
    }

    await expect(access(demo.root)).rejects.toThrow();
  });

  it('replays the Ghost Change from escalation to a corrected fast path without network credentials or a model completion', async () => {
    const dashboardRoot = await createDashboardFixture();
    try {
      const result = await runJudgeDemoSmoke({ dashboardRoot });

      expect(result.githubTransport).toBe('fixture');
      expect(result.modelCalls).toBe(0);
      expect(result.initialVerdict).toBe('ESCALATE');
      expect(result.correctedVerdict).toBe('FAST_PATH');
      expect(result.initialReviewId).toMatch(/^review_[a-f0-9]+$/);
      expect(result.correctedPreviousReviewId).toBe(result.initialReviewId);
      expect(result.evidenceIds).toContain('pull_request:#12');
      expect(result.evidenceIds).toContain('issue:#4');
      expect(result.evidenceIds).toContain('docs/adr/0003-no-required-redis.md');
      expect(result.correctedFindingIds).not.toContain(
        'finding:content-security:prompt-injection',
      );
    } finally {
      await rm(dashboardRoot, { recursive: true, force: true });
    }
  });
});

async function createDashboardFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-judge-dashboard-'));
  await writeFile(join(root, 'index.html'), '<main>Gatekeeper judge dashboard</main>', 'utf8');
  return root;
}
