import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const configUrl = new URL('../../../.codex/config.toml', import.meta.url);
const skillUrl = new URL('../../../.agents/skills/gatekeeper/SKILL.md', import.meta.url);
const workflowUrl = new URL(
  '../../../.agents/skills/gatekeeper/references/workflow.md',
  import.meta.url,
);
const evidenceUrl = new URL(
  '../../../.agents/skills/gatekeeper/references/evidence-and-verdicts.md',
  import.meta.url,
);

describe('trusted-project Gatekeeper surface', () => {
  it('configures only the built local stdio server with bounded timeouts and no credentials', async () => {
    const config = await readFile(configUrl, 'utf8');

    expect(config).toMatch(/\[mcp_servers\.gatekeeper\]/u);
    expect(config).toContain('command = "node"');
    expect(config).toContain('args = ["apps/mcp-server/dist/index.js"]');
    expect(config).toContain('cwd = ".."');
    expect(config).toContain('startup_timeout_sec = 10');
    expect(config).toContain('tool_timeout_sec = 30');
    expect(config).not.toMatch(/token|secret|api[_-]?key|bearer/iu);
  });

  it('teaches the nine-tool local workflow, consent boundaries, trust order, and stop gate', async () => {
    const [skill, workflow, evidence] = await Promise.all([
      readFile(skillUrl, 'utf8'),
      readFile(workflowUrl, 'utf8'),
      readFile(evidenceUrl, 'utf8'),
    ]);
    const completeSkill = `${skill}\n${workflow}\n${evidence}`;

    expect(skill).toMatch(/^---\nname: gatekeeper\ndescription: .+\n---/u);
    expect(skill).toContain('[Workflow](references/workflow.md)');
    expect(skill).toContain('[Evidence and verdicts](references/evidence-and-verdicts.md)');
    expect(completeSkill).toContain('ask for consent');
    expect(completeSkill).toContain('untrusted data');
    expect(completeSkill).toMatch(/DETERMINISTIC[\s\S]+EVIDENCE_SUPPORTED[\s\S]+INFERENCE/u);
    expect(completeSkill).toContain('Do not change files');

    for (const tool of [
      'gatekeeper_status',
      'gatekeeper_index_repository',
      'gatekeeper_review_worktree',
      'gatekeeper_review_pull_request',
      'gatekeeper_list_recent_commits',
      'gatekeeper_review_commit',
      'gatekeeper_search_memory',
      'gatekeeper_complete_review',
      'gatekeeper_get_review',
    ]) {
      expect(completeSkill).toContain(tool);
    }
    expect(completeSkill).toMatch(/never publish/iu);
  });
});
