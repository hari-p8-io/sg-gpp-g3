import { defineConfig, PlaywrightTestConfig } from '@playwright/test';

export interface ServiceConfig {
  serviceName: string;
  port: number;
  healthCheckUrl?: string;
  protoPath?: string;
  packageName?: string;
  timeout?: number;
  retries?: number;
}

export interface KafkaConfig {
  brokers: string[];
  topics: string[];
  groupId: string;
}

export class PlaywrightConfigBuilder {
  private config: PlaywrightTestConfig = {
    timeout: 30000,
    expect: {
      timeout: 5000
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
      ['html'],
      ['list']
    ],
    use: {
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure'
    },
    projects: []
  };

  withService(serviceName: string, port: number): PlaywrightConfigBuilder {
    this.config.webServer = {
      command: 'npm run dev',
      port: port,
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    };
    return this;
  }

  withGrpcService(serviceName: string, port: number): PlaywrightConfigBuilder {
    this.withService(serviceName, port);
    return this;
  }

  withHttpService(serviceName: string, port: number): PlaywrightConfigBuilder {
    this.withService(serviceName, port);
    return this;
  }

  withKafkaConfig(kafkaConfig: KafkaConfig): PlaywrightConfigBuilder {
    // Store Kafka config for use in tests
    if (!this.config.use) {
      this.config.use = {};
    }
    (this.config.use as any).kafkaConfig = kafkaConfig;
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

  withParallelism(workers: number): PlaywrightConfigBuilder {
    this.config.workers = workers;
    return this;
  }

  withTestDir(testDir: string): PlaywrightConfigBuilder {
    this.config.testDir = testDir;
    return this;
  }

  withProjects(projects: any[]): PlaywrightConfigBuilder {
    this.config.projects = projects;
    return this;
  }

  addProject(name: string, config: any): PlaywrightConfigBuilder {
    if (!this.config.projects) {
      this.config.projects = [];
    }
    this.config.projects.push({
      name,
      ...config
    });
    return this;
  }

  withReporter(reporters: string[] | [string, any][]): PlaywrightConfigBuilder {
    this.config.reporter = reporters;
    return this;
  }

  build(): PlaywrightTestConfig {
    return this.config;
  }
}

// Pre-configured configs for common services
export const createRequestHandlerConfig = () => {
  return new PlaywrightConfigBuilder()
    .withGrpcService('fast-requesthandler-service', 50051)
    .withTimeout(30000)
    .withRetries(2)
    .withTestDir('./tests')
    .addProject('Singapore PACS Processing', {
      testDir: './tests/e2e/singapore'
    })
    .addProject('PW-Core Integration', {
      testMatch: '**/pilot-*.spec.ts'
    })
    .build();
};

export const createEnrichmentConfig = () => {
  return new PlaywrightConfigBuilder()
    .withGrpcService('fast-enrichment-service', 50052)
    .withTimeout(30000)
    .withRetries(2)
    .build();
};

export const createValidationConfig = () => {
  return new PlaywrightConfigBuilder()
    .withGrpcService('fast-validation-service', 50053)
    .withTimeout(30000)
    .withRetries(2)
    .build();
};

export const createOrchestratorConfig = () => {
  return new PlaywrightConfigBuilder()
    .withHttpService('fast-orchestrator-service', 3004)
    .withTimeout(30000)
    .withRetries(2)
    .withKafkaConfig({
      brokers: ['localhost:9092'],
      topics: ['validated-messages'],
      groupId: 'test-group'
    })
    .build();
}; 