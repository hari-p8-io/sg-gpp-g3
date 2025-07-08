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
    baseURL: 'http://localhost:3004',
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
    port: 3004,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      'PORT': '3004',
      'LOG_LEVEL': 'info',
      'ENVIRONMENT': 'test',
      'KAFKA_BROKERS': 'localhost:9092',
      'KAFKA_TOPIC': 'validated-messages',
      'KAFKA_GROUP_ID': 'fast-orchestrator-group'
    }
  },
}); 