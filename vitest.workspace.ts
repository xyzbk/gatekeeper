import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@gatekeeper/config': fromRoot('./packages/config/src/index.ts'),
      '@gatekeeper/contracts': fromRoot('./packages/contracts/src/index.ts'),
      '@gatekeeper/domain': fromRoot('./packages/domain/src/index.ts'),
      '@gatekeeper/git-adapter': fromRoot('./packages/git-adapter/src/index.ts'),
      '@gatekeeper/project-memory': fromRoot('./packages/project-memory/src/index.ts'),
      '@gatekeeper/review-engine': fromRoot('./packages/review-engine/src/index.ts'),
      '@gatekeeper/store-sqlite': fromRoot('./packages/store-sqlite/src/index.ts'),
      '@gatekeeper/server': fromRoot('./apps/server/src/index.ts'),
      '@gatekeeper/mcp-server': fromRoot('./apps/mcp-server/src/server.ts'),
      '@gatekeeper/testkit': fromRoot('./packages/testkit/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
  },
});
