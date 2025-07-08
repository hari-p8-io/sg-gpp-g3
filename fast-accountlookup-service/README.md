# Fast Account Lookup Service

A gRPC-based microservice that provides account lookup and enrichment capabilities for PACS message processing, with a focus on Singapore banking standards.

## Overview

The Fast Account Lookup Service accepts CdtrAcct (creditor account) information and returns comprehensive enrichment data including Singapore-specific banking details. Currently implemented as a stubbed service for development and testing purposes.

## Features

- **gRPC API**: High-performance gRPC service interface
- **Singapore Banking Data**: Compliant with Singapore banking standards (SGD, SG country codes, ANZBSG3MXXX)
- **Mock Data Generation**: Realistic Singapore banking data for testing
- **Error Simulation**: Configurable error scenarios for testing
- **Health Monitoring**: Built-in health checks and service information endpoints
- **Comprehensive Logging**: Structured JSON logging

## Architecture

```
fast-enrichment-service 
            ↓ (gRPC - AccountLookupRequest)
fast-accountlookup-service
            ↓ (AccountLookupResponse with EnrichmentData)
fast-enrichment-service
```

## Quick Start

### Prerequisites

- Node.js 18+
- TypeScript
- gRPC tools

### Installation

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start the service
npm start
```

### Development Mode

```bash
# Run in development mode with auto-reload
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui
```

## Configuration

The service can be configured using environment variables:

### gRPC Configuration
- `GRPC_PORT`: Service port (default: 50059)
- `SERVICE_NAME`: Service name (default: fast-accountlookup-service)

### Service Configuration
- `LOG_LEVEL`: Logging level (default: info)
- `ENVIRONMENT`: Environment (default: development)
- `IS_STUBBED`: Whether service is stubbed (default: true)
- `COUNTRY`: Country code (default: SG)
- `DEFAULT_CURRENCY`: Default currency (default: SGD)
- `TIMEZONE`: Timezone (default: Asia/Singapore)
- `DEFAULT_BANK_CODE`: Default bank code (default: ANZBSG3MXXX)

### Mock Data Configuration
- `MOCK_SUCCESS_RATE`: Success rate for mock responses (default: 0.95)
- `MOCK_RESPONSE_DELAY_MS`: Simulated response delay (default: 100)
- `ENABLE_ERROR_SCENARIOS`: Enable error simulation (default: true)
- `DEFAULT_ACCOUNT_TYPE`: Default account type (default: Physical)

### Processing Configuration
- `LOOKUP_TIMEOUT_MS`: Lookup timeout (default: 3000)
- `MAX_RETRY_ATTEMPTS`: Maximum retry attempts (default: 2)
- `RATE_LIMIT_REQUESTS_PER_MINUTE`: Rate limit (default: 1000)

## API Reference

### gRPC Service Definition

```protobuf
service AccountLookupService {
  rpc LookupAccount(AccountLookupRequest) returns (AccountLookupResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
  rpc GetServiceInfo(ServiceInfoRequest) returns (ServiceInfoResponse);
}
```

### LookupAccount

Looks up account information and returns enrichment data.

**Request:**
```json
{
  "message_id": "uuid-here",
  "puid": "G3I1234567890123",
  "cdtr_acct_id": "SPSERVICES001",
  "message_type": "PACS008",
  "metadata": {"country": "SG"},
  "timestamp": 1640995200000
}
```

**Response:**
```json
{
  "message_id": "uuid-here",
  "puid": "G3I1234567890123",
  "success": true,
  "enrichment_data": {
    "received_acct_id": "SPSERVICES001",
    "lookup_status_code": 200,
    "lookup_status_desc": "Success",
    "normalized_acct_id": "SPSERVICES001",
    "matched_acct_id": "SPSERVICES001",
    "partial_match": "N",
    "is_physical": "Y",
    "physical_acct_info": {
      "acct_id": "SPSERVICES001",
      "acct_sys": "FAST",
      "acct_group": "SGB",
      "country": "SG",
      "branch_id": "001",
      "acct_attributes": {
        "acct_type": "Utility",
        "acct_category": "UTILITY",
        "acct_purpose": "UTILITY_SERVICES"
      },
      "acct_ops_attributes": {
        "is_active": "Yes",
        "acct_status": "Active",
        "open_date": "15/03/2020",
        "expiry_date": "31/12/2025",
        "restraints": {
          "stop_all": "N",
          "stop_debits": "N",
          "stop_credits": "N",
          "stop_atm": "N",
          "stop_eft_pos": "N",
          "stop_unknown": "N",
          "warnings": "None"
        }
      },
      "bicfi": "ANZBSG3MXXX",
      "currency_code": "SGD"
    }
  },
  "processed_at": 1640995201000,
  "lookup_source": "STUB"
}
```

## Account Types and Business Logic

The service determines account types based on account ID patterns:

- **Corporate**: Account IDs starting with `CORP`
- **Government**: Account IDs starting with `GOVT`
- **Utility**: Account IDs starting with `UTIL` or `SP`
- **Physical**: Default for other account IDs

Each account type uses appropriate Singapore banking systems:
- Corporate/Government: MEPS system
- Utility: FAST system
- Physical: MDZ system

## Error Scenarios

The service simulates various error scenarios for testing:

### Account Not Found
- Account IDs containing `NOTFOUND`
- Returns status code 404
- Error code: `LOOKUP_ACCOUNT_NOT_FOUND_002`

### Account Inactive
- Account IDs containing `INACTIVE`
- Returns account data with inactive status
- All restraints set to 'Y'

### Processing Error
- Account IDs containing `ERROR` or `FAIL`
- Returns status code 500
- Error code: `LOOKUP_PROCESSING_ERROR_004`

## Singapore Banking Compliance

The service returns data compliant with Singapore banking standards:

- **Country Code**: SG
- **Currency**: SGD
- **Timezone**: Asia/Singapore
- **Date Format**: DD/MM/YYYY
- **Bank Codes**: Valid Singapore bank identifiers (ANZBSG3MXXX, etc.)
- **Account Systems**: MDZ, MEPS, FAST
- **Branch Codes**: 3-digit numeric codes

## Docker Support

### Build Docker Image

```bash
docker build -t fast-accountlookup-service .
```

### Run with Docker

```bash
docker run -p 50059:50059 \
  -e GRPC_PORT=50059 \
  -e LOG_LEVEL=info \
  fast-accountlookup-service
```

### Docker Compose

```yaml
version: '3.8'
services:
  fast-accountlookup-service:
    build: .
    ports:
      - "50059:50059"
    environment:
      - GRPC_PORT=50059
      - LOG_LEVEL=info
      - IS_STUBBED=true
    healthcheck:
      test: ["CMD", "grpc_health_probe", "-addr=:50059"]
      interval: 30s
      timeout: 3s
      retries: 3
```

## Monitoring and Observability

### Health Checks

```bash
# gRPC health check
grpcurl -plaintext localhost:50059 gpp.g3.accountlookup.AccountLookupService/HealthCheck
```

### Service Information

```bash
# Get service info
grpcurl -plaintext localhost:50059 gpp.g3.accountlookup.AccountLookupService/GetServiceInfo
```

### Metrics

The service tracks:
- Request/response times
- Success/failure rates
- Error code distribution
- Request volume

### Logging

Structured JSON logs include:
- Request details (message ID, PUID, account ID)
- Processing times
- Error information
- Business context

## Performance

### Targets
- **Average Response Time**: < 50ms (stubbed)
- **95th Percentile**: < 100ms
- **99th Percentile**: < 200ms
- **Throughput**: > 1000 RPS
- **Concurrent Requests**: > 100

### Resource Usage
- **Memory**: < 100MB baseline
- **CPU**: < 10% baseline utilization

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### End-to-End Tests
```bash
npm run test:e2e
```

### Load Testing
```bash
npm run test:load
```

## Development

### Project Structure

```
fast-accountlookup-service/
├── src/
│   ├── grpc/
│   │   ├── server.ts
│   │   └── handlers/
│   │       └── accountLookupHandler.ts
│   ├── services/
│   │   ├── accountLookupService.ts
│   │   └── mockDataGenerator.ts
│   ├── utils/
│   │   ├── constants.ts
│   │   ├── logger.ts
│   │   ├── dateUtils.ts
│   │   └── accountUtils.ts
│   ├── types/
│   │   └── accountLookup.ts
│   ├── config/
│   │   └── default.ts
│   └── index.ts
├── proto/
│   ├── accountlookup_service.proto
│   └── enrichment_data.proto
├── tests/
│   └── accountLookup.test.ts
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

### Adding New Features

1. Update proto definitions if needed
2. Implement business logic in services
3. Add comprehensive tests
4. Update documentation

### Extending to Real Systems

To integrate with real account systems:

1. Replace `MockDataGenerator` with real data source
2. Add database/API clients
3. Implement caching layer
4. Add authentication/authorization
5. Update configuration for production

## Contributing

1. Follow TypeScript best practices
2. Maintain test coverage > 95%
3. Use structured logging
4. Follow Singapore banking data standards
5. Document all public APIs

## License

MIT License - see LICENSE file for details 