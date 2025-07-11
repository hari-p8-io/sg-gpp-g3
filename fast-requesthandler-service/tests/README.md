# Fast Request Handler Service - Test Suite

This document describes the comprehensive test suite for the Fast Request Handler Service, focusing on PACS message processing for the Singapore market.

## Test Architecture

The test suite is built using **Playwright** for end-to-end testing of the gRPC service. The tests are organized into multiple categories to ensure comprehensive coverage of all service functionality.

### Test Structure

```
tests/
├── e2e/
│   └── singapore/
│       ├── pacs-processing.spec.ts        # Core PACS message processing tests
│       ├── database-integration.spec.ts    # Database persistence and retrieval tests
│       └── validation-integration.spec.ts  # XSD validation and error handling tests
├── fixtures/
│   ├── sample_pacs008_sg.xml             # Singapore PACS008 credit transfer sample
│   ├── sample_pacs007_sg.xml             # Singapore PACS007 payment reversal sample
│   └── sample_pacs003_sg.xml             # Singapore PACS003 direct debit sample
├── utils/
│   └── grpc-client.ts                     # gRPC client utilities and helpers
└── README.md                              # This file
```

## Test Categories

### 1. PACS Message Processing Tests (`pacs-processing.spec.ts`)

**Coverage:**
- Health check validation
- PACS008, PACS007, PACS003 message processing
- Singapore-specific validations (SGD currency, SG country codes, timezone)
- UUID and PUID generation and uniqueness
- Message status queries
- Error handling (invalid XML, unsupported message types)
- Performance and concurrency testing

**Key Test Cases:**
- ✅ Process valid Singapore PACS008 messages
- ✅ Validate Singapore-specific elements (SGD, SG country, postal codes)
- ✅ Handle different SGD amounts and formats
- ✅ Process PACS007 reversal messages with proper reason codes
- ✅ Process PACS003 direct debit messages
- ✅ Generate unique UUIDs (36 characters) and PUIDs (G3I + 13 characters)
- ✅ Query message status by both UUID and PUID
- ✅ Handle concurrent processing (10+ parallel requests)
- ✅ Validate processing time limits (< 5 seconds per message)

### 2. Database Integration Tests (`database-integration.spec.ts`)

**Coverage:**
- Data persistence in `safe_str` table
- Message status tracking
- Data integrity and uniqueness constraints
- Concurrent database operations
- Error handling for database scenarios

**Key Test Cases:**
- ✅ Persist all PACS message types in Cloud Spanner
- ✅ Track message status changes (RECEIVED → VALIDATED → ENRICHED)
- ✅ Ensure UUID and PUID uniqueness across all message types
- ✅ Validate timestamp consistency
- ✅ Handle concurrent database inserts without conflicts
- ✅ Support concurrent status queries
- ✅ Gracefully handle invalid identifier queries

### 3. Validation and Integration Tests (`validation-integration.spec.ts`)

**Coverage:**
- XSD schema validation
- Singapore-specific validation rules
- Message processing pipeline
- Message type specific validation
- Error recovery and resilience
- Performance under load

**Key Test Cases:**
- ✅ Validate PACS messages against XSD schemas
- ✅ Reject invalid XML structure and malformed XML
- ✅ Validate Singapore market requirements (SGD, SG country, postal codes, timezone)
- ✅ Handle non-SGD currencies with warnings
- ✅ Process messages through complete pipeline
- ✅ Forward messages to enrichment service asynchronously
- ✅ Validate message type specific structures
- ✅ Handle large XML payloads and special characters
- ✅ Maintain performance under load (20+ concurrent messages)

## Running the Tests

### Prerequisites

1. **Service Running**: Ensure the fast-requesthandler-service is running on port 50051
2. **Database**: Cloud Spanner emulator or mock mode should be available
3. **Dependencies**: Install test dependencies

```bash
# Install dependencies
npm install

# Ensure service is running
npm run dev
```

### Running Tests

```bash
# Run all Playwright tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/singapore/pacs-processing.spec.ts

# Run tests with UI mode for debugging
npx playwright test --ui

# Run tests in headed mode
npx playwright test --headed

# Run specific test by name
npx playwright test --grep "should process valid Singapore PACS008 message"
```

### Test Configuration

The tests are configured via `playwright.config.ts`:

- **Base URL**: `grpc://localhost:50051`
- **Timeout**: 30 seconds for service startup
- **Retries**: 2 retries in CI environment
- **Parallel execution**: Enabled for faster test runs

## Test Data

### Sample XML Messages

The test suite includes Singapore-specific sample XML files:

1. **PACS008 (Customer Credit Transfer)**
   - SGD currency (1500.00)
   - Singapore addresses with postal codes
   - Asia/Singapore timezone (+08:00)
   - Singapore bank account formats

2. **PACS007 (Payment Reversal)**
   - References original PACS008 message
   - Proper reversal reason codes (AC03)
   - Singapore-specific error descriptions

3. **PACS003 (Direct Debit)**
   - Singapore utility company example
   - SGD currency (250.00)
   - Singapore customer details

### Test Utilities

The `grpc-client.ts` utility provides:

- **GrpcTestClient**: Singleton client for gRPC connections
- **Helper functions**: UUID/PUID validation, fixture loading
- **Singapore validators**: Check for SGD currency, SG country codes, etc.
- **Service readiness checks**: Wait for service availability

## Expected Test Results

### Success Criteria

- ✅ **All message types processed**: PACS008, PACS007, PACS003
- ✅ **Singapore validations pass**: SGD currency, SG country codes, postal codes
- ✅ **Identifier generation works**: Unique UUIDs and PUIDs (G3I prefix)
- ✅ **Database persistence**: Messages stored in `safe_str` table
- ✅ **Status tracking**: Message status progression
- ✅ **Performance targets**: < 5 seconds per message, 20+ concurrent messages
- ✅ **Error handling**: Graceful handling of invalid inputs

### Performance Benchmarks

- **Single message processing**: < 1 second average
- **Concurrent processing**: 10+ parallel messages without errors
- **Database operations**: < 500ms for status queries
- **XSD validation**: < 200ms per message
- **Load testing**: 20+ concurrent messages with < 1 second average

## Troubleshooting

### Common Issues

1. **Service not ready**: Ensure gRPC service is running on port 50051
2. **Database connection**: Verify Cloud Spanner emulator or mock mode is configured
3. **Proto file issues**: Ensure protocol buffer definitions are generated
4. **Test timeouts**: Increase timeout values in slow environments

### Debug Mode

Run tests with debug output:

```bash
# Enable debug logging
DEBUG=pw:api npx playwright test

# Run specific test with detailed output
npx playwright test --debug tests/e2e/singapore/pacs-processing.spec.ts
```

### Test Reports

Playwright generates detailed HTML reports:

```bash
# Generate and open test report
npx playwright show-report
```

## Integration with CI/CD

The test suite is designed to integrate with CI/CD pipelines:

- **Headless execution**: Tests run without browser UI
- **Retry logic**: Automatic retries for flaky tests
- **Service health checks**: Wait for service readiness
- **Parallel execution**: Faster test runs
- **Comprehensive reporting**: HTML and JSON reports

## Test Coverage

The test suite provides comprehensive coverage:

- **Functional testing**: All gRPC endpoints and message types
- **Integration testing**: Database and external service interactions
- **Error scenarios**: Invalid inputs and edge cases
- **Performance testing**: Load and concurrency testing
- **Singapore market**: Specific validations for Singapore requirements

## Contributing

When adding new tests:

1. **Follow naming conventions**: Use descriptive test names
2. **Use proper fixtures**: Create realistic Singapore market data
3. **Add error scenarios**: Test both success and failure cases
4. **Include performance tests**: Verify response times
5. **Document test purpose**: Clear descriptions of what is being tested

## Support

For issues with the test suite:

1. Check service logs for gRPC errors
2. Verify database connectivity
3. Ensure all dependencies are installed
4. Review test configuration settings
5. Check for port conflicts (50051 for gRPC)

The test suite is designed to be reliable, comprehensive, and maintainable, providing confidence in the Fast Request Handler Service's functionality for Singapore market PACS message processing. 