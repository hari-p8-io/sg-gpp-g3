import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Configuration for Playwright tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60000, // Longer timeout for E2E tests with Docker
  expect: {
    timeout: 10000, // Longer timeout for assertions
  },
  fullyParallel: false, // Run tests sequentially to avoid race conditions with Kafka
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Run tests one at a time
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  
  projects: [
    {
      name: 'orchestrator',
      testDir: './tests/orchestrator',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Global setup to start Docker containers before tests
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  
  // Global teardown to stop Docker containers after tests
  globalTeardown: path.join(__dirname, 'global-teardown.ts'),
}); 