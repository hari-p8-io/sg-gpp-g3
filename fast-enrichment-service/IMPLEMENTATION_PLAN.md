# Fast Enrichment Service - PACS Message Implementation Plan

## Overview

This document outlines the implementation plan for the `fast-enrichment-service` to handle PACS message enrichment via gRPC endpoints, receiving messages from `fast-requesthandler-service`, calling `fast-accountlookup-service` for account enrichment, and forwarding enriched data to `fast-validation-service` for the Singapore market.

## Requirements Summary

- Accept enrichment requests from fast-requesthandler-service via gRPC
- Extract CdtrAcct information from XML payload
- Call fast-accountlookup-service with CdtrAcct to get enrichment data
- Integrate received enrichment data into the message
- Forward enriched message to fast-validation-service via gRPC
- Maintain status tracking and error propagation back to calling service
- Focus on Singapore market (SGD currency, SG country codes)

## Architecture Changes

### Current State
- HTTP REST API or basic service
- Simple request/response handling
- No enrichment logic

### Target State
- **gRPC Only**: Pure gRPC service for inter-service communication
- **XML Processing**: Parse and extract account information from PACS XML
- **Account Lookup Integration**: Call fast-accountlookup-service for enrichment data
- **Data Integration**: Combine lookup results with message data
- **Service Chaining**: Forward to fast-validation-service
- **Status Management**: Track and propagate success/failure states
- **Singapore Market Focus**: SG-specific account and banking data

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0",
    "xml2js": "^0.6.0",
    "uuid": "^9.0.0",
    "libxmljs2": "^0.32.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "grpc-tools": "^1.12.0",
    "@types/xml2js": "^0.4.0"
  }
}
```

## Updated Service Flow

```
fast-requesthandler-service 
            ↓ (gRPC)
fast-enrichment-service
            ↓ (gRPC - CdtrAcct)
fast-accountlookup-service
            ↓ (EnrichmentData response)
fast-enrichment-service
            ↓ (gRPC - enriched message)
fast-validation-service
```

## gRPC Service Definitions

### File: `proto/enrichment_service.proto`
```protobuf
syntax = "proto3";

package gpp.g3.enrichment;

service EnrichmentService {
  // Enrich a PACS message with account lookup data
  rpc EnrichPacsMessage(EnrichmentRequest) returns (EnrichmentResponse);
  
  // Health check for the enrichment service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message EnrichmentRequest {
  string message_id = 1;          // UUID from request handler
  string puid = 2;                // G3I identifier
  string message_type = 3;        // PACS008, PACS007, PACS003
  string xml_payload = 4;         // The validated XML payload
  map<string, string> metadata = 5; // Additional context data
  int64 timestamp = 6;            // Original processing timestamp
}

message EnrichmentResponse {
  string message_id = 1;               // Echo back the UUID
  string puid = 2;                     // Echo back the G3I identifier
  bool success = 3;                    // Whether enrichment was successful
  string enriched_payload = 4;         // The enriched XML payload
  string error_message = 5;            // Error details if success = false
  EnrichmentData enrichment_data = 6;  // Enrichment data from account lookup
  int64 processed_at = 7;              // When enrichment completed
  string next_service = 8;             // Next service in pipeline (fast-validation-service)
}

message EnrichmentData {
  string received_acct_id = 1;         // Original CdtrAcct ID
  int32 lookup_status_code = 2;        // 200 for success
  string lookup_status_desc = 3;       // Success description
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
  string acct_type = 1;                // Account type (Physical)
}

message AccountOpsAttributes {
  string is_active = 1;                // Yes/No
  string acct_status = 2;              // Active status
  string expiry_date = 3;              // Future date in dd/mm/yyyy
  Restraints restraints = 4;           // Account restraints
}

message Restraints {
  string stop_all = 1;                 // N
  string stop_debits = 2;              // N
  string stop_credits = 3;             // N
  string stop_atm = 4;                 // N
  string stop_eft_pos = 5;             // N
  string stop_unknown = 6;             // N
  string warnings = 7;                 // None
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
}
```

### File: `proto/accountlookup_client.proto`
```protobuf
syntax = "proto3";

package gpp.g3.accountlookup;

service AccountLookupService {
  // Lookup account information and return enrichment data
  rpc LookupAccount(AccountLookupRequest) returns (AccountLookupResponse);
  
  // Health check for the account lookup service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message AccountLookupRequest {
  string message_id = 1;               // UUID for tracking
  string puid = 2;                     // G3I identifier
  string cdtr_acct_id = 3;             // Extracted CdtrAcct ID
  string message_type = 4;             // PACS message type for context
  map<string, string> metadata = 5;    // Additional lookup context
  int64 timestamp = 6;                 // Request timestamp
}

message AccountLookupResponse {
  string message_id = 1;                            // Echo back UUID
  string puid = 2;                                  // Echo back G3I identifier
  bool success = 3;                                 // Whether lookup was successful
  string error_message = 4;                         // Error details if success = false
  gpp.g3.enrichment.EnrichmentData enrichment_data = 5; // Full enrichment data
  int64 processed_at = 6;                          // When lookup completed
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
}
```

### File: `proto/validation_client.proto`
```protobuf
syntax = "proto3";

package gpp.g3.validation;

service ValidationService {
  // Validate enriched PACS message
  rpc ValidatePacsMessage(ValidationRequest) returns (ValidationResponse);
  
  // Health check
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message ValidationRequest {
  string message_id = 1;
  string puid = 2;
  string message_type = 3;
  string enriched_xml_payload = 4;
  gpp.g3.enrichment.EnrichmentData enrichment_data = 5; // Enrichment data from account lookup
  map<string, string> metadata = 6;
  int64 timestamp = 7;
}

message ValidationResponse {
  string message_id = 1;
  string puid = 2;
  bool success = 3;
  string error_message = 4;
  string validated_payload = 5;
  int64 processed_at = 6;
  string next_service = 7; // fast-orchestrator-service (via Kafka)
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
}
```

## Implementation Phases

### Phase 1: Project Setup (Week 1)
- [ ] Create new gRPC-only service structure
- [ ] Set up protocol buffer definitions for all services
- [ ] Configure dependencies and build tools
- [ ] Generate TypeScript types from proto files
- [ ] Set up development environment and logging

### Phase 2: XML Processing & Account Extraction (Week 1-2)
- [ ] Implement XML parsing logic for PACS messages
- [ ] Create CdtrAcct extraction functionality
- [ ] Add XML validation and error handling
- [ ] Implement Singapore-specific account format validation
- [ ] Add structured logging for account processing

### Phase 3: Account Lookup Service Integration (Week 2)
- [ ] Set up gRPC client for fast-accountlookup-service
- [ ] Implement account lookup request logic
- [ ] Add error handling for lookup service failures
- [ ] Implement timeout and retry mechanisms for lookup calls
- [ ] Add fallback logic for lookup service unavailability

### Phase 4: Data Integration & Enrichment (Week 2)
- [ ] Integrate received enrichment data with message
- [ ] Implement data validation for lookup responses
- [ ] Add enrichment data processing and formatting
- [ ] Create combined enrichment response structure
- [ ] Add Singapore market data validation

### Phase 5: Validation Service Integration (Week 2-3)
- [ ] Set up gRPC client for fast-validation-service
- [ ] Implement enriched message forwarding logic
- [ ] Add service-to-service communication
- [ ] Implement error propagation and status tracking
- [ ] Add timeout and retry mechanisms

### Phase 6: Testing & Documentation (Week 3-4)
- [ ] Create comprehensive test suite with mock account lookup service
- [ ] Add integration tests with account lookup service
- [ ] Performance testing and optimization
- [ ] Error scenario testing (lookup service failures)
- [ ] Documentation and API guides

## File Structure

```
fast-enrichment-service/
├── src/
│   ├── grpc/
│   │   ├── server.ts                    # gRPC server setup
│   │   ├── handlers/
│   │   │   └── enrichmentHandler.ts     # Main enrichment orchestration
│   │   └── clients/
│   │       ├── accountLookupClient.ts   # Client for fast-accountlookup-service
│   │       └── validationClient.ts      # Client for fast-validation-service
│   ├── services/
│   │   ├── xmlProcessor.ts              # XML parsing and extraction
│   │   ├── accountExtractor.ts          # CdtrAcct extraction logic
│   │   ├── enrichmentOrchestrator.ts    # Orchestrate lookup and integration
│   │   └── dataIntegrator.ts            # Integrate lookup data with message
│   ├── utils/
│   │   ├── xmlParser.ts                 # XML utilities
│   │   ├── logger.ts                    # Structured logging
│   │   └── errorHandler.ts              # Error handling utilities
│   ├── types/
│   │   └── enrichment.ts                # TypeScript interfaces
│   └── index.ts                         # Main entry point
├── proto/
│   ├── enrichment_service.proto
│   ├── accountlookup_client.proto
│   └── validation_client.proto
├── tests/
│   ├── unit/
│   │   ├── xmlProcessor.test.ts
│   │   ├── accountExtractor.test.ts
│   │   ├── enrichmentOrchestrator.test.ts
│   │   └── dataIntegrator.test.ts
│   ├── integration/
│   │   ├── accountLookupIntegration.test.ts
│   │   ├── validationIntegration.test.ts
│   │   └── endToEndEnrichment.test.ts
│   └── fixtures/
│       ├── sample_pacs008_sg.xml
│       ├── sample_pacs007_sg.xml
│       ├── sample_pacs003_sg.xml
│       └── mock_enrichment_responses.json
└── config/
    └── default.ts
```

## Updated Processing Flow

### 1. Receive Request
```typescript
// From fast-requesthandler-service
const enrichmentRequest = {
  messageId: "uuid-here",
  puid: "G3I1234567890123",
  messageType: "PACS008",
  xmlPayload: "<Document>...</Document>",
  metadata: { country: "SG", currency: "SGD" },
  timestamp: Date.now()
};
```

### 2. Extract CdtrAcct
```typescript
// Extract from XML
const extractCdtrAcct = (xmlPayload: string): string => {
  // Parse XML and extract: <CdtrAcct><Id><Othr><Id>SPSERVICES001</Id>
  return "SPSERVICES001";
};
```

### 3. Call Account Lookup Service
```typescript
const lookupRequest = {
  messageId: enrichmentRequest.messageId,
  puid: enrichmentRequest.puid,
  cdtrAcctId: "SPSERVICES001",
  messageType: enrichmentRequest.messageType,
  metadata: enrichmentRequest.metadata,
  timestamp: Date.now()
};

const lookupResponse = await accountLookupClient.lookupAccount(lookupRequest);
```

### 4. Integrate and Forward
```typescript
const enrichmentResponse = {
  messageId: enrichmentRequest.messageId,
  puid: enrichmentRequest.puid,
  success: lookupResponse.success,
  enrichedPayload: enrichmentRequest.xmlPayload, // Original XML
  enrichmentData: lookupResponse.enrichmentData, // From lookup service
  processedAt: Date.now(),
  nextService: "fast-validation-service"
};

// Forward to validation service
await validationClient.validatePacsMessage(enrichmentResponse);
```

## Error Handling Strategy

### Account Lookup Service Errors
1. **Service Unavailable**: Retry with exponential backoff
2. **Timeout**: Return error with specific timeout message
3. **Invalid Account**: Return enrichment data with error status
4. **Malformed Response**: Log error and return standardized error response

### Error Response Format
```typescript
{
  success: false,
  errorMessage: "Account lookup service unavailable",
  errorCode: "ENRICHMENT_LOOKUP_001",
  enrichmentData: null, // No enrichment data available
  timestamp: Date.now()
}
```

### Fallback Strategies
```typescript
const handleLookupFailure = async (cdtrAcctId: string, error: Error): Promise<EnrichmentData> => {
  // Log the error
  logger.error('Account lookup failed', { cdtrAcctId, error: error.message });
  
  // Return minimal enrichment data with error status
  return {
    receivedAcctId: cdtrAcctId,
    lookupStatusCode: 500,
    lookupStatusDesc: "Account lookup service unavailable",
    normalizedAcctId: cdtrAcctId,
    matchedAcctId: cdtrAcctId,
    partialMatch: "N",
    isPhysical: "UNKNOWN",
    physicalAcctInfo: null // Indicate no physical account info available
  };
};
```

## Configuration

### Environment Variables
```bash
# gRPC Configuration
GRPC_PORT=50052
ACCOUNT_LOOKUP_SERVICE_URL=localhost:50059
VALIDATION_SERVICE_URL=localhost:50053

# Service Configuration
SERVICE_NAME=fast-enrichment-service
LOG_LEVEL=info
COUNTRY=SG
DEFAULT_CURRENCY=SGD
TIMEZONE=Asia/Singapore

# Processing Configuration
ENRICHMENT_TIMEOUT_MS=5000
ACCOUNT_LOOKUP_TIMEOUT_MS=3000
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=1000
```

## Testing Strategy

### Unit Tests
- XML parsing and CdtrAcct extraction
- Account lookup client integration
- Data integration logic
- Error handling scenarios
- Singapore market validations

### Integration Tests
- End-to-end enrichment flow with account lookup
- Account lookup service integration (with mock service)
- Validation service integration
- Error propagation testing
- Performance under load

### Mock Account Lookup Service
```typescript
// For testing purposes
const mockAccountLookupService = {
  lookupAccount: async (request: AccountLookupRequest): Promise<AccountLookupResponse> => {
    return {
      messageId: request.messageId,
      puid: request.puid,
      success: true,
      errorMessage: "",
      enrichmentData: {
        receivedAcctId: request.cdtrAcctId,
        lookupStatusCode: 200,
        lookupStatusDesc: "Success",
        normalizedAcctId: request.cdtrAcctId,
        matchedAcctId: request.cdtrAcctId,
        partialMatch: "N",
        isPhysical: "Y",
        physicalAcctInfo: {
          // ... mock Singapore banking data
        }
      },
      processedAt: Date.now()
    };
  }
};
```

## Success Criteria

- [ ] Successfully extract CdtrAcct from all PACS message types
- [ ] Reliable integration with fast-accountlookup-service
- [ ] Proper error handling for lookup service failures
- [ ] Maintain sub-200ms average enrichment processing time (excluding lookup service time)
- [ ] Achieve 99.9% success rate for valid messages when lookup service is available
- [ ] Graceful degradation when lookup service is unavailable
- [ ] Integration with fast-validation-service working correctly
- [ ] Comprehensive test coverage (>95%) including mock lookup service

## Timeline

**Total Duration**: 4 weeks
**Key Milestones**:
- Week 1: Project setup, XML processing, CdtrAcct extraction
- Week 2: Account lookup service integration, data integration logic
- Week 3: Validation service integration, error handling, testing
- Week 4: Performance optimization, documentation, deployment preparation

This updated implementation plan ensures the fast-enrichment-service properly orchestrates account lookup through the dedicated fast-accountlookup-service while maintaining robust error handling and service integration. 