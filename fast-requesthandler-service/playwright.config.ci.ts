import { defineConfig, devices } from '@playwright/test';

/**
 * CI-optimized Playwright configuration
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.SERVICE_URL || 'http://localhost:3001',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Timeout settings */
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    /* Other settings */
    ignoreHTTPSErrors: true,
    
    /* Custom headers */
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'CI Chrome',
      use: { 
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
          ]
        }
      },
    },
    {
      name: 'Singapore PACS Processing',
      use: { 
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
          ]
        }
      },
    },
  ],

  /* Global Setup */
  globalSetup: './tests/global-setup.ts',
  
  /* Global Teardown */
  globalTeardown: './tests/global-teardown.ts',

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      NODE_ENV: 'test',
      PORT: '3001',
      GRPC_PORT: '50051',
      SPANNER_EMULATOR_HOST: 'localhost:9010',
      SPANNER_PROJECT_ID: 'test-project',
      SPANNER_INSTANCE_ID: 'test-instance',
      SPANNER_DATABASE_ID: 'test-database',
      KAFKA_BROKERS: 'localhost:9092',
    },
  },

  /* Test timeout */
  timeout: 30000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Output directories */
  outputDir: './test-results',
  
  /* Test patterns */
  testMatch: [
    '**/tests/**/*.spec.ts',
    '**/tests/**/*.test.ts',
  ],
  
  /* Ignore patterns */
  testIgnore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
  ],
}); 