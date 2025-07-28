# Fast Inward Business Validation Service

A TypeScript-based microservice that provides business validation for inward PACS messages with REST API integration and immediate response generation. This service has been redesigned according to the revised implementation plan to focus on business validation with synchronous response generation.

## Overview

The Fast Inward Business Validation Service (formerly fast-inwd-processor-service) processes inward financial messages through comprehensive business validation and generates immediate responses (PACS002 or CAMT029) based on validation results.

### Key Features

- **Business Validation**: Comprehensive validation of PACS messages using business rules
- **REST API Integration**: Integration with reference data service for validation
- **gRPC Account Lookup**: Integration with account lookup service via gRPC
- **Immediate Response Generation**: Generates PACS002 (acceptance) or CAMT029 (rejection) responses
- **Mandate Validation**: Special handling for PACS003 direct debit mandate validation
- **Health Monitoring**: Built-in health checks and monitoring
- **Comprehensive Logging**: Detailed logging for audit and debugging

## Service Architecture

```
External Client
    ↓ (gRPC: BusinessValRequest)
Business Validation Service
    ├─ (gRPC) → Account Lookup Service
    ├─ (REST) → Reference Data Service  
    └─ (REST) → Mandate Lookup Service (for PACS003)
    ↓ (Synchronous Response: PACS002/CAMT029)
External Client ← Business Validation Response
```

## Message Processing Flow

1. **XML Parsing**: Parse incoming PACS/CAMT messages
2. **Account Lookup**: Validate account via gRPC to account lookup service
3. **Reference Data Validation**: Validate currency, country, bank codes via REST API
4. **Mandate Validation**: For PACS003, validate mandate via REST API
5. **Business Rules Application**: Apply comprehensive business validation rules
6. **Response Generation**: Generate PACS002 (acceptance) or CAMT029 (rejection)
7. **Return Response**: Immediate synchronous response to client

## Supported Message Types

- **PACS008**: Customer Credit Transfer
- **PACS007**: Reversal of Customer Credit Transfer  
- **PACS003**: Customer Direct Debit
- **CAMT053**: Bank to Customer Statement
- **CAMT054**: Bank to Customer Debit Credit Notification

## Configuration

### Environment Variables

```env
# Server Configuration
GRPC_PORT=50052
NODE_ENV=development

# External Service URLs
ACCOUNT_LOOKUP_GRPC_URL=localhost:50059
REFERENCE_DATA_REST_URL=http://localhost:8080
MANDATE_LOOKUP_REST_URL=http://localhost:8081

# Client Configuration
REST_CLIENT_TIMEOUT=5000
GRPC_CLIENT_TIMEOUT=5000

# Logging
LOG_LEVEL=info
```

### gRPC Service Definition

```protobuf
service BusinessValService {
  rpc ProcessMessage(BusinessValRequest) returns (BusinessValResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

## API Endpoints

### gRPC Methods

#### ProcessMessage
- **Input**: BusinessValRequest (message_id, puid, message_type, xml_payload, metadata, timestamp)
- **Output**: BusinessValResponse (success, response_payload, enrichment_data, validation_result, response_type)
- **Description**: Processes business validation and returns immediate response

#### HealthCheck
- **Input**: HealthCheckRequest
- **Output**: HealthCheckResponse
- **Description**: Service health status check

## Business Rules

### Account Validation
- Account must be physical and active
- Account restraints are checked (stop_all, stop_credits, stop_debits)
- Account system compatibility verification

### Reference Data Validation
- Currency code validation
- Country code validation  
- Bank code validation

### Mandate Validation (PACS003)
- Mandate must be active
- Mandate type verification
- Amount and frequency limits

### Risk Assessment
- Calculated based on validation errors, warnings, and account factors
- Risk scores: LOW, MEDIUM, HIGH

## Installation

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start the service
npm start

# Development mode
npm run dev
```

## Testing

```bash
# Run unit tests
npm test

# Run end-to-end tests
npm run test:e2e

# Run tests with UI
npm run test:ui
```

## Development

### Project Structure

```
src/
├── grpc/
│   ├── server.ts              # gRPC server setup
│   ├── handlers/
│   │   └── businessValHandler.ts    # Business validation handler
│   └── clients/
│       └── accountLookupGrpcClient.ts # Account lookup client
├── services/
│   ├── businessValidationService.ts  # Main business logic
│   └── responseGenerationService.ts  # Response generation
├── clients/
│   ├── referenceDataRestClient.ts   # Reference data REST client
│   └── mandateLookupRestClient.ts   # Mandate lookup REST client
├── utils/
│   └── logger.ts             # Logging utility
├── config/
│   └── default.ts            # Configuration
└── index.ts                  # Service entry point
```

### Adding New Validation Rules

1. Extend the `applyBusinessRules` method in `BusinessValidationService`
2. Add new error codes to the response generation mapping
3. Update tests to cover new rules
4. Document changes in this README

## Monitoring and Observability

### Health Checks
- gRPC health check endpoint
- Dependency health verification
- Service status monitoring

### Logging
- Structured JSON logging
- Request/response correlation
- Performance metrics
- Error tracking

### Metrics
- Processing time tracking
- Success/failure rates
- Business rule violation statistics
- Response type distribution

## Error Handling

### Error Types
- **Validation Errors**: Business rule violations
- **Technical Errors**: Service unavailability, timeouts
- **Data Errors**: Invalid XML, missing required fields

### Error Responses
- **CAMT029**: Standard rejection response for business rule violations
- **Error Response**: Technical error with details for debugging

## Security Considerations

- Input validation and sanitization
- Error message sanitization to prevent information leakage
- Service-to-service authentication (when implemented)
- Audit logging for compliance

## Performance

### Optimization Features
- Async processing for external calls
- Connection pooling for REST clients
- Efficient XML parsing
- Caching for reference data (future enhancement)

### Performance Targets
- P95 response time: < 500ms
- Throughput: > 1000 TPS
- Availability: 99.9%

## Troubleshooting

### Common Issues

1. **gRPC Connection Failures**
   - Check account lookup service availability
   - Verify network connectivity
   - Check service discovery configuration

2. **REST API Timeouts**
   - Increase timeout configuration
   - Check reference data service performance
   - Monitor network latency

3. **Validation Failures**
   - Check business rule configuration
   - Verify account data quality
   - Review reference data accuracy

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Run with debug output
DEBUG=* npm run dev
```

## Contributing

1. Follow TypeScript best practices
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Use conventional commit messages
5. Ensure all linting passes

## License

ISC - Internal use only 