import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { height: 900, width: 1_440 },
      },
    },
  ],
  reporter: 'list',
  testDir: './tests/e2e',
  tsconfig: './tsconfig.playwright.json',
  timeout: 30_000,
  workers: 1,
});
