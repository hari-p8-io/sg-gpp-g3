import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
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
  ],
  webServer: {
    command: 'npm run dev',
    port: 50051,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
}); 