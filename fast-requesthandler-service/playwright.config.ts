import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Singapore PACS Processing',
      testDir: './tests/e2e/singapore',
    },
    {
      name: 'PW-Core Integration',
      testMatch: '**/simple-pw-core-test.spec.ts',
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 50051,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
}); 