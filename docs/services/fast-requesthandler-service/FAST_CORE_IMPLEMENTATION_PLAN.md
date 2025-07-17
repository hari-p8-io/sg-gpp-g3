# Fast-Core TypeScript Commons Library Implementation Plan

## 📋 Overview

The `fast-core` library will consolidate common TypeScript utilities, patterns, and components used across all Fast services. This will eliminate code duplication, ensure consistency, and provide a centralized location for shared business logic.

## 🎯 Goals

1. **Eliminate Code Duplication**: Extract common utilities, patterns, and business logic
2. **Ensure Consistency**: Standardize logging, error handling, and configuration patterns
3. **Simplify Maintenance**: Centralize shared code for easier updates and bug fixes
4. **Improve Developer Experience**: Provide well-documented, type-safe utilities
5. **Enable Reusability**: Create modular components that can be used across services

## 📁 Project Structure

```
fast-core/
├── src/
│   ├── clients/                    # gRPC and HTTP client abstractions
│   │   ├── grpc/
│   │   │   ├── BaseGrpcClient.ts
│   │   │   ├── GrpcClientFactory.ts
│   │   │   └── types.ts
│   │   ├── kafka/
│   │   │   ├── KafkaClient.ts
│   │   │   ├── KafkaProducer.ts
│   │   │   ├── KafkaConsumer.ts
│   │   │   └── types.ts
│   │   └── http/
│   │       ├── HttpClient.ts
│   │       └── types.ts
│   ├── config/                     # Configuration management
│   │   ├── ConfigManager.ts
│   │   ├── ServiceConfig.ts
│   │   └── types.ts
│   ├── logging/                    # Centralized logging
│   │   ├── Logger.ts
│   │   ├── LoggerFactory.ts
│   │   └── types.ts
│   ├── utils/                      # Common utilities
│   │   ├── generators/
│   │   │   ├── UUIDGenerator.ts
│   │   │   ├── PUIDGenerator.ts
│   │   │   └── index.ts
│   │   ├── validators/
│   │   │   ├── SingaporeValidator.ts
│   │   │   ├── XMLValidator.ts
│   │   │   └── index.ts
│   │   ├── parsers/
│   │   │   ├── XMLParser.ts
│   │   │   └── index.ts
│   │   ├── date/
│   │   │   ├── DateUtils.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── proto/                      # Shared proto definitions
│   │   ├── common/
│   │   │   ├── health_check.proto
│   │   │   ├── common_types.proto
│   │   │   └── service_info.proto
│   │   ├── enrichment/
│   │   │   └── enrichment_data.proto
│   │   └── validation/
│   │       └── validation_types.proto
│   ├── constants/                  # Business constants
│   │   ├── singapore/
│   │   │   ├── BankingConstants.ts
│   │   │   ├── AccountTypes.ts
│   │   │   └── index.ts
│   │   ├── MessageTypes.ts
│   │   └── index.ts
│   ├── types/                      # Common TypeScript types
│   │   ├── common.ts
│   │   ├── grpc.ts
│   │   ├── kafka.ts
│   │   └── index.ts
│   ├── errors/                     # Error handling
│   │   ├── BaseError.ts
│   │   ├── GrpcError.ts
│   │   ├── KafkaError.ts
│   │   ├── ValidationError.ts
│   │   └── index.ts
│   ├── health/                     # Health check utilities
│   │   ├── HealthChecker.ts
│   │   ├── ServiceHealthManager.ts
│   │   └── types.ts
│   └── index.ts                    # Main exports
├── proto/                          # Proto source files
├── dist/                           # Compiled output
├── tests/                          # Unit tests
├── docs/                           # Documentation
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## 🔧 Core Components

### 1. Logging System (`src/logging/`)

**Current Issues:**
- Each service has its own Logger class with identical implementations
- Inconsistent log formatting across services
- No centralized log level management

**Solution:**
```typescript
// src/logging/Logger.ts
export class Logger {
  private serviceName: string;
  private logLevel: LogLevel;
  
  constructor(serviceName: string, logLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.logLevel = logLevel;
  }

  info(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  debug(message: string, data?: LogData): void;
}

// src/logging/LoggerFactory.ts
export class LoggerFactory {
  static createLogger(serviceName: string): Logger;
  static setGlobalLogLevel(level: LogLevel): void;
}
```

**Benefits:**
- Consistent logging format across all services
- Centralized log level management
- Structured logging with metadata
- Performance optimizations

### 2. Configuration Management (`src/config/`)

**Current Issues:**
- Each service has its own config structure
- Environment variable parsing duplicated
- No validation of configuration values

**Solution:**
```typescript
// src/config/ServiceConfig.ts
export interface BaseServiceConfig {
  serviceName: string;
  grpcPort: number;
  logLevel: string;
  environment: string;
  healthCheckPort?: number;
}

export interface GrpcServiceConfig extends BaseServiceConfig {
  grpc: {
    port: number;
    timeout: number;
    maxRetryAttempts: number;
  };
}

export interface KafkaServiceConfig extends BaseServiceConfig {
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
    topics: Record<string, string>;
  };
}

// src/config/ConfigManager.ts
export class ConfigManager {
  static loadConfig<T extends BaseServiceConfig>(
    schema: ConfigSchema<T>,
    defaults?: Partial<T>
  ): T;
  
  static validateConfig<T>(config: T, schema: ConfigSchema<T>): void;
}
```

### 3. gRPC Client Framework (`src/clients/grpc/`)

**Current Issues:**
- Each service creates its own gRPC client logic
- Proto loading code duplicated
- No standardized error handling

**Solution:**
```typescript
// src/clients/grpc/BaseGrpcClient.ts
export abstract class BaseGrpcClient<TClient = any> {
  protected client: TClient;
  protected connected: boolean = false;
  protected logger: Logger;

  constructor(
    protected serviceUrl: string,
    protected protoPath: string,
    protected serviceName: string
  );

  protected abstract initializeClient(): Promise<void>;
  public abstract healthCheck(): Promise<HealthCheckResponse>;
  public async connect(): Promise<void>;
  public async disconnect(): Promise<void>;
  public async waitForServiceReady(timeoutMs: number = 30000): Promise<void>;
}

// src/clients/grpc/GrpcClientFactory.ts
export class GrpcClientFactory {
  static createClient<T extends BaseGrpcClient>(
    clientClass: new (...args: any[]) => T,
    serviceUrl: string,
    protoPath: string,
    serviceName: string
  ): T;
}
```

### 4. Kafka Client Framework (`src/clients/kafka/`)

**Current Issues:**
- Kafka client initialization duplicated across services
- Inconsistent error handling and retry logic
- No standardized message format

**Solution:**
```typescript
// src/clients/kafka/KafkaClient.ts
export class KafkaClient {
  constructor(config: KafkaConfig);
  
  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async healthCheck(): Promise<HealthStatus>;
}

// src/clients/kafka/KafkaProducer.ts
export class KafkaProducer extends KafkaClient {
  async publishMessage<T>(
    topic: string,
    message: KafkaMessage<T>
  ): Promise<boolean>;
  
  async publishBatch<T>(
    topic: string,
    messages: KafkaMessage<T>[]
  ): Promise<boolean>;
}

// src/clients/kafka/KafkaConsumer.ts
export class KafkaConsumer extends KafkaClient {
  async subscribe(
    topics: string[],
    handler: MessageHandler
  ): Promise<void>;
  
  async run(): Promise<void>;
}
```

### 5. Utilities (`src/utils/`)

**Current Issues:**
- UUID and PUID generation duplicated
- Singapore-specific validations scattered
- XML parsing logic repeated

**Solution:**
```typescript
// src/utils/generators/UUIDGenerator.ts
export class UUIDGenerator {
  static generateUUID(): string;
  static isValidUUID(uuid: string): boolean;
}

// src/utils/generators/PUIDGenerator.ts
export class PUIDGenerator {
  static generatePUID(): string;
  static generatePUIDWithTimestamp(): string;
  static isValidPUID(puid: string): boolean;
}

// src/utils/validators/SingaporeValidator.ts
export class SingaporeValidator {
  static validateSingaporeFields(xmlPayload: string): ValidationResult;
  static validateSGDCurrency(currency: string): boolean;
  static validateSGCountry(country: string): boolean;
  static validateSingaporePostalCode(postalCode: string): boolean;
  static validateSingaporeBankCode(bankCode: string): boolean;
}

// src/utils/parsers/XMLParser.ts
export class XMLParser {
  static parseXML(xmlString: string): ParsedXML;
  static extractMessageInfo(xmlString: string): MessageInfo;
  static extractCreditorAccount(xmlString: string): string;
}
```

### 6. Constants (`src/constants/`)

**Current Issues:**
- Singapore banking constants duplicated
- Account types and categories scattered
- No centralized business rule definitions

**Solution:**
```typescript
// src/constants/singapore/BankingConstants.ts
export const SINGAPORE_BANKING_CONSTANTS = {
  CURRENCY: 'SGD',
  COUNTRY: 'SG',
  TIMEZONE: 'Asia/Singapore',
  BANK_CODES: {
    ANZ: 'ANZBSG3MXXX',
    OCBC: 'OCBCSG3MXXX',
    UOB: 'UOBSG3MXXX',
    DBS: 'DBSSSG3MXXX'
  },
  ACCOUNT_SYSTEMS: {
    MEPS: 'MEPS',
    FAST: 'FAST',
    MDZ: 'MDZ',
    VAM: 'VAM'
  }
};

// src/constants/singapore/AccountTypes.ts
export const ACCOUNT_TYPES = {
  CORPORATE: 'CORPORATE',
  GOVERNMENT: 'GOVERNMENT',
  UTILITY: 'UTILITY',
  RETAIL: 'RETAIL'
};

export const ACCOUNT_CATEGORIES = {
  CORPORATE: 'CORPORATE',
  GOVERNMENT: 'GOVERNMENT',
  UTILITY: 'UTILITY',
  RETAIL: 'RETAIL'
};
```

### 7. Error Handling (`src/errors/`)

**Current Issues:**
- No standardized error types
- Inconsistent error handling patterns
- No error code standardization

**Solution:**
```typescript
// src/errors/BaseError.ts
export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly service: string;
  public readonly timestamp: number;
  
  constructor(message: string, code: string, service: string);
}

// src/errors/GrpcError.ts
export class GrpcError extends BaseError {
  constructor(
    message: string,
    grpcCode: number,
    service: string,
    details?: any
  );
}

// src/errors/ValidationError.ts
export class ValidationError extends BaseError {
  public readonly field: string;
  public readonly value: any;
  
  constructor(message: string, field: string, value: any, service: string);
}
```

### 8. Health Check System (`src/health/`)

**Current Issues:**
- Health check logic duplicated
- No standardized health check format
- No dependency health tracking

**Solution:**
```typescript
// src/health/HealthChecker.ts
export class HealthChecker {
  static async checkService(serviceUrl: string): Promise<HealthStatus>;
  static async checkKafka(kafkaConfig: KafkaConfig): Promise<HealthStatus>;
  static async checkDatabase(dbConfig: DatabaseConfig): Promise<HealthStatus>;
}

// src/health/ServiceHealthManager.ts
export class ServiceHealthManager {
  constructor(serviceName: string);
  
  addDependency(name: string, healthChecker: () => Promise<HealthStatus>): void;
  async getOverallHealth(): Promise<OverallHealthStatus>;
  async getDetailedHealth(): Promise<DetailedHealthStatus>;
}
```

## 🔄 Proto Definitions (`src/proto/`)

### Common Proto Files

**1. Health Check (`proto/common/health_check.proto`)**
```protobuf
syntax = "proto3";

package gpp.g3.common;

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
    SERVICE_UNKNOWN = 3;
  }
  ServingStatus status = 1;
  string message = 2;
  int64 timestamp = 3;
}
```

**2. Service Info (`proto/common/service_info.proto`)**
```protobuf
syntax = "proto3";

package gpp.g3.common;

message ServiceInfoRequest {
  string requester = 1;
}

message ServiceInfoResponse {
  string service_name = 1;
  string version = 2;
  string build_time = 3;
  repeated string capabilities = 4;
  bool is_stubbed = 5;
  string environment = 6;
}
```

**3. Enrichment Data (`proto/enrichment/enrichment_data.proto`)**
```protobuf
syntax = "proto3";

package gpp.g3.enrichment;

message EnrichmentData {
  string received_acct_id = 1;
  int32 lookup_status_code = 2;
  string lookup_status_desc = 3;
  string normalized_acct_id = 4;
  string matched_acct_id = 5;
  string partial_match = 6;
  string is_physical = 7;
  PhysicalAccountInfo physical_acct_info = 8;
  string auth_method = 9;
}

message PhysicalAccountInfo {
  string acct_id = 1;
  string acct_sys = 2;
  string acct_group = 3;
  string country = 4;
  string branch_id = 5;
  AccountAttributes acct_attributes = 6;
  AccountOpsAttributes acct_ops_attributes = 7;
  string bicfi = 8;
  string currency_code = 9;
}

message AccountAttributes {
  string acct_type = 1;
  string acct_category = 2;
  string acct_purpose = 3;
}

message AccountOpsAttributes {
  bool is_active = 1;
  string acct_status = 2;
  string open_date = 3;
  string expiry_date = 4;
  AccountRestraints restraints = 5;
}

message AccountRestraints {
  bool stop_all = 1;
  bool stop_debits = 2;
  bool stop_credits = 3;
  bool stop_atm = 4;
  bool stop_eft_pos = 5;
  bool stop_unknown = 6;
  repeated string warnings = 7;
}
```

## 📦 Package Configuration

### `package.json`
```json
{
  "name": "@gpp/fast-core",
  "version": "1.0.0",
  "description": "Common utilities and types for Fast services",
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
    "proto:generate": "npm run proto:clean && npm run proto:compile",
    "proto:clean": "rm -rf src/proto/generated",
    "proto:compile": "grpc_tools_node_protoc --proto_path=proto --ts_out=src/proto/generated --grpc_out=src/proto/generated proto/**/*.proto"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.8.0",
    "@grpc/proto-loader": "^0.7.0",
    "kafkajs": "^2.2.4",
    "uuid": "^9.0.0",
    "moment-timezone": "^0.5.43",
    "xml2js": "^0.6.2",
    "joi": "^17.9.0"
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
    "typescript": "^4.9.0"
  },
  "peerDependencies": {
    "typescript": ">=4.5.0"
  },
  "files": [
    "dist/",
    "proto/",
    "README.md"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/gpp/fast-core.git"
  },
  "keywords": [
    "typescript",
    "grpc",
    "kafka",
    "singapore",
    "banking",
    "pacs",
    "utilities"
  ],
  "author": "GPP G3 Team",
  "license": "MIT"
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "moduleResolution": "node",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@/clients/*": ["clients/*"],
      "@/config/*": ["config/*"],
      "@/utils/*": ["utils/*"],
      "@/types/*": ["types/*"],
      "@/constants/*": ["constants/*"],
      "@/errors/*": ["errors/*"]
    }
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "tests"
  ]
}
```

## 🔧 Implementation Steps

### Phase 1: Core Infrastructure (Week 1-2)
1. **Project Setup**
   - Create npm package structure
   - Configure TypeScript, ESLint, Jest
   - Set up build and test scripts

2. **Logging System**
   - Extract and consolidate Logger classes
   - Create LoggerFactory
   - Add structured logging support

3. **Configuration Management**
   - Create ConfigManager
   - Define base configuration interfaces
   - Add environment variable validation

### Phase 2: Client Frameworks (Week 3-4)
1. **gRPC Client Framework**
   - Create BaseGrpcClient abstract class
   - Implement GrpcClientFactory
   - Add connection management and health checks

2. **Kafka Client Framework**
   - Create KafkaClient base class
   - Implement KafkaProducer and KafkaConsumer
   - Add message serialization/deserialization

3. **HTTP Client Framework**
   - Create HttpClient with retry logic
   - Add request/response interceptors
   - Implement timeout and error handling

### Phase 3: Utilities and Constants (Week 5)
1. **Common Utilities**
   - Extract UUID and PUID generators
   - Consolidate Singapore validators
   - Create XML parsing utilities

2. **Business Constants**
   - Centralize Singapore banking constants
   - Define account types and categories
   - Create message type definitions

3. **Error Handling**
   - Create error hierarchy
   - Implement error codes
   - Add error serialization

### Phase 4: Proto and Types (Week 6)
1. **Proto Definitions**
   - Create common proto files
   - Generate TypeScript definitions
   - Set up proto compilation pipeline

2. **TypeScript Types**
   - Define common interfaces
   - Create type guards
   - Add utility types

3. **Health Check System**
   - Create HealthChecker utility
   - Implement ServiceHealthManager
   - Add dependency health tracking

### Phase 5: Integration and Testing (Week 7-8)
1. **Service Integration**
   - Update services to use fast-core
   - Remove duplicated code
   - Test compatibility

2. **Documentation**
   - Create comprehensive README
   - Add API documentation
   - Write migration guides

3. **Testing**
   - Write unit tests
   - Add integration tests
   - Set up CI/CD pipeline

## 🔄 Migration Strategy

### 1. Gradual Migration
- Start with one service (e.g., fast-requesthandler-service)
- Migrate utilities one by one
- Ensure backward compatibility

### 2. Service-by-Service Approach
```typescript
// Before (in service)
import { Logger } from './utils/logger';

// After (using fast-core)
import { LoggerFactory } from '@gpp/fast-core';

const logger = LoggerFactory.createLogger('fast-requesthandler-service');
```

### 3. Configuration Migration
```typescript
// Before (in service)
const config = {
  grpcPort: parseInt(process.env.GRPC_PORT || '50051'),
  serviceName: 'fast-requesthandler-service'
};

// After (using fast-core)
import { ConfigManager, GrpcServiceConfig } from '@gpp/fast-core';

const config = ConfigManager.loadConfig<GrpcServiceConfig>({
  serviceName: 'fast-requesthandler-service',
  grpcPort: 50051
});
```

## 📊 Benefits

### 1. Code Reduction
- **Estimated 40-60% reduction** in duplicated code
- **Centralized maintenance** of common utilities
- **Consistent patterns** across all services

### 2. Developer Experience
- **Type-safe utilities** with comprehensive TypeScript support
- **Well-documented APIs** with examples
- **Faster development** with pre-built components

### 3. Quality Improvements
- **Standardized error handling** across services
- **Consistent logging** format and levels
- **Centralized testing** of common utilities

### 4. Maintainability
- **Single source of truth** for business logic
- **Easier updates** and bug fixes
- **Better version control** of shared components

## 🚀 Usage Examples

### Logging
```typescript
import { LoggerFactory } from '@gpp/fast-core';

const logger = LoggerFactory.createLogger('my-service');

logger.info('Service started', { port: 3000 });
logger.error('Database connection failed', { error: err.message });
```

### Configuration
```typescript
import { ConfigManager, KafkaServiceConfig } from '@gpp/fast-core';

const config = ConfigManager.loadConfig<KafkaServiceConfig>({
  serviceName: 'my-service',
  kafka: {
    brokers: ['localhost:9092'],
    groupId: 'my-group'
  }
});
```

### gRPC Client
```typescript
import { BaseGrpcClient } from '@gpp/fast-core';

class MyServiceClient extends BaseGrpcClient {
  async callService(request: MyRequest): Promise<MyResponse> {
    return this.makeCall('MyMethod', request);
  }
}
```

### Kafka Producer
```typescript
import { KafkaProducer } from '@gpp/fast-core';

const producer = new KafkaProducer(kafkaConfig);
await producer.publishMessage('my-topic', {
  key: 'message-key',
  value: messageData
});
```

## 📈 Success Metrics

1. **Code Duplication Reduction**: Target 50% reduction in duplicated code
2. **Development Speed**: 30% faster feature development
3. **Bug Reduction**: 40% fewer bugs in common utilities
4. **Test Coverage**: 90%+ test coverage for all utilities
5. **Documentation**: 100% API documentation coverage

## 🔮 Future Enhancements

1. **Monitoring Integration**: Add metrics and tracing utilities
2. **Database Abstractions**: Create common database client patterns
3. **Caching Layer**: Add Redis/cache abstraction utilities
4. **Security Utilities**: Add authentication and authorization helpers
5. **Performance Monitoring**: Add performance tracking utilities

This implementation plan provides a comprehensive approach to creating a shared TypeScript commons library that will significantly improve code quality, reduce duplication, and enhance developer productivity across all Fast services. 