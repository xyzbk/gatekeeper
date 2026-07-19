import { describe, expect, it } from 'vitest';

import { createModelDataDryRunReport } from './model-data-dry-run.js';

describe('model-data dry run', () => {
  it('reports bounded untrusted pointers without a model transport or source excerpts', async () => {
    const report = await createModelDataDryRunReport();
    const serialized = JSON.stringify(report);

    expect(report.schemaVersion).toBe(1);
    expect(report.transport).toBe('none');
    expect(report.modelCalls).toBe(0);
    expect(report.untrustedEvidence.pointers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'issue:#4', sourceType: 'issue' }),
        expect.objectContaining({
          sourceId: 'docs/adr/0003-no-required-redis.md',
          sourceType: 'adr',
        }),
      ]),
    );
    expect(report.untrustedEvidence.count).toBe(report.untrustedEvidence.pointers.length);
    expect(serialized).not.toContain('"excerpt"');
    expect(serialized).not.toContain('"body"');
  });
});
