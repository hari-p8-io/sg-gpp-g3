# PW-Core: Playwright Testing Framework for Fast Services

A comprehensive Playwright testing library that consolidates common testing utilities, patterns, and components used across all Fast services.

## Features

- **Generic gRPC Test Client**: Unified client for testing gRPC services
- **Service Test Helper**: Simplified service testing with common patterns
- **Singapore-Specific Assertions**: Domain-specific assertions for banking/PACS
- **Test Fixtures**: Pre-built test data for PACS messages
- **Validation Utilities**: Common validation patterns for Singapore market

## Installation

```bash
npm install @gpp/pw-core
```

## Quick Start

### Basic Service Test

```typescript
import { test, expect } from '@playwright/test';
import { ServiceTestHelper, SingaporeFixtures, SingaporeAssertions } from '@gpp/pw-core';

test.describe('Fast Request Handler Service', () => {
  let testHelper: ServiceTestHelper;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('fast-requesthandler-service');
    await testHelper.initialize();
  });

  test.beforeEach(async () => {
    await testHelper.setupTest();
  });

  test.afterEach(async () => {
    await testHelper.teardownTest();
  });

  test('should process PACS008 message', async () => {
    const message = SingaporeFixtures.loadPacs008();
    
    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidPUID(response.puid);
    SingaporeAssertions.expectValidUUID(response.messageId);
    SingaporeAssertions.expectValidSingaporeMessage(response);
  });
});
```

### Custom gRPC Client

```typescript
import { GrpcTestClient } from '@gpp/pw-core';

const client = new GrpcTestClient({
  serviceName: 'my-service',
  serviceUrl: 'localhost:50051',
  protoPath: 'path/to/service.proto',
  packageName: 'gpp.g3.service.MyService'
});

await client.connect();
await client.waitForServiceReady();

const response = await client.call('MyMethod', { data: 'test' });
```

## API Reference

### ServiceTestHelper

Main helper class for service testing.

```typescript
const testHelper = new ServiceTestHelper('service-name', {
  serviceUrl: 'localhost:50051',
  protoPath: 'path/to/proto',
  packageName: 'gpp.g3.service.Service'
});

await testHelper.initialize();
await testHelper.setupTest();
await testHelper.processMessage(message);
await testHelper.teardownTest();
```

### SingaporeFixtures

Pre-built test fixtures for Singapore PACS messages.

```typescript
const pacs008 = SingaporeFixtures.loadPacs008();
const pacs007 = SingaporeFixtures.loadPacs007();
const pacs003 = SingaporeFixtures.loadPacs003();

// Or load by message type
const message = SingaporeFixtures.loadMessage('PACS008');
```

### SingaporeAssertions

Domain-specific assertions for Singapore banking.

```typescript
SingaporeAssertions.expectValidSingaporeMessage(response);
SingaporeAssertions.expectValidPUID(puid);
SingaporeAssertions.expectValidUUID(uuid);
SingaporeAssertions.expectValidAccountLookup(enrichmentData);
SingaporeAssertions.expectValidSingaporeXML(xmlPayload);
SingaporeAssertions.expectValidPacsStructure(xmlPayload, 'PACS008');
SingaporeAssertions.expectHealthyService(healthResponse);
```

### GrpcClientHelper

Utility functions for gRPC testing.

```typescript
const client = GrpcClientHelper.createClient({
  serviceName: 'my-service',
  serviceUrl: 'localhost:50051',
  protoPath: 'path/to/proto',
  packageName: 'gpp.g3.service.Service'
});

const fixture = GrpcClientHelper.loadFixture('path/to/fixture.xml');
const validation = GrpcClientHelper.validateSingaporeFields(xmlPayload);
const isValidUUID = GrpcClientHelper.isValidUUID(uuid);
const isValidPUID = GrpcClientHelper.isValidPUID(puid);
```

## Test Fixtures

### Singapore PACS Messages

- `PACS008`: Credit transfer messages
- `PACS007`: Payment reversal messages  
- `PACS003`: Direct debit messages

### Test Accounts

```typescript
import { SINGAPORE_TEST_ACCOUNTS } from '@gpp/pw-core';

const retailAccount = SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL;
const vamAccount = SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT;
const corporateAccount = SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT;
const governmentAccount = SINGAPORE_TEST_ACCOUNTS.GOVERNMENT_ACCOUNT;
```

## Configuration

### Service Configuration

```typescript
const config = {
  serviceName: 'fast-requesthandler-service',
  serviceUrl: 'localhost:50051',
  protoPath: 'proto/message_handler.proto',
  packageName: 'gpp.g3.requesthandler.MessageHandler',
  timeout: 30000
};
```

### Default Service Mappings

The library includes default configurations for:
- `fast-requesthandler-service` (port 50051)
- `fast-enrichment-service` (port 50052)
- `fast-validation-service` (port 50053)
- `fast-accountlookup-service` (port 50059)

## Examples

### Health Check Test

```typescript
test('should return healthy status', async () => {
  const response = await testHelper.healthCheck();
  SingaporeAssertions.expectHealthyService(response);
});
```

### Message Processing with Validation

```typescript
test('should process and validate Singapore message', async () => {
  const message = SingaporeFixtures.loadPacs008();
  
  const response = await testHelper.processMessage(message);
  
  expect(response.success).toBe(true);
  SingaporeAssertions.expectValidPUID(response.puid);
  SingaporeAssertions.expectValidSingaporeXML(message.xmlPayload);
  SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS008');
});
```

### End-to-End Flow Test

```typescript
test('should process message through complete flow', async () => {
  const message = SingaporeFixtures.loadPacs008();
  
  const { response, storedMessage } = await testHelper.processMessageAndWait(message);
  
  expect(response.success).toBe(true);
  expect(storedMessage).toBeDefined();
  expect(storedMessage.status).toBe('processed');
});
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Contributing

1. Follow the established patterns for test utilities
2. Add comprehensive tests for new functionality
3. Update documentation for new features
4. Ensure Singapore-specific assertions are market-agnostic where possible

## License

MIT 