import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:50059',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    }
  ],

  webServer: {
    command: 'npm run dev',
    port: 50059,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      'GRPC_PORT': '50059',
      'LOG_LEVEL': 'info',
      'ENVIRONMENT': 'test'
    }
  },
}); 