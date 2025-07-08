# Fast Account Lookup Service - Implementation Plan

## Overview

This document outlines the implementation plan for the `fast-accountlookup-service` to handle account lookup requests via gRPC endpoints. The service receives CdtrAcct information from `fast-enrichment-service` and returns comprehensive enrichment data including Singapore banking details. Initially, the service will be stubbed to return mock data for development and testing purposes.

## Requirements Summary

- Accept account lookup requests from fast-enrichment-service via gRPC
- Process CdtrAcct information and return enrichment data
- Return comprehensive account information including Singapore banking details
- Initially stub the service to return mock enrichment data
- Maintain status tracking and error handling
- Focus on Singapore market (SGD currency, SG country codes, ANZBSG3MXXX)
- Future extensibility for real account lookup integration

## Architecture Design

### Current State
- New service to be created
- No existing implementation

### Target State
- **gRPC Only**: Pure gRPC service for inter-service communication
- **Account Lookup**: Process CdtrAcct and return enrichment data
- **Stubbed Implementation**: Return mock Singapore banking data
- **Error Handling**: Comprehensive error handling and logging
- **Health Checks**: Service health monitoring
- **Singapore Market Focus**: SG-specific account and banking data

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0",
    "uuid": "^9.0.0",
    "moment-timezone": "^0.5.43"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "grpc-tools": "^1.12.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Service Architecture

```
fast-enrichment-service 
            ↓ (gRPC - AccountLookupRequest)
fast-accountlookup-service
            ↓ (AccountLookupResponse with EnrichmentData)
fast-enrichment-service
```

## gRPC Service Definitions

### File: `proto/accountlookup_service.proto`
```protobuf
syntax = "proto3";

package gpp.g3.accountlookup;

import "enrichment_data.proto";

service AccountLookupService {
  // Lookup account information and return enrichment data
  rpc LookupAccount(AccountLookupRequest) returns (AccountLookupResponse);
  
  // Health check for the account lookup service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
  
  // Get service version and capabilities
  rpc GetServiceInfo(ServiceInfoRequest) returns (ServiceInfoResponse);
}

message AccountLookupRequest {
  string message_id = 1;               // UUID for tracking
  string puid = 2;                     // G3I identifier
  string cdtr_acct_id = 3;             // CdtrAcct ID to lookup
  string message_type = 4;             // PACS message type for context
  map<string, string> metadata = 5;    // Additional lookup context
  int64 timestamp = 6;                 // Request timestamp
}

message AccountLookupResponse {
  string message_id = 1;               // Echo back UUID
  string puid = 2;                     // Echo back G3I identifier
  bool success = 3;                    // Whether lookup was successful
  string error_message = 4;            // Error details if success = false
  string error_code = 5;               // Categorized error code
  EnrichmentData enrichment_data = 6;  // Full enrichment data
  int64 processed_at = 7;              // When lookup completed
  string lookup_source = 8;            // Source of lookup (STUB, CACHE, DATABASE)
}

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

### File: `proto/enrichment_data.proto`
```protobuf
syntax = "proto3";

package gpp.g3.accountlookup;

message EnrichmentData {
  string received_acct_id = 1;         // Original CdtrAcct ID
  int32 lookup_status_code = 2;        // 200 for success, 404 for not found, 500 for error
  string lookup_status_desc = 3;       // Human-readable status description
  string normalized_acct_id = 4;       // Normalized account ID
  string matched_acct_id = 5;          // Matched account ID
  string partial_match = 6;            // Y or N
  string is_physical = 7;              // Y or N
  PhysicalAccountInfo physical_acct_info = 8; // Complex account information
}

message PhysicalAccountInfo {
  string acct_id = 1;                  // Account ID
  string acct_sys = 2;                 // Account system (MDZ)
  string acct_group = 3;               // Account group (SGB)
  string country = 4;                  // Country (SG)
  string branch_id = 5;                // Branch ID (nullable)
  AccountAttributes acct_attributes = 6;
  AccountOpsAttributes acct_ops_attributes = 7;
  string bicfi = 8;                    // Bank identifier (ANZBSG3MXXX)
  string currency_code = 9;            // Currency (SGD)
}

message AccountAttributes {
  string acct_type = 1;                // Account type (Physical, Virtual, etc.)
  string acct_category = 2;            // Account category
  string acct_purpose = 3;             // Account purpose
}

message AccountOpsAttributes {
  string is_active = 1;                // Yes/No
  string acct_status = 2;              // Active, Closed, Suspended
  string open_date = 3;                // Account opening date
  string expiry_date = 4;              // Account expiry date
  Restraints restraints = 5;           // Account restraints
}

message Restraints {
  string stop_all = 1;                 // N (No restrictions)
  string stop_debits = 2;              // N
  string stop_credits = 3;             // N
  string stop_atm = 4;                 // N
  string stop_eft_pos = 5;             // N
  string stop_unknown = 6;             // N
  string warnings = 7;                 // None
}
```

## Implementation Phases

### Phase 1: Project Setup (Week 1)
- [ ] Create new gRPC service structure
- [ ] Set up protocol buffer definitions
- [ ] Configure dependencies and build tools
- [ ] Generate TypeScript types from proto files
- [ ] Set up development environment and structured logging
- [ ] Create service configuration management

### Phase 2: Stubbed Account Lookup Logic (Week 1-2)
- [ ] Implement basic account lookup handler
- [ ] Create mock Singapore banking data generator
- [ ] Implement account ID validation and normalization
- [ ] Add business logic for different account types
- [ ] Create stubbed response generation
- [ ] Add configurable mock data scenarios

### Phase 3: gRPC Server Implementation (Week 2)
- [ ] Set up gRPC server infrastructure
- [ ] Implement account lookup service methods
- [ ] Add health check endpoints
- [ ] Implement service info endpoint
- [ ] Add comprehensive error handling
- [ ] Implement request/response logging

### Phase 4: Error Handling & Validation (Week 2-3)
- [ ] Add input validation for CdtrAcct
- [ ] Implement error categorization and codes
- [ ] Add timeout handling
- [ ] Create detailed error responses
- [ ] Add audit logging for all requests
- [ ] Implement rate limiting (basic)

### Phase 5: Testing & Documentation (Week 3-4)
- [ ] Create comprehensive unit test suite
- [ ] Add integration tests
- [ ] Performance testing and optimization
- [ ] Create API documentation
- [ ] Add monitoring and observability
- [ ] Final validation and cleanup

## File Structure

```
fast-accountlookup-service/
├── src/
│   ├── grpc/
│   │   ├── server.ts                    # gRPC server setup
│   │   ├── handlers/
│   │   │   ├── accountLookupHandler.ts  # Main lookup logic
│   │   │   ├── healthCheckHandler.ts    # Health check logic
│   │   │   └── serviceInfoHandler.ts    # Service info logic
│   │   └── middleware/
│   │       ├── logging.ts               # Request/response logging
│   │       ├── validation.ts            # Input validation
│   │       └── errorHandler.ts          # Error handling middleware
│   ├── services/
│   │   ├── accountLookupService.ts      # Core business logic
│   │   ├── mockDataGenerator.ts         # Mock data generation
│   │   ├── accountValidator.ts          # Account validation logic
│   │   └── enrichmentBuilder.ts         # Build enrichment responses
│   ├── utils/
│   │   ├── logger.ts                    # Structured logging
│   │   ├── dateUtils.ts                 # Date formatting utilities
│   │   ├── accountUtils.ts              # Account processing utilities
│   │   └── constants.ts                 # Singapore banking constants
│   ├── types/
│   │   └── accountLookup.ts             # TypeScript interfaces
│   ├── config/
│   │   └── default.ts                   # Service configuration
│   └── index.ts                         # Main entry point
├── proto/
│   ├── accountlookup_service.proto
│   └── enrichment_data.proto
├── tests/
│   ├── unit/
│   │   ├── accountLookupService.test.ts
│   │   ├── mockDataGenerator.test.ts
│   │   ├── accountValidator.test.ts
│   │   └── enrichmentBuilder.test.ts
│   ├── integration/
│   │   ├── grpcServer.test.ts
│   │   ├── endToEndLookup.test.ts
│   │   └── errorScenarios.test.ts
│   └── fixtures/
│       ├── sample_account_requests.json
│       ├── mock_enrichment_data.json
│       └── error_scenarios.json
└── config/
    └── default.ts
```

## Stubbed Implementation Logic

### Mock Data Generation
```typescript
// Example stubbed account lookup implementation
const generateMockEnrichmentData = (cdtrAcctId: string, messageType: string): EnrichmentData => {
  // Simulate different account types based on ID patterns
  const accountType = determineAccountType(cdtrAcctId);
  
  return {
    receivedAcctId: cdtrAcctId,
    lookupStatusCode: 200,
    lookupStatusDesc: "Success",
    normalizedAcctId: normalizeAccountId(cdtrAcctId),
    matchedAcctId: cdtrAcctId,
    partialMatch: "N",
    isPhysical: "Y",
    physicalAcctInfo: {
      acctId: cdtrAcctId,
      acctSys: "MDZ",
      acctGroup: "SGB",
      country: "SG",
      branchId: generateBranchId(cdtrAcctId),
      acctAttributes: {
        acctType: accountType,
        acctCategory: "RETAIL",
        acctPurpose: "GENERAL"
      },
      acctOpsAttributes: {
        isActive: "Yes",
        acctStatus: "Active",
        openDate: generateOpenDate(),
        expiryDate: generateExpiryDate(),
        restraints: {
          stopAll: "N",
          stopDebits: "N",
          stopCredits: "N",
          stopAtm: "N",
          stopEftPos: "N",
          stopUnknown: "N",
          warnings: "None"
        }
      },
      bicfi: "ANZBSG3MXXX",
      currencyCode: "SGD"
    }
  };
};
```

### Account Type Determination
```typescript
const determineAccountType = (cdtrAcctId: string): string => {
  // Simulate business logic for different account types
  if (cdtrAcctId.startsWith("CORP")) return "Corporate";
  if (cdtrAcctId.startsWith("GOVT")) return "Government";
  if (cdtrAcctId.startsWith("UTIL")) return "Utility";
  return "Physical"; // Default for individual accounts
};
```

### Error Scenarios
```typescript
const simulateErrorScenarios = (cdtrAcctId: string): AccountLookupResponse | null => {
  // Simulate different error conditions based on account ID patterns
  if (cdtrAcctId.includes("NOTFOUND")) {
    return {
      success: false,
      errorMessage: "Account not found in system",
      errorCode: "ACCOUNT_NOT_FOUND_001",
      lookupSource: "STUB",
      enrichmentData: null
    };
  }
  
  if (cdtrAcctId.includes("INACTIVE")) {
    return {
      success: false,
      errorMessage: "Account is inactive",
      errorCode: "ACCOUNT_INACTIVE_002",
      lookupSource: "STUB",
      enrichmentData: null
    };
  }
  
  if (cdtrAcctId.includes("ERROR")) {
    return {
      success: false,
      errorMessage: "Internal lookup error",
      errorCode: "LOOKUP_ERROR_500",
      lookupSource: "STUB",
      enrichmentData: null
    };
  }
  
  return null; // No error scenario
};
```

## Singapore Banking Constants

```typescript
export const SINGAPORE_BANKING_CONSTANTS = {
  COUNTRY_CODE: "SG",
  CURRENCY_CODE: "SGD",
  TIMEZONE: "Asia/Singapore",
  BANK_CODES: {
    ANZ: "ANZBSG3MXXX",
    DBS: "DBSSSGSGXXX",
    OCBC: "OCBCSGSGXXX",
    UOB: "UOVBSGSGXXX"
  },
  ACCOUNT_SYSTEMS: {
    MDZ: "MDZ", // Main clearing system
    MEPS: "MEPS", // Electronic payment system
    FAST: "FAST" // Fast payment system
  },
  ACCOUNT_GROUPS: {
    SGB: "SGB", // Singapore Banking Group
    RETAIL: "RETAIL",
    CORPORATE: "CORPORATE"
  },
  BRANCH_CODES: {
    MAIN: "001",
    ORCHARD: "002",
    RAFFLES: "003",
    MARINA: "004"
  }
};
```

## Configuration

### Environment Variables
```bash
# gRPC Configuration
GRPC_PORT=50059
SERVICE_NAME=fast-accountlookup-service

# Service Configuration
LOG_LEVEL=info
ENVIRONMENT=development
IS_STUBBED=true
COUNTRY=SG
DEFAULT_CURRENCY=SGD
TIMEZONE=Asia/Singapore
DEFAULT_BANK_CODE=ANZBSG3MXXX

# Mock Data Configuration
MOCK_SUCCESS_RATE=0.95
MOCK_RESPONSE_DELAY_MS=100
ENABLE_ERROR_SCENARIOS=true
DEFAULT_ACCOUNT_TYPE=Physical

# Processing Configuration
LOOKUP_TIMEOUT_MS=3000
MAX_RETRY_ATTEMPTS=2
RATE_LIMIT_REQUESTS_PER_MINUTE=1000
```

## Error Handling Strategy

### Error Categories
1. **Invalid Input**: Malformed or missing CdtrAcct
2. **Account Not Found**: Account doesn't exist in system
3. **Account Inactive**: Account exists but is inactive
4. **Processing Error**: Internal service error
5. **Timeout**: Request processing timeout

### Error Response Format
```typescript
{
  messageId: "echo-back-uuid",
  puid: "echo-back-puid",
  success: false,
  errorMessage: "Detailed error description",
  errorCode: "CATEGORIZED_ERROR_CODE",
  enrichmentData: null,
  processedAt: Date.now(),
  lookupSource: "STUB"
}
```

### Error Codes
```typescript
export const ERROR_CODES = {
  INVALID_INPUT: "LOOKUP_INVALID_INPUT_001",
  ACCOUNT_NOT_FOUND: "LOOKUP_ACCOUNT_NOT_FOUND_002",
  ACCOUNT_INACTIVE: "LOOKUP_ACCOUNT_INACTIVE_003",
  PROCESSING_ERROR: "LOOKUP_PROCESSING_ERROR_004",
  TIMEOUT: "LOOKUP_TIMEOUT_005",
  RATE_LIMIT: "LOOKUP_RATE_LIMIT_006"
};
```

## Testing Strategy

### Unit Tests
- Mock data generation logic
- Account validation and normalization
- Error scenario simulation
- Singapore banking constants validation
- Date formatting and timezone handling

### Integration Tests
- gRPC server functionality
- End-to-end lookup flow
- Error handling scenarios
- Performance under load
- Service health checks

### Test Scenarios
```typescript
describe('Account Lookup Service', () => {
  test('should return enrichment data for valid account', async () => {
    const request = {
      messageId: 'test-uuid',
      puid: 'G3ITEST123456789',
      cdtrAcctId: 'SPSERVICES001',
      messageType: 'PACS008',
      metadata: { country: 'SG' },
      timestamp: Date.now()
    };
    
    const response = await lookupService.lookupAccount(request);
    
    expect(response.success).toBe(true);
    expect(response.enrichmentData.receivedAcctId).toBe('SPSERVICES001');
    expect(response.enrichmentData.physicalAcctInfo.country).toBe('SG');
    expect(response.enrichmentData.physicalAcctInfo.currencyCode).toBe('SGD');
  });
  
  test('should handle account not found scenario', async () => {
    const request = {
      messageId: 'test-uuid',
      puid: 'G3ITEST123456789',
      cdtrAcctId: 'NOTFOUND12345',
      messageType: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };
    
    const response = await lookupService.lookupAccount(request);
    
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('ACCOUNT_NOT_FOUND_001');
    expect(response.enrichmentData).toBeNull();
  });
});
```

## Performance Considerations

### Response Time Targets
- **Average Response Time**: < 50ms for stubbed responses
- **95th Percentile**: < 100ms
- **99th Percentile**: < 200ms

### Throughput Targets
- **Requests per Second**: > 1000 RPS
- **Concurrent Requests**: > 100 concurrent

### Resource Usage
- **Memory**: < 100MB baseline
- **CPU**: < 10% baseline utilization

## Monitoring and Observability

### Metrics to Track
- Request/response times
- Success/failure rates
- Error code distribution
- Request volume
- Memory and CPU usage

### Logging Strategy
```typescript
// Request logging
logger.info('Account lookup request received', {
  messageId: request.messageId,
  puid: request.puid,
  cdtrAcctId: request.cdtrAcctId,
  messageType: request.messageType,
  timestamp: request.timestamp
});

// Response logging
logger.info('Account lookup completed', {
  messageId: response.messageId,
  success: response.success,
  lookupSource: response.lookupSource,
  processingTime: response.processedAt - request.timestamp,
  errorCode: response.errorCode || null
});
```

## Future Extensibility

### Real Account System Integration
- Database connection setup
- Cache layer implementation
- External API integration
- Data transformation logic

### Advanced Features
- Account relationship mapping
- Historical account data
- Multi-currency support
- Compliance checking
- Fraud detection integration

## Success Criteria

- [ ] Successfully handle account lookup requests via gRPC
- [ ] Return comprehensive Singapore banking enrichment data
- [ ] Maintain sub-50ms average response time for stubbed responses
- [ ] Achieve 99.9% success rate for valid account requests
- [ ] Handle error scenarios gracefully with appropriate error codes
- [ ] Comprehensive test coverage (>95%)
- [ ] Service health monitoring working correctly
- [ ] Proper integration with fast-enrichment-service

## Timeline

**Total Duration**: 4 weeks
**Key Milestones**:
- Week 1: Project setup, proto definitions, basic stubbed logic
- Week 2: gRPC server implementation, mock data generation
- Week 3: Error handling, validation, comprehensive testing
- Week 4: Performance optimization, monitoring, documentation

This implementation plan provides a solid foundation for the fast-accountlookup-service with comprehensive stubbed functionality that can be easily extended to integrate with real account systems in the future. 