# GPP G3 Initiative - Fast Payment Processing Platform

A comprehensive microservices platform for processing PACS messages in the Singapore market. This monorepo contains multiple services that work together to provide end-to-end payment processing with sophisticated routing, validation, and orchestration capabilities.

## 🚀 Implementation Status: **COMPLETED**

All core services are fully implemented and tested with Playwright integration testing.

## 🏗️ Architecture Overview

```mermaid
graph TD
    A[External Client] --> B[Request Handler<br/>:3001/:50051]
    B --> C[Enrichment Service<br/>:50052]
    C --> D[Account Lookup Service<br/>:50059]
    C --> E[Reference Data Service<br/>:50060]
    C --> F[Validation Service<br/>:50053]
    
    F --> G[Kafka<br/>validated-messages]
    G --> H[Orchestrator Service<br/>:3004]
    
    H --> I{Account System?}
    I -->|VAM| J[VAM Mediation<br/>:3005]
    I -->|MDZ| K[Accounting Service<br/>:8002]
    
    J --> L[Kafka<br/>vam-responses]
    L --> K
    
    K --> M{Auth Method?}
    M -->|GROUPLIMIT| N[Limit Check Service<br/>:3006]
    M -->|Other| O[Complete]
    N --> O
    
    style B fill:#e1f5fe
    style C fill:#e8f5e8
    style F fill:#fff3e0
    style H fill:#f3e5f5
    style K fill:#fce4ec
```

## 📋 Services Overview

### TypeScript/Node.js Services

| Service | Port | Type | Status | Description |
|---------|------|------|--------|-------------|
| **fast-requesthandler-service** | 3001/50051 | gRPC | ✅ | Entry point for PACS messages |
| **fast-enrichment-service** | 50052 | gRPC | ✅ | Account lookup and data enrichment |
| **fast-validation-service** | 50053 | gRPC | ✅ | Message validation and business rules |
| **fast-orchestrator-service** | 3004 | HTTP | ✅ | Message orchestration and routing |
| **fast-accountlookup-service** | 50059 | gRPC | ✅ | Account information lookup |

### Java/Spring Boot Services

| Service | Port | Type | Status | Description |
|---------|------|------|--------|-------------|
| **fast-accounting-service** | 8002 | HTTP | ✅ | Final transaction processing |
| **fast-limitcheck-service** | 3006 | HTTP | ✅ | Limit validation for GROUPLIMIT |
| **vam-mediation-service** | 3005 | HTTP | ✅ | VAM-specific processing |

## 🧪 Running Playwright Tests

### Prerequisites
```bash
# Install Node.js dependencies (from project root)
npm install

# Install Playwright browsers
npx playwright install

# For Java services
mvn clean install
```

### Test All Services
```bash
# Run tests for all TypeScript services
npm run test:all

# Run tests for specific service
cd fast-requesthandler-service && npm test
cd fast-enrichment-service && npm test
cd fast-validation-service && npm test
cd fast-orchestrator-service && npm test
```

### Service-Specific Test Commands

#### 1. Fast Request Handler Service (gRPC)
```bash
cd fast-requesthandler-service

# Run all tests
npm test

# Run with PW-Core integration
npx playwright test tests/pw-core-integration.spec.ts

# Run with detailed output
npx playwright test --reporter=line
```

#### 2. Fast Enrichment Service (gRPC)
```bash
cd fast-enrichment-service

# Run tests with mock mode (bypasses external services)
NODE_ENV=test npm test

# Run with UI
npm run test:headed

# Enable mock mode for development
USE_MOCK_MODE=true npm run dev
```

#### 3. Fast Validation Service (gRPC)
```bash
cd fast-validation-service

# Run all tests
npm test

# Run specific test file
npx playwright test tests/pw-core-integration.spec.ts

# Run with debug mode
npm run test:debug
```

#### 4. Fast Orchestrator Service (HTTP)
```bash
cd fast-orchestrator-service

# Start service first (required for HTTP tests)
npm run dev &

# Run tests
npm test

# Run with detailed output
npx playwright test --reporter=line

# Stop service
pkill -f "fast-orchestrator"
```

### Test Results Summary

| Service | Test Framework | Status | Test Count |
|---------|---------------|--------|------------|
| **fast-requesthandler-service** | Playwright + PW-Core | ✅ 2/2 | 2 tests passing |
| **fast-enrichment-service** | Playwright + PW-Core | ✅ 6/6 | 6 tests passing |
| **fast-validation-service** | Playwright + PW-Core | ✅ 6/6 | 6 tests passing |
| **fast-orchestrator-service** | Playwright + HTTP | ✅ 7/7 | 7 tests passing |

## 🔄 Message Processing Flow

### End-to-End Message Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant RH as Request Handler
    participant ES as Enrichment Service
    participant ALS as Account Lookup
    participant RDS as Reference Data
    participant VS as Validation Service
    participant K as Kafka
    participant OS as Orchestrator
    participant AS as Accounting Service
    participant LCS as Limit Check Service
    
    C->>RH: PACS Message
    RH->>ES: Enrich Message
    ES->>ALS: Lookup Account
    ALS->>ES: Account Info
    ES->>RDS: Get Auth Method
    RDS->>ES: Auth Method
    ES->>VS: Validate Message
    VS->>K: Publish Validated Message
    K->>OS: Consume Message
    
    alt VAM Account
        OS->>AS: Via VAM Mediation
    else MDZ Account
        OS->>AS: Direct Processing
    end
    
    alt GROUPLIMIT Auth
        OS->>LCS: Fire-and-forget Limit Check
    end
    
    AS->>OS: Processing Complete
    OS->>RH: Success Response
    RH->>C: Transaction Complete
```

## 🎯 Authentication Method Routing

### Supported Authentication Methods

| Auth Method | Description | Routing | Limit Check |
|-------------|-------------|---------|-------------|
| **AFPONLY** | Standard AFP only | Direct | No |
| **AFPTHENLIMIT** | AFP then limit | Direct | No |
| **GROUPLIMIT** | Group-based limit | Direct | Yes (Post-accounting) |

### Account System Routing

| Account System | Route | Description |
|---------------|-------|-------------|
| **VAM** | VAM Mediation → Accounting | High-value accounts |
| **MDZ** | Direct to Accounting | Standard retail accounts |
| **MEPS** | Direct to Accounting | Government/institutional |

## 🛠️ Development Setup

### Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### Starting All Services

#### TypeScript Services
```bash
# Terminal 1: Request Handler
cd fast-requesthandler-service && npm run dev

# Terminal 2: Enrichment Service
cd fast-enrichment-service && npm run dev

# Terminal 3: Validation Service
cd fast-validation-service && npm run dev

# Terminal 4: Orchestrator Service
cd fast-orchestrator-service && npm run dev

# Terminal 5: Account Lookup Service
cd fast-accountlookup-service && npm run dev
```

#### Java Services
```bash
# Terminal 6: Accounting Service
cd fast-accounting-service && mvn spring-boot:run

# Terminal 7: Limit Check Service
cd fast-limitcheck-service && mvn spring-boot:run

# Terminal 8: VAM Mediation Service
cd vam-mediation-service && mvn spring-boot:run
```

### Service Health Checks
```bash
# Check all services
curl http://localhost:3001/health    # Request Handler
curl http://localhost:50052/health   # Enrichment (gRPC)
curl http://localhost:50053/health   # Validation (gRPC)
curl http://localhost:3004/health    # Orchestrator
curl http://localhost:8002/health    # Accounting
```

## 📊 Testing Strategy

### Test Categories

#### Unit Tests
- Service-specific business logic
- Message processing functions
- Validation rules
- Error handling

#### Integration Tests
- gRPC service interactions
- HTTP API endpoints
- Kafka message flow
- Database operations

#### End-to-End Tests
- Complete message processing flow
- Multi-service orchestration
- Error scenarios
- Performance testing

### PW-Core Testing Framework

All services use the **PW-Core** testing framework for:
- **Standardized gRPC testing**
- **Singapore-specific fixtures**
- **Domain-specific assertions**
- **Service lifecycle management**

#### Example Test Structure
```typescript
import { test, expect } from '@playwright/test';
import { ServiceTestHelper, SingaporeFixtures } from '@gpp/pw-core';

test.describe('Service Integration Tests', () => {
  let testHelper: ServiceTestHelper;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('service-name');
    await testHelper.initialize();
  });

  test('should process Singapore PACS message', async () => {
    const message = SingaporeFixtures.loadPacs008();
    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    expect(response.messageId).toBeDefined();
  });
});
```

## 📈 Monitoring & Observability

### Health Monitoring
- **Service Health**: Individual service health checks
- **Dependency Health**: External service dependency monitoring
- **Kafka Health**: Message queue connectivity and lag monitoring

### Logging
- **Structured Logging**: JSON format with correlation IDs
- **Distributed Tracing**: Request tracing across services
- **Audit Logging**: Complete audit trail for compliance

### Metrics
- **Throughput**: Messages processed per second
- **Latency**: End-to-end processing time
- **Error Rates**: Success/failure rates by service
- **Queue Depth**: Kafka message queue monitoring

## 🎯 Singapore Market Support

### Features
- **Currency**: SGD (Singapore Dollar)
- **Country**: SG (Singapore)
- **Timezone**: Asia/Singapore (+08:00)
- **Bank Codes**: Singapore BIC codes (DBSSSGSG, OCBCSGSG, UOBSSGSG)

### Message Types
- **PACS008**: Customer Credit Transfer
- **PACS007**: Payment Reversal
- **PACS003**: Direct Debit

### Business Rules
- **SGD Currency Validation**: All transactions must be in SGD
- **Singapore Address Validation**: Country code must be SG
- **Bank Code Validation**: Must use valid Singapore bank codes
- **Account Format**: Singapore-specific account number formats

## 🚨 Error Handling

### Error Categories
- **Validation Errors**: Invalid message format or business rules
- **Service Errors**: Downstream service failures
- **Timeout Errors**: Service response timeouts
- **Kafka Errors**: Message queue failures

### Error Response Format
```json
{
  "success": false,
  "errorCode": "VALIDATION_ERROR",
  "errorMessage": "Invalid PACS XML format",
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "service": "fast-validation-service",
  "timestamp": "2025-01-10T10:30:00Z"
}
```

## 📚 Service Documentation

### Individual Service READMEs
- [Fast Request Handler Service](fast-requesthandler-service/README.md)
- [Fast Enrichment Service](fast-enrichment-service/README.md)
- [Fast Validation Service](fast-validation-service/README.md)
- [Fast Orchestrator Service](fast-orchestrator-service/README.md)
- [Fast Accounting Service](fast-accounting-service/README.md)

### Additional Resources
- [PW-Core Testing Framework](pw-core/README.md)
- [PACS Message Standards](https://www.iso20022.org/)
- [Singapore Banking Standards](https://www.mas.gov.sg/)
- [Kafka Documentation](https://kafka.apache.org/documentation/)

---

## 🏁 Getting Started

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Start services**: Follow service-specific README instructions
4. **Run tests**: `npm test` for individual services
5. **Check health**: Verify all services are running
6. **Process messages**: Send PACS messages through the pipeline

The platform is ready for production use with comprehensive testing coverage and monitoring capabilities. 