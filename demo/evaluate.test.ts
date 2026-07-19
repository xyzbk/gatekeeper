import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateGoldenScenarios, formatGoldenEvaluation } from './evaluate.js';

describe('golden evaluation', () => {
  it('returns the six deterministic, network-free judge outcomes', async () => {
    const dashboardRoot = await createDashboardFixture();
    try {
      const evaluation = await evaluateGoldenScenarios({ dashboardRoot });

      expect(evaluation.externalNetworkCalls).toBe(0);
      expect(evaluation.modelCalls).toBe(0);
      expect(evaluation.outcomes.map(({ scenario, verdict }) => ({ scenario, verdict }))).toEqual([
        { scenario: 'clean-bug-fix', verdict: 'FAST_PATH' },
        { scenario: 'missing-test', verdict: 'REQUIRE_CHANGES' },
        { scenario: 'protected-path', verdict: 'BLOCK' },
        { scenario: 'auth-escalation', verdict: 'ESCALATE' },
        { scenario: 'redis-revival', verdict: 'ESCALATE' },
        { scenario: 'prompt-injection', verdict: 'ESCALATE' },
      ]);
      const authEscalation = evaluation.outcomes.find(
        ({ scenario }) => scenario === 'auth-escalation',
      );
      const redisRevival = evaluation.outcomes.find(({ scenario }) => scenario === 'redis-revival');
      const promptInjection = evaluation.outcomes.find(
        ({ scenario }) => scenario === 'prompt-injection',
      );

      expect(authEscalation?.findingIds).toEqual(['finding:risk:authentication']);
      expect(redisRevival?.evidenceIds).toContain('pull_request:#12');
      expect(redisRevival?.evidenceIds).toContain('issue:#4');
      expect(promptInjection?.findingIds).toContain('finding:content-security:prompt-injection');
      expect(formatGoldenEvaluation(evaluation)).toContain(
        '| protected-path   | BLOCK           | finding:protected-path:protected-rules, internal/protected/rules.ts',
      );
    } finally {
      await rm(dashboardRoot, { recursive: true, force: true });
    }
  });
});

async function createDashboardFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gatekeeper-evaluation-dashboard-'));
  await writeFile(join(root, 'index.html'), '<main>Gatekeeper evaluator dashboard</main>', 'utf8');
  return root;
}
