import { describe, expect, it } from 'vitest';

describe('assembleVerdict', () => {
  it('does not allow an inference finding to produce BLOCK', async () => {
    const { assembleVerdict } = await import('./review.js');

    expect(
      assembleVerdict([
        {
          id: 'finding_inference',
          authority: 'INFERENCE',
          severity: 'critical',
          enforcement: 'hard',
          humanApprovalRequired: true,
        },
      ]),
    ).toBe('ESCALATE');
  });

  it('returns BLOCK for a hard deterministic finding', async () => {
    const { assembleVerdict } = await import('./review.js');

    expect(
      assembleVerdict([
        {
          id: 'finding_protected_path',
          authority: 'DETERMINISTIC',
          severity: 'high',
          enforcement: 'hard',
          humanApprovalRequired: true,
        },
      ]),
    ).toBe('BLOCK');
  });

  it('uses REQUIRE_CHANGES for required deterministic remediation', async () => {
    const { assembleVerdict } = await import('./review.js');

    expect(
      assembleVerdict([
        {
          id: 'finding_missing_test',
          authority: 'DETERMINISTIC',
          severity: 'medium',
          enforcement: 'required',
          humanApprovalRequired: false,
        },
      ]),
    ).toBe('REQUIRE_CHANGES');
  });

  it('returns FAST_PATH when no finding raises a verdict floor', async () => {
    const { assembleVerdict } = await import('./review.js');

    expect(assembleVerdict([])).toBe('FAST_PATH');
  });
});
