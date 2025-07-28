# PW-Core Playwright Testing Framework Implementation Plan

## 📋 Overview

The `pw-core` library will consolidate common Playwright testing utilities, patterns, and components used across all Fast services. This will eliminate test code duplication, ensure consistent testing practices, and provide a centralized testing framework for all services.

## 🎯 Goals

1. **Eliminate Test Code Duplication**: Extract common test utilities, fixtures, and patterns
2. **Standardize Testing Practices**: Ensure consistent test structure and patterns
3. **Improve Test Reliability**: Provide robust utilities for service testing
4. **Enhance Developer Experience**: Simplify test writing with pre-built components
5. **Enable Comprehensive Testing**: Support unit, integration, and end-to-end testing

## 📁 Project Structure

```
pw-core/
├── src/
│   ├── clients/                    # Test client abstractions
│   │   ├── grpc/
│   │   │   ├── GrpcTestClient.ts
│   │   │   ├── GrpcClientHelper.ts
│   │   │   └── types.ts
│   │   ├── http/
│   │   │   ├── HttpTestClient.ts
│   │   │   └── types.ts
│   │   └── kafka/
│   │       ├── KafkaTestClient.ts
│   │       ├── KafkaTestProducer.ts
│   │       ├── KafkaTestConsumer.ts
│   │       └── types.ts
│   ├── fixtures/                   # Test data and fixtures
│   │   ├── singapore/
│   │   │   ├── pacs008/
│   │   │   │   ├── valid_messages.ts
│   │   │   │   ├── invalid_messages.ts
│   │   │   │   └── edge_cases.ts
│   │   │   ├── pacs007/
│   │   │   │   ├── valid_messages.ts
│   │   │   │   └── invalid_messages.ts
│   │   │   └── pacs003/
│   │   │       ├── valid_messages.ts
│   │   │       └── invalid_messages.ts
│   │   ├── accounts/
│   │   │   ├── singapore_accounts.ts
│   │   │   ├── test_accounts.ts
│   │   │   └── error_accounts.ts
│   │   ├── enrichment/
│   │   │   ├── enrichment_data.ts
│   │   │   └── mock_responses.ts
│   │   └── validation/
│   │       ├── validation_results.ts
│   │       └── error_scenarios.ts
│   ├── helpers/                    # Test helper utilities
│   │   ├── service/
│   │   │   ├── ServiceTestHelper.ts
│   │   │   ├── HealthCheckHelper.ts
│   │   │   └── ServiceManager.ts
│   │   ├── data/
│   │   │   ├── TestDataGenerator.ts
│   │   │   ├── MessageBuilder.ts
│   │   │   └── AccountDataBuilder.ts
│   │   ├── assertions/
│   │   │   ├── SingaporeAssertions.ts
│   │   │   ├── GrpcAssertions.ts
│   │   │   ├── KafkaAssertions.ts
│   │   │   └── XMLAssertions.ts
│   │   ├── matchers/
│   │   │   ├── CustomMatchers.ts
│   │   │   └── types.ts
│   │   └── wait/
│   │       ├── WaitHelpers.ts
│   │       └── RetryHelpers.ts
│   ├── config/                     # Test configuration
│   │   ├── TestConfig.ts
│   │   ├── PlaywrightConfig.ts
│   │   └── ServiceConfig.ts
│   ├── setup/                      # Test setup utilities
│   │   ├── GlobalSetup.ts
│   │   ├── GlobalTeardown.ts
│   │   ├── TestSetup.ts
│   │   └── ServiceSetup.ts
│   ├── reporters/                  # Custom test reporters
│   │   ├── ServiceTestReporter.ts
│   │   ├── PerformanceReporter.ts
│   │   └── types.ts
│   ├── mocks/                      # Mock utilities
│   │   ├── service/
│   │   │   ├── MockServiceManager.ts
│   │   │   ├── GrpcMockServer.ts
│   │   │   └── HttpMockServer.ts
│   │   ├── kafka/
│   │   │   ├── MockKafkaProducer.ts
│   │   │   └── MockKafkaConsumer.ts
│   │   └── database/
│   │       ├── MockDatabase.ts
│   │       └── TestDataSeeder.ts
│   ├── validators/                 # Test validators
│   │   ├── MessageValidator.ts
│   │   ├── ResponseValidator.ts
│   │   └── PerformanceValidator.ts
│   ├── types/                      # TypeScript types
│   │   ├── test.ts
│   │   ├── fixtures.ts
│   │   ├── clients.ts
│   │   └── index.ts
│   └── index.ts                    # Main exports
├── templates/                      # Test templates
│   ├── service/
│   │   ├── grpc-service.spec.ts
│   │   ├── http-service.spec.ts
│   │   └── kafka-service.spec.ts
│   ├── integration/
│   │   ├── service-integration.spec.ts
│   │   └── e2e-flow.spec.ts
│   └── performance/
│       ├── load-test.spec.ts
│       └── stress-test.spec.ts
├── configs/                        # Playwright configurations
│   ├── playwright.config.base.ts
│   ├── playwright.config.grpc.ts
│   ├── playwright.config.http.ts
│   └── playwright.config.e2e.ts
├── docs/                           # Documentation
│   ├── README.md
│   ├── API.md
│   ├── PATTERNS.md
│   └── EXAMPLES.md
├── tests/                          # Framework tests
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## 🔧 Core Components

### 1. gRPC Test Client (`src/clients/grpc/`)

**Current Issues:**
- Each service creates its own gRPC test client
- Proto loading and connection logic duplicated
- No standardized health check testing

**Solution:**
```typescript
// src/clients/grpc/GrpcTestClient.ts
export class GrpcTestClient<TClient = any> {
  private client: TClient;
  private connected: boolean = false;
  
  constructor(
    private serviceUrl: string,
    private protoPath: string,
    private serviceName: string,
    private packageName: string
  ) {}

  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async healthCheck(): Promise<HealthCheckResponse>;
  async waitForServiceReady(timeoutMs: number = 30000): Promise<void>;
  
  // Generic method calling
  async call<TRequest, TResponse>(
    methodName: string,
    request: TRequest
  ): Promise<TResponse>;
}

// src/clients/grpc/GrpcClientHelper.ts
export class GrpcClientHelper {
  static createClient<T>(
    serviceUrl: string,
    protoPath: string,
    serviceName: string,
    packageName: string
  ): GrpcTestClient<T>;
  
  static loadFixture(fixturePath: string): string;
  static validateSingaporeFields(xmlPayload: string): ValidationResult;
  static isValidUUID(uuid: string): boolean;
  static isValidPUID(puid: string): boolean;
}
```

### 2. Test Fixtures (`src/fixtures/`)

**Current Issues:**
- XML test data duplicated across services
- No centralized test account management
- Inconsistent test data formats

**Solution:**
```typescript
// src/fixtures/singapore/pacs008/valid_messages.ts
export const VALID_PACS008_MESSAGES = {
  STANDARD_SGD_TRANSFER: {
    messageId: 'SG202501080001',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>...`,
    expectedFields: {
      currency: 'SGD',
      country: 'SG',
      amount: '1500.00'
    }
  },
  HIGH_VALUE_TRANSFER: {
    messageId: 'SG202501080002',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>...`,
    expectedFields: {
      currency: 'SGD',
      country: 'SG',
      amount: '75000.00'
    }
  }
};

// src/fixtures/accounts/singapore_accounts.ts
export const SINGAPORE_TEST_ACCOUNTS = {
  STANDARD_RETAIL: {
    accountId: '123456789',
    accountType: 'RETAIL',
    expectedAuthMethod: 'AFPONLY',
    expectedSystem: 'MDZ'
  },
  VAM_ACCOUNT: {
    accountId: '999888777',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'GROUPLIMIT',
    expectedSystem: 'VAM'
  },
  CORPORATE_ACCOUNT: {
    accountId: '888777666',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedSystem: 'MEPS'
  }
};
```

### 3. Test Helpers (`src/helpers/`)

**Current Issues:**
- Service setup and teardown logic duplicated
- No standardized assertion patterns
- Manual wait and retry logic

**Solution:**
```typescript
// src/helpers/service/ServiceTestHelper.ts
export class ServiceTestHelper {
  private grpcClient: GrpcTestClient;
  private httpClient: HttpTestClient;
  private kafkaClient: KafkaTestClient;
  
  constructor(private serviceName: string, private config: ServiceTestConfig) {}
  
  async setupTest(): Promise<void>;
  async teardownTest(): Promise<void>;
  async clearDatabase(): Promise<void>;
  async seedTestData(data: TestData): Promise<void>;
  
  // Service-specific helpers
  async processMessage(message: TestMessage): Promise<TestResponse>;
  async waitForKafkaMessage(topic: string, timeout: number): Promise<any>;
  async verifyServiceHealth(): Promise<void>;
}

// src/helpers/assertions/SingaporeAssertions.ts
export class SingaporeAssertions {
  static expectValidSingaporeMessage(response: any): void {
    expect(response.currency).toBe('SGD');
    expect(response.country).toBe('SG');
    expect(response.timezone).toMatch(/\+08:00/);
  }
  
  static expectValidPUID(puid: string): void {
    expect(puid).toMatch(/^G3I[A-Z0-9]{13}$/);
  }
  
  static expectValidAccountLookup(enrichmentData: any): void {
    expect(enrichmentData.receivedAcctId).toBeTruthy();
    expect(enrichmentData.lookupStatusCode).toBe(200);
    expect(enrichmentData.normalizedAcctId).toBeTruthy();
  }
}

// src/helpers/data/MessageBuilder.ts
export class MessageBuilder {
  private messageData: Partial<TestMessage> = {};
  
  withMessageType(type: string): MessageBuilder;
  withAccount(accountId: string): MessageBuilder;
  withAmount(amount: number): MessageBuilder;
  withCurrency(currency: string): MessageBuilder;
  withCountry(country: string): MessageBuilder;
  withMetadata(metadata: Record<string, string>): MessageBuilder;
  
  build(): TestMessage;
  buildXML(): string;
  buildGrpcRequest(): GrpcRequest;
}
```

### 4. Test Configuration (`src/config/`)

**Current Issues:**
- Playwright configuration duplicated
- No centralized service configuration
- Environment-specific settings scattered

**Solution:**
```typescript
// src/config/PlaywrightConfig.ts
export class PlaywrightConfigBuilder {
  private config: PlaywrightTestConfig = {};
  
  withService(serviceName: string, port: number): PlaywrightConfigBuilder;
  withGrpcService(serviceName: string, port: number): PlaywrightConfigBuilder;
  withHttpService(serviceName: string, port: number): PlaywrightConfigBuilder;
  withKafkaConfig(kafkaConfig: KafkaConfig): PlaywrightConfigBuilder;
  withTimeout(timeout: number): PlaywrightConfigBuilder;
  withRetries(retries: number): PlaywrightConfigBuilder;
  withParallelism(workers: number): PlaywrightConfigBuilder;
  
  build(): PlaywrightTestConfig;
}

// src/config/ServiceConfig.ts
export interface ServiceTestConfig {
  serviceName: string;
  serviceType: 'grpc' | 'http' | 'kafka';
  port: number;
  healthCheckUrl?: string;
  protoPath?: string;
  packageName?: string;
  timeout: number;
  retries: number;
  environment: 'test' | 'development' | 'staging';
}

export const SERVICE_CONFIGS: Record<string, ServiceTestConfig> = {
  'fast-requesthandler-service': {
    serviceName: 'fast-requesthandler-service',
    serviceType: 'grpc',
    port: 50051,
    protoPath: 'proto/pacs_handler.proto',
    packageName: 'gpp.g3.requesthandler',
    timeout: 30000,
    retries: 2,
    environment: 'test'
  },
  'fast-enrichment-service': {
    serviceName: 'fast-enrichment-service',
    serviceType: 'grpc',
    port: 50052,
    protoPath: 'proto/enrichment_service.proto',
    packageName: 'gpp.g3.enrichment',
    timeout: 30000,
    retries: 2,
    environment: 'test'
  }
};
```

### 5. Mock Utilities (`src/mocks/`)

**Current Issues:**
- No standardized mocking framework
- Service mocking logic duplicated
- No centralized mock data management

**Solution:**
```typescript
// src/mocks/service/MockServiceManager.ts
export class MockServiceManager {
  private mockServers: Map<string, MockServer> = new Map();
  
  async startMockService(
    serviceName: string,
    config: MockServiceConfig
  ): Promise<MockServer>;
  
  async stopMockService(serviceName: string): Promise<void>;
  async stopAllMockServices(): Promise<void>;
  
  getMockServer(serviceName: string): MockServer | undefined;
  setMockResponse(serviceName: string, method: string, response: any): void;
  setMockError(serviceName: string, method: string, error: Error): void;
}

// src/mocks/service/GrpcMockServer.ts
export class GrpcMockServer implements MockServer {
  constructor(
    private port: number,
    private protoPath: string,
    private serviceName: string
  ) {}
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  setMethodResponse(method: string, response: any): void;
  setMethodError(method: string, error: Error): void;
  
  // Pre-configured mock responses
  setupHealthCheckMock(): void;
  setupAccountLookupMock(): void;
  setupValidationMock(): void;
}
```

### 6. Custom Matchers (`src/helpers/matchers/`)

**Current Issues:**
- No domain-specific assertion helpers
- Manual validation of complex objects
- Inconsistent error messages

**Solution:**
```typescript
// src/helpers/matchers/CustomMatchers.ts
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidPUID(): R;
      toBeValidUUID(): R;
      toHaveValidSingaporeFields(): R;
      toHaveValidEnrichmentData(): R;
      toHaveValidValidationResult(): R;
      toBeHealthyService(): R;
    }
  }
}

export const customMatchers = {
  toBeValidPUID(received: string) {
    const pass = /^G3I[A-Z0-9]{13}$/.test(received);
    return {
      pass,
      message: () => pass 
        ? `Expected ${received} not to be a valid PUID`
        : `Expected ${received} to be a valid PUID (format: G3I + 13 alphanumeric)`
    };
  },
  
  toHaveValidSingaporeFields(received: any) {
    const errors: string[] = [];
    
    if (received.currency !== 'SGD') {
      errors.push(`Expected currency to be SGD, got ${received.currency}`);
    }
    
    if (received.country !== 'SG') {
      errors.push(`Expected country to be SG, got ${received.country}`);
    }
    
    return {
      pass: errors.length === 0,
      message: () => errors.length === 0
        ? `Expected object not to have valid Singapore fields`
        : `Singapore validation failed: ${errors.join(', ')}`
    };
  }
};
```

### 7. Test Templates (`templates/`)

**Current Issues:**
- No standardized test structure
- Test patterns not documented
- Manual test setup for each service

**Solution:**
```typescript
// templates/service/grpc-service.spec.ts
import { test, expect } from '@playwright/test';
import { 
  GrpcTestClient, 
  ServiceTestHelper, 
  SingaporeAssertions,
  SINGAPORE_TEST_ACCOUNTS,
  MessageBuilder
} from '@gpp/pw-core';

test.describe('{{SERVICE_NAME}} - gRPC Service Tests', () => {
  let testHelper: ServiceTestHelper;
  let grpcClient: GrpcTestClient;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('{{SERVICE_NAME}}', {
      serviceType: 'grpc',
      port: {{SERVICE_PORT}},
      protoPath: '{{PROTO_PATH}}',
      packageName: '{{PACKAGE_NAME}}'
    });
    
    grpcClient = testHelper.getGrpcClient();
    await grpcClient.waitForServiceReady();
  });

  test.beforeEach(async () => {
    await testHelper.setupTest();
  });

  test.afterEach(async () => {
    await testHelper.teardownTest();
  });

  test.describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await grpcClient.healthCheck();
      expect(response).toBeHealthyService();
    });
  });

  test.describe('Message Processing', () => {
    test('should process valid Singapore message', async () => {
      const message = new MessageBuilder()
        .withMessageType('PACS008')
        .withAccount(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL.accountId)
        .withAmount(1500.00)
        .withCurrency('SGD')
        .withCountry('SG')
        .build();

      const response = await testHelper.processMessage(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      expect(response).toHaveValidSingaporeFields();
    });
  });
});
```

## 📦 Package Configuration

### `package.json`
```json
{
  "name": "@gpp/pw-core",
  "version": "1.0.0",
  "description": "Common Playwright testing utilities for Fast services",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "template:generate": "node scripts/generate-template.js",
    "docs:generate": "typedoc src/index.ts"
  },
  "dependencies": {
    "@playwright/test": "^1.40.0",
    "@grpc/grpc-js": "^1.8.0",
    "@grpc/proto-loader": "^0.7.0",
    "kafkajs": "^2.2.4",
    "axios": "^1.6.0",
    "uuid": "^9.0.0",
    "xml2js": "^0.6.2",
    "moment-timezone": "^0.5.43"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "@types/uuid": "^9.0.0",
    "@types/xml2js": "^0.4.11",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "@typescript-eslint/parser": "^5.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^4.9.0",
    "typedoc": "^0.25.0"
  },
  "peerDependencies": {
    "@playwright/test": ">=1.40.0",
    "typescript": ">=4.5.0"
  },
  "files": [
    "dist/",
    "templates/",
    "configs/",
    "README.md"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/gpp/pw-core.git"
  },
  "keywords": [
    "playwright",
    "testing",
    "grpc",
    "kafka",
    "singapore",
    "banking",
    "pacs",
    "e2e"
  ],
  "author": "GPP G3 Team",
  "license": "MIT"
}
```

### Base Playwright Configuration (`configs/playwright.config.base.ts`)
```typescript
import { defineConfig, devices } from '@playwright/test';

export const baseConfig = defineConfig({
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
    ['@gpp/pw-core/reporters/ServiceTestReporter']
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
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
  ]
});
```

## 🔄 Implementation Steps

### Phase 1: Core Infrastructure (Week 1-2)
1. **Project Setup**
   - Create npm package structure
   - Configure TypeScript, ESLint, Jest
   - Set up Playwright base configuration

2. **gRPC Test Client**
   - Create GrpcTestClient base class
   - Implement connection management
   - Add health check utilities

3. **Basic Test Helpers**
   - Create ServiceTestHelper
   - Implement basic setup/teardown
   - Add wait and retry utilities

### Phase 2: Test Fixtures and Data (Week 3)
1. **Test Fixtures**
   - Create Singapore PACS message fixtures
   - Add account test data
   - Create enrichment data fixtures

2. **Data Builders**
   - Implement MessageBuilder
   - Create AccountDataBuilder
   - Add TestDataGenerator

3. **Mock Framework**
   - Create MockServiceManager
   - Implement GrpcMockServer
   - Add mock response utilities

### Phase 3: Advanced Testing Features (Week 4)
1. **Custom Matchers**
   - Create domain-specific matchers
   - Add Singapore validation matchers
   - Implement performance matchers

2. **Kafka Testing**
   - Create KafkaTestClient
   - Implement message publishing/consuming
   - Add Kafka assertions

3. **HTTP Testing**
   - Create HttpTestClient
   - Add REST API testing utilities
   - Implement HTTP assertions

### Phase 4: Test Templates and Configuration (Week 5)
1. **Test Templates**
   - Create service test templates
   - Add integration test templates
   - Create performance test templates

2. **Configuration Management**
   - Create PlaywrightConfigBuilder
   - Add service-specific configurations
   - Implement environment management

3. **Custom Reporters**
   - Create ServiceTestReporter
   - Add performance reporting
   - Implement test metrics collection

### Phase 5: Integration and Documentation (Week 6)
1. **Service Integration**
   - Migrate existing tests to use pw-core
   - Create migration guides
   - Test compatibility

2. **Documentation**
   - Create comprehensive README
   - Add API documentation
   - Write testing patterns guide

3. **Advanced Features**
   - Add test parallelization utilities
   - Create test data seeding
   - Implement test environment management

## 🔄 Migration Strategy

### 1. Service-by-Service Migration
```typescript
// Before (in service test)
import { test, expect } from '@playwright/test';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// After (using pw-core)
import { test, expect } from '@playwright/test';
import { 
  GrpcTestClient, 
  ServiceTestHelper, 
  SingaporeAssertions,
  SINGAPORE_TEST_ACCOUNTS 
} from '@gpp/pw-core';
```

### 2. Configuration Migration
```typescript
// Before (in playwright.config.ts)
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  webServer: {
    command: 'npm run dev',
    port: 50051,
    reuseExistingServer: !process.env.CI,
  }
});

// After (using pw-core)
import { PlaywrightConfigBuilder } from '@gpp/pw-core';

export default new PlaywrightConfigBuilder()
  .withGrpcService('fast-requesthandler-service', 50051)
  .withTimeout(30000)
  .withRetries(2)
  .build();
```

### 3. Test Migration
```typescript
// Before (manual test setup)
test.beforeEach(async () => {
  grpcClient = createGrpcClient('localhost:50051');
  await grpcClient.waitForServiceReady(30000);
  await grpcClient.clearMockStorage();
});

// After (using pw-core)
test.beforeEach(async () => {
  await testHelper.setupTest();
});
```

## 📊 Benefits

### 1. Test Code Reduction
- **Estimated 60-70% reduction** in test code duplication
- **Standardized test patterns** across all services
- **Consistent test data** and fixtures

### 2. Test Reliability
- **Robust service connection** management
- **Automatic retry logic** for flaky tests
- **Comprehensive error handling**

### 3. Developer Experience
- **Pre-built test utilities** for common scenarios
- **Domain-specific assertions** for banking/PACS
- **Easy test template generation**

### 4. Test Coverage
- **Comprehensive test fixtures** for all message types
- **Edge case testing** utilities
- **Performance testing** framework

## 🚀 Usage Examples

### Basic Service Test
```typescript
import { test, expect } from '@playwright/test';
import { ServiceTestHelper, MessageBuilder } from '@gpp/pw-core';

test.describe('Fast Request Handler Service', () => {
  let testHelper: ServiceTestHelper;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('fast-requesthandler-service');
    await testHelper.initialize();
  });

  test('should process PACS008 message', async () => {
    const message = new MessageBuilder()
      .withMessageType('PACS008')
      .withSingaporeDefaults()
      .withAmount(1500.00)
      .build();

    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    expect(response.puid).toBeValidPUID();
    expect(response).toHaveValidSingaporeFields();
  });
});
```

### Integration Test
```typescript
import { test, expect } from '@playwright/test';
import { 
  ServiceTestHelper, 
  KafkaTestClient, 
  MessageBuilder,
  SINGAPORE_TEST_ACCOUNTS 
} from '@gpp/pw-core';

test.describe('End-to-End Message Flow', () => {
  let requestHandler: ServiceTestHelper;
  let kafkaClient: KafkaTestClient;

  test.beforeAll(async () => {
    requestHandler = new ServiceTestHelper('fast-requesthandler-service');
    kafkaClient = new KafkaTestClient();
    
    await requestHandler.initialize();
    await kafkaClient.initialize();
  });

  test('should process message through complete flow', async () => {
    const message = new MessageBuilder()
      .withMessageType('PACS008')
      .withAccount(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId)
      .withAmount(50000.00)
      .build();

    // Send message to request handler
    const response = await requestHandler.processMessage(message);
    expect(response.success).toBe(true);

    // Verify message reaches orchestrator via Kafka
    const kafkaMessage = await kafkaClient.waitForMessage(
      'validated-messages',
      response.messageId,
      10000
    );
    
    expect(kafkaMessage.messageId).toBe(response.messageId);
    expect(kafkaMessage.enrichmentData.authMethod).toBe('GROUPLIMIT');
  });
});
```

### Performance Test
```typescript
import { test, expect } from '@playwright/test';
import { ServiceTestHelper, PerformanceValidator } from '@gpp/pw-core';

test.describe('Performance Tests', () => {
  let testHelper: ServiceTestHelper;
  let performanceValidator: PerformanceValidator;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('fast-requesthandler-service');
    performanceValidator = new PerformanceValidator();
    await testHelper.initialize();
  });

  test('should handle 100 concurrent messages', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => 
      new MessageBuilder()
        .withMessageType('PACS008')
        .withUniqueId(i)
        .build()
    );

    const startTime = Date.now();
    const promises = messages.map(msg => testHelper.processMessage(msg));
    const responses = await Promise.all(promises);
    const endTime = Date.now();

    // Validate all responses
    responses.forEach(response => {
      expect(response.success).toBe(true);
    });

    // Validate performance
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(10000); // 10 seconds max
    
    const avgResponseTime = duration / messages.length;
    expect(avgResponseTime).toBeLessThan(100); // 100ms average
  });
});
```

## 📈 Success Metrics

1. **Test Code Reduction**: Target 60% reduction in test code duplication
2. **Test Reliability**: 95% test success rate in CI/CD
3. **Development Speed**: 40% faster test development
4. **Test Coverage**: 90%+ coverage across all services
5. **Documentation**: 100% API documentation coverage

## 🔮 Future Enhancements

1. **Visual Testing**: Add screenshot comparison utilities
2. **API Testing**: Enhance REST API testing framework
3. **Database Testing**: Add database testing utilities
4. **Monitoring Integration**: Add test metrics collection
5. **AI-Powered Testing**: Add intelligent test generation

This implementation plan provides a comprehensive framework for creating a shared Playwright testing library that will significantly improve test quality, reduce duplication, and enhance testing productivity across all Fast services. 