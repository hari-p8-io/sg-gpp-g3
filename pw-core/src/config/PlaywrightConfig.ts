import { defineConfig, PlaywrightTestConfig } from '@playwright/test';

export class PlaywrightConfigBuilder {
  private config: PlaywrightTestConfig;

  constructor() {
    this.config = {
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
        trace: 'on-first-retry',
      },
    };
  }

  withTestDir(testDir: string): PlaywrightConfigBuilder {
    this.config.testDir = testDir;
    return this;
  }

  withTimeout(timeout: number): PlaywrightConfigBuilder {
    this.config.timeout = timeout;
    return this;
  }

  withRetries(retries: number): PlaywrightConfigBuilder {
    this.config.retries = retries;
    return this;
  }

  withWorkers(workers: number): PlaywrightConfigBuilder {
    this.config.workers = workers;
    return this;
  }

  withReporter(reporters: string[]): PlaywrightConfigBuilder {
    this.config.reporter = reporters as any;
    return this;
  }

  withGrpcService(serviceName: string, port: number): PlaywrightConfigBuilder {
    this.config.webServer = {
      command: 'npm run dev',
      port: port,
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    };
    return this;
  }

  withHttpService(serviceName: string, port: number): PlaywrightConfigBuilder {
    this.config.webServer = {
      command: 'npm run dev',
      port: port,
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    };
    return this;
  }

  withKafkaConfig(kafkaConfig: { brokers: string[], topics: string[], groupId: string }): PlaywrightConfigBuilder {
    // Kafka configuration can be added to environment variables or test context
    // This is a placeholder for future Kafka testing capabilities
    return this;
  }

  withEnvironmentVariables(envVars: Record<string, string>): PlaywrightConfigBuilder {
    if (this.config.webServer && !Array.isArray(this.config.webServer)) {
      this.config.webServer.env = { ...this.config.webServer.env, ...envVars };
    }
    return this;
  }

  withProjects(projects: any[]): PlaywrightConfigBuilder {
    this.config.projects = projects;
    return this;
  }

  build(): PlaywrightTestConfig {
    return this.config;
  }
} 