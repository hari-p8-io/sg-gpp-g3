# Fast Request Handler Service - PACS Message Implementation Plan

## Overview

This document outlines the implementation plan for enhancing the `fast-requesthandler-service` to handle PACS (Payment & Clearing Systems) messages via gRPC endpoints with Cloud Spanner storage and XSD validation for the Singapore market.

## Requirements Summary

- Accept PACS008, PACS007, and PACS003 XML messages via gRPC only
- Generate unique 36-character UUID as message_id
- Generate unique 16-character identifiers starting with "G3I" stored as puid
- Store payloads in Cloud Spanner (emulator for local development)
- Perform XSD schema validation
- Forward validated requests to fast-enrichment-service via gRPC
- Support Playwright testing for positive scenarios
- Focus on Singapore market (SGD currency, SG country codes)

## Architecture Changes

### Current State
- HTTP REST API with Express.js
- Simple request/response handling
- No persistence layer
- Basic health checks

### Target State
- **gRPC Only**: Remove HTTP REST API, pure gRPC service
- **Database Integration**: Cloud Spanner for message persistence
- **Message Processing Pipeline**: Receive → Validate → Store → Forward
- **Inter-service Communication**: gRPC to fast-enrichment-service
- **Schema Validation**: XSD validation for PACS messages
- **Singapore Market Focus**: SGD currency and SG-specific validations

## Technology Stack Additions

### New Dependencies
```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0",
    "@google-cloud/spanner": "^6.0.0",
    "xml2js": "^0.6.0",
    "libxmljs2": "^0.32.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "grpc-tools": "^1.12.0",
    "@types/xml2js": "^0.4.0"
  }
}
```

### Infrastructure Requirements
- **Cloud Spanner Emulator** (local development)
- **XSD Schema Files** for PACS messages (Singapore-specific if available)
- **Protocol Buffer Definitions** for gRPC services

## Database Schema (Cloud Spanner)

### Table: `safe_str`
```sql
CREATE TABLE safe_str (
  message_id STRING(36) NOT NULL,      -- Standard UUID (36 characters)
  puid STRING(16) NOT NULL,            -- Generated 16-char ID starting with "G3I"
  message_type STRING(10) NOT NULL,    -- PACS008, PACS007, PACS003
  payload STRING(MAX) NOT NULL,        -- The raw XML content
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  processed_at TIMESTAMP,
  status STRING(20) NOT NULL,          -- RECEIVED, VALIDATED, ENRICHED, FAILED
) PRIMARY KEY (message_id);

CREATE UNIQUE INDEX idx_puid ON safe_str (puid);
CREATE INDEX idx_message_type_created_at ON safe_str (message_type, created_at);
CREATE INDEX idx_status_created_at ON safe_str (status, created_at);
```

## gRPC Service Definitions

### File: `proto/pacs_handler.proto`
```protobuf
syntax = "proto3";

package gpp.g3.requesthandler;

service PacsHandler {
  // Process a PACS message (008, 007, or 003)
  rpc ProcessPacsMessage(PacsMessageRequest) returns (PacsMessageResponse);
  
  // Get the status of a previously processed message
  rpc GetMessageStatus(MessageStatusRequest) returns (MessageStatusResponse);
  
  // Health check for the service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message PacsMessageRequest {
  string message_type = 1;  // PACS008, PACS007, PACS003
  string xml_payload = 2;   // The raw XML content
  map<string, string> metadata = 3; // Additional metadata (e.g., source system, timestamp)
}

message PacsMessageResponse {
  string message_id = 1;    // Generated 36-char UUID
  string puid = 2;          // Generated 16-char ID starting with "G3I"
  bool success = 3;         // Whether the processing was successful
  string error_message = 4; // Error details if success = false
  int64 timestamp = 5;      // Processing timestamp (Unix epoch)
  string status = 6;        // Current status: RECEIVED, VALIDATED, ENRICHED, FAILED
}

message MessageStatusRequest {
  oneof identifier {
    string message_id = 1;  // Query by UUID
    string puid = 2;        // Query by G3I identifier
  }
}

message MessageStatusResponse {
  string message_id = 1;    // The UUID
  string puid = 2;          // The G3I identifier
  string status = 3;        // Current status
  int64 created_at = 4;     // When the message was first received
  int64 processed_at = 5;   // When processing completed (0 if still processing)
  string message_type = 6;  // PACS message type
}

message HealthCheckRequest {
  string service = 1;       // Service name for health check
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
    SERVICE_UNKNOWN = 3;
  }
  ServingStatus status = 1;
  string message = 2;       // Additional health information
}
```

### File: `proto/enrichment_client.proto`
```protobuf
syntax = "proto3";

package gpp.g3.enrichment;

service EnrichmentService {
  // Enrich a PACS message with additional data
  rpc EnrichPacsMessage(EnrichmentRequest) returns (EnrichmentResponse);
  
  // Health check for the enrichment service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message EnrichmentRequest {
  string message_id = 1;    // The UUID from request handler
  string puid = 2;          // The G3I identifier
  string message_type = 3;  // PACS008, PACS007, PACS003
  string xml_payload = 4;   // The validated XML payload
  map<string, string> metadata = 5; // Additional context data
  int64 timestamp = 6;      // Original processing timestamp
}

message EnrichmentResponse {
  string message_id = 1;         // Echo back the UUID
  string puid = 2;               // Echo back the G3I identifier
  bool success = 3;              // Whether enrichment was successful
  string enriched_payload = 4;   // The enriched XML payload
  string error_message = 5;      // Error details if success = false
  map<string, string> enrichment_data = 6; // Key-value pairs of enriched data
  int64 processed_at = 7;        // When enrichment completed
  string next_service = 8;       // Suggested next service in the pipeline
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
- [ ] Remove HTTP REST endpoints from existing service
- [ ] Add new dependencies to package.json
- [ ] Set up Cloud Spanner emulator configuration
- [ ] Create database schema and tables (safe_str table)
- [ ] Set up XSD schema files for PACS messages (Singapore market)
- [ ] Generate TypeScript types from proto files

### Phase 2: Core gRPC Infrastructure (Week 1-2)
- [ ] Implement gRPC server setup (replace Express.js)
- [ ] Create UUID generator for message_id (36 chars)
- [ ] Create PUID generator (16 chars starting with "G3I")
- [ ] Set up Cloud Spanner client and connection
- [ ] Implement database operations (insert, update, query)
- [ ] Add structured logging and monitoring

### Phase 3: Message Processing Pipeline (Week 2-3)
- [ ] Implement XML parsing and validation
- [ ] Create XSD schema validation logic with Singapore-specific rules
- [ ] Build message processing workflow
- [ ] Implement error handling and retry mechanisms
- [ ] Add message status tracking
- [ ] Singapore market validations (SGD currency, SG country codes)

### Phase 4: Inter-service Communication (Week 3)
- [ ] Set up gRPC client for fast-enrichment-service
- [ ] Implement message forwarding logic
- [ ] Add timeout and circuit breaker patterns
- [ ] Handle enrichment service responses

### Phase 5: Testing & Documentation (Week 4)
- [ ] Create Playwright test suite
- [ ] Add unit tests for all components
- [ ] Write API documentation
- [ ] Performance testing and optimization
- [ ] Security review and hardening

## File Structure Changes

```
fast-requesthandler-service/
├── src/
│   ├── grpc/
│   │   ├── server.ts           # gRPC server setup (no HTTP)
│   │   ├── handlers/
│   │   │   └── pacsHandler.ts  # PACS message handler
│   │   └── clients/
│   │       └── enrichmentClient.ts
│   ├── database/
│   │   ├── spanner.ts          # Spanner client setup
│   │   └── repositories/
│   │       └── safeStrRepository.ts  # Repository for safe_str table
│   ├── validation/
│   │   ├── xsdValidator.ts     # XSD validation logic
│   │   ├── messageValidator.ts
│   │   └── singaporeValidator.ts # Singapore-specific validations
│   ├── utils/
│   │   ├── uuidGenerator.ts    # UUID generation
│   │   ├── puidGenerator.ts    # G3I identifier generation
│   │   └── xmlParser.ts
│   └── index.ts                # Updated main entry point (gRPC only)
├── proto/
│   ├── pacs_handler.proto
│   └── enrichment_client.proto
├── schemas/
│   ├── pacs008_sg.xsd          # Singapore-specific if available
│   ├── pacs007_sg.xsd
│   └── pacs003_sg.xsd
├── tests/
│   ├── e2e/
│   │   └── playwright/
│   ├── unit/
│   └── fixtures/
│       ├── sample_pacs008_sg.xml  # Singapore-focused samples
│       ├── sample_pacs007_sg.xml
│       └── sample_pacs003_sg.xml
└── docker/
    └── spanner-emulator/
```

## Sample XML Messages (Singapore Market)

### PACS008 (Customer Credit Transfer - Singapore)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG-SG-001-20231207-001</MsgId>
      <CreDtTm>2023-12-07T10:30:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INSTR-SG-001</InstrId>
        <EndToEndId>E2E-SG-001</EndToEndId>
        <TxId>TXN-SG-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
      <InstdAmt Ccy="SGD">1500.00</InstdAmt>
      <Dbtr>
        <Nm>Tan Wei Ming</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <AdrLine>123 Orchard Road</AdrLine>
          <AdrLine>Singapore 238858</AdrLine>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>123456789001</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <Cdtr>
        <Nm>Lim Mei Ling</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>987654321001</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>Payment for services rendered</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

### PACS007 (Payment Reversal - Singapore)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.02">
  <FIToFIPmtRvsl>
    <GrpHdr>
      <MsgId>REV-SG-001-20231207-001</MsgId>
      <CreDtTm>2023-12-07T11:00:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <TxInf>
      <RvslId>RVSL-SG-001</RvslId>
      <OrgnlGrpInf>
        <OrgnlMsgId>MSG-SG-001-20231207-001</OrgnlMsgId>
        <OrgnlMsgNmId>pacs.008.001.02</OrgnlMsgNmId>
      </OrgnlGrpInf>
      <OrgnlTxId>TXN-SG-001</OrgnlTxId>
      <RvslRsnInf>
        <Rsn>
          <Cd>AC03</Cd>
        </Rsn>
        <AddtlInf>Invalid account number</AddtlInf>
      </RvslRsnInf>
      <RtrChain>
        <RtrId>RTR-SG-001</RtrId>
        <RtrRsnInf>
          <Rsn>
            <Cd>AC03</Cd>
          </Rsn>
        </RtrRsnInf>
      </RtrChain>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>
```

### PACS003 (Direct Debit - Singapore)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.003.001.02">
  <FIToFICstmrDrctDbt>
    <GrpHdr>
      <MsgId>DD-SG-001-20231207-001</MsgId>
      <CreDtTm>2023-12-07T09:00:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <DrctDbtTxInf>
      <PmtId>
        <InstrId>DD-INSTR-SG-001</InstrId>
        <EndToEndId>DD-E2E-SG-001</EndToEndId>
        <TxId>DD-TXN-SG-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">250.00</IntrBkSttlmAmt>
      <InstdAmt Ccy="SGD">250.00</InstdAmt>
      <Cdtr>
        <Nm>SP Services Ltd</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>SPSERVICES001</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <Dbtr>
        <Nm>Wong Kai Seng</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>CUST123456SG</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <RmtInf>
        <Ustrd>Monthly utilities bill - December 2023</Ustrd>
      </RmtInf>
    </DrctDbtTxInf>
  </FIToFICstmrDrctDbt>
</Document>
```

## Testing Strategy

### Unit Tests
- UUID and PUID generation validation
- XML parsing and validation with Singapore-specific rules
- Database operations (safe_str table)
- gRPC service methods
- Error handling scenarios
- Singapore market validations (SGD currency, SG country codes)

### Integration Tests
- End-to-end message processing
- Database persistence verification (safe_str table)
- Inter-service communication
- Schema validation with Singapore XML formats

### Playwright E2E Tests
```typescript
// tests/e2e/pacs-processing.spec.ts
import { test, expect } from '@playwright/test';
import { createGrpcClient } from '../utils/grpc-client';

test.describe('PACS Message Processing - Singapore', () => {
  test('should process valid Singapore PACS008 message', async () => {
    const client = createGrpcClient();
    const xmlPayload = readFileSync('tests/fixtures/sample_pacs008_sg.xml', 'utf-8');
    
    const response = await client.ProcessPacsMessage({
      message_type: 'PACS008',
      xml_payload: xmlPayload,
      metadata: { country: 'SG', currency: 'SGD' }
    });
    
    expect(response.success).toBe(true);
    expect(response.message_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); // UUID format
    expect(response.puid).toMatch(/^G3I.{13}$/); // G3I + 13 chars
  });

  test('should validate SGD currency in PACS messages', async () => {
    // Test Singapore-specific validations
  });
});
```

## Configuration

### Environment Variables
```bash
# Cloud Spanner Configuration
SPANNER_PROJECT_ID=gpp-g3-sg-local
SPANNER_INSTANCE_ID=sg-test-instance
SPANNER_DATABASE_ID=safe-str-db
SPANNER_EMULATOR_HOST=localhost:9010

# gRPC Configuration (no HTTP)
GRPC_PORT=50051
ENRICHMENT_SERVICE_URL=localhost:50052

# Service Configuration
SERVICE_NAME=fast-requesthandler-service
LOG_LEVEL=info
COUNTRY=SG
DEFAULT_CURRENCY=SGD
TIMEZONE=Asia/Singapore
```

## Singapore Market Specific Features

### Currency Validation
- Default currency: SGD
- Validate amounts according to Singapore monetary format
- Support for cents precision (2 decimal places)

### Country Code Validation
- Primary country: SG
- Validate postal addresses for Singapore format
- Support Singapore postal codes (6 digits)

### Timezone Handling
- Default timezone: Asia/Singapore (UTC+8)
- Handle timestamp conversions properly

### Business Rules
- Validate Singapore bank account number formats
- Support Singapore-specific payment schemes
- Handle Singapore regulatory requirements

## Updated Success Criteria

- [ ] All PACS message types (008, 007, 003) successfully processed for Singapore market
- [ ] 100% schema validation coverage with Singapore-specific rules
- [ ] Sub-500ms average processing time
- [ ] Zero data loss during processing with safe_str table
- [ ] Comprehensive test coverage (>90%)
- [ ] Successful integration with fast-enrichment-service
- [ ] SGD currency and SG country validation working correctly
- [ ] Both UUID and PUID tracking functional

## Timeline

**Total Duration**: 4 weeks
**Key Milestones**:
- Week 1: Remove REST endpoints, setup gRPC-only architecture, safe_str table
- Week 2: UUID/PUID generation, core message processing pipeline
- Week 3: Singapore market validations, inter-service communication
- Week 4: Performance optimization, comprehensive testing

This updated implementation plan focuses on a pure gRPC service tailored for the Singapore market with proper database schema and identifier management. 