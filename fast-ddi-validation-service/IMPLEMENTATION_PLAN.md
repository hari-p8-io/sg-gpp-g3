# Fast Validation Service - PACS Message Implementation Plan

## Overview

This document outlines the implementation plan for the `fast-validation-service` to handle PACS message validation via gRPC endpoints, receiving enriched messages from `fast-enrichment-service`, performing Singapore market validation, converting XML to JSON, and publishing to Kafka for `fast-orchestrator-service`.

## Requirements Summary

- Accept enriched PACS messages from fast-enrichment-service via gRPC
- Validate currency is SGD and country is SG
- Perform comprehensive validation of enriched data
- Convert XML payload to JSON format with enrichment attributes
- Publish validated JSON to Kafka topic for fast-orchestrator-service
- Maintain status tracking and error propagation back to calling service
- Focus on Singapore market compliance validation

## Architecture Changes

### Current State
- HTTP REST API or basic service
- Simple request/response handling
- No validation logic

### Target State
- **gRPC Only**: Pure gRPC service for inter-service communication
- **Singapore Market Validation**: SGD currency and SG country validation
- **XML to JSON Conversion**: Transform enriched XML to structured JSON
- **Kafka Integration**: Publish validated messages to message queue
- **Status Management**: Track and propagate success/failure states
- **Enrichment Data Validation**: Validate all enrichment attributes

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0",
    "xml2js": "^0.6.0",
    "kafkajs": "^2.2.0",
    "uuid": "^9.0.0",
    "joi": "^17.9.0",
    "libxmljs2": "^0.32.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "grpc-tools": "^1.12.0",
    "@types/xml2js": "^0.4.0"
  }
}
```

## gRPC Service Definitions

### File: `proto/validation_service.proto`
```protobuf
syntax = "proto3";

package gpp.g3.validation;

service ValidationService {
  // Validate enriched PACS message and publish to Kafka
  rpc ValidatePacsMessage(ValidationRequest) returns (ValidationResponse);
  
  // Health check for the validation service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message ValidationRequest {
  string message_id = 1;                            // UUID from request handler
  string puid = 2;                                  // G3I identifier
  string message_type = 3;                          // PACS008, PACS007, PACS003
  string enriched_xml_payload = 4;                  // The enriched XML payload
  gpp.g3.enrichment.EnrichmentData enrichment_data = 5; // Enrichment data
  map<string, string> metadata = 6;                 // Additional context data
  int64 timestamp = 7;                              // Processing timestamp
}

message ValidationResponse {
  string message_id = 1;                  // Echo back the UUID
  string puid = 2;                        // Echo back the G3I identifier
  bool success = 3;                       // Whether validation was successful
  string error_message = 4;               // Error details if success = false
  string validated_payload = 5;           // The validated JSON payload
  ValidationResult validation_result = 6; // Detailed validation results
  int64 processed_at = 7;                 // When validation completed
  string next_service = 8;                // Next service (fast-orchestrator-service via Kafka)
  string kafka_topic = 9;                 // Kafka topic where message was published
}

message ValidationResult {
  bool currency_valid = 1;                // SGD validation result
  bool country_valid = 2;                 // SG validation result
  bool enrichment_valid = 3;              // Enrichment data validation
  bool xml_structure_valid = 4;           // XML structure validation
  repeated string validation_errors = 5;  // List of validation errors
  repeated string validation_warnings = 6; // List of validation warnings
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

### File: `proto/orchestrator_message.proto`
```protobuf
syntax = "proto3";

package gpp.g3.orchestrator;

// Message format for Kafka publication to fast-orchestrator-service
message ProcessingMessage {
  string message_id = 1;                            // UUID
  string puid = 2;                                  // G3I identifier
  string message_type = 3;                          // PACS message type
  string original_xml_payload = 4;                  // Original XML
  ProcessingData processing_data = 5;               // Combined processing data
  int64 created_at = 6;                            // Original creation time
  int64 validated_at = 7;                          // Validation completion time
  string source_service = 8;                       // fast-validation-service
}

message ProcessingData {
  // Original message data
  MessageData message_data = 1;
  
  // Enrichment data from fast-enrichment-service
  gpp.g3.enrichment.EnrichmentData enrichment_data = 2;
  
  // Validation results
  gpp.g3.validation.ValidationResult validation_result = 3;
}

message MessageData {
  string debtor_account = 1;                       // Extracted from XML
  string creditor_account = 2;                     // Extracted from XML
  string amount = 3;                               // Transaction amount
  string currency = 4;                             // Currency code
  string country = 5;                              // Country code
  string payment_purpose = 6;                      // Payment purpose
  map<string, string> additional_fields = 7;       // Other extracted fields
}
```

## Implementation Phases

### Phase 1: Project Setup (Week 1)
- [ ] Create new gRPC-only service structure
- [ ] Set up protocol buffer definitions
- [ ] Configure dependencies and build tools
- [ ] Set up Kafka client and connection
- [ ] Generate TypeScript types from proto files

### Phase 2: Validation Engine Implementation (Week 1-2)
- [ ] Implement Singapore market validation (SGD currency, SG country)
- [ ] Create enrichment data validation logic
- [ ] Add XML structure validation
- [ ] Implement comprehensive validation rules
- [ ] Create validation result tracking

### Phase 3: XML to JSON Conversion (Week 2)
- [ ] Build XML parsing and extraction logic
- [ ] Implement JSON transformation engine
- [ ] Create message data extraction from XML
- [ ] Add enrichment data integration to JSON
- [ ] Implement error handling for conversion

### Phase 4: Kafka Integration (Week 2-3)
- [ ] Set up Kafka producer configuration
- [ ] Implement message publishing logic
- [ ] Add topic management and partitioning
- [ ] Create message serialization for orchestrator service
- [ ] Add error handling and retry mechanisms

### Phase 5: gRPC Service Integration (Week 3)
- [ ] Set up gRPC server for validation service
- [ ] Implement validation service handlers
- [ ] Add service-to-service communication
- [ ] Implement error propagation and status tracking
- [ ] Add timeout and circuit breaker patterns

### Phase 6: Testing & Documentation (Week 3-4)
- [ ] Create comprehensive test suite
- [ ] Add Kafka integration tests
- [ ] Performance testing and optimization
- [ ] Error scenario testing
- [ ] Documentation and API guides

## File Structure

```
fast-validation-service/
├── src/
│   ├── grpc/
│   │   ├── server.ts                       # gRPC server setup
│   │   └── handlers/
│   │       └── validationHandler.ts        # Main validation logic
│   ├── validation/
│   │   ├── singaporeValidator.ts           # Singapore market validation
│   │   ├── enrichmentValidator.ts          # Enrichment data validation
│   │   ├── xmlValidator.ts                 # XML structure validation
│   │   └── validationEngine.ts             # Main validation orchestrator
│   ├── conversion/
│   │   ├── xmlToJsonConverter.ts           # XML to JSON transformation
│   │   ├── messageExtractor.ts             # Extract data from XML
│   │   └── jsonBuilder.ts                  # Build final JSON structure
│   ├── kafka/
│   │   ├── producer.ts                     # Kafka producer setup
│   │   ├── messagePublisher.ts             # Publish messages to topics
│   │   └── topicManager.ts                 # Topic management
│   ├── utils/
│   │   ├── xmlParser.ts                    # XML parsing utilities
│   │   ├── logger.ts                       # Structured logging
│   │   └── errorHandler.ts                 # Error handling utilities
│   ├── types/
│   │   ├── validation.ts                   # Validation interfaces
│   │   └── conversion.ts                   # Conversion interfaces
│   └── index.ts                            # Main entry point
├── proto/
│   ├── validation_service.proto
│   └── orchestrator_message.proto
├── tests/
│   ├── unit/
│   │   ├── singaporeValidator.test.ts
│   │   ├── xmlToJsonConverter.test.ts
│   │   └── validationHandler.test.ts
│   ├── integration/
│   │   ├── kafkaIntegration.test.ts
│   │   └── endToEndValidation.test.ts
│   └── fixtures/
│       ├── enriched_pacs008_sg.xml
│       ├── enriched_pacs007_sg.xml
│       └── enriched_pacs003_sg.xml
└── config/
    ├── kafka.ts
    └── default.ts
```

## Singapore Market Validation Rules

### Currency Validation
```typescript
const validateCurrency = (xmlPayload: string): ValidationResult => {
  // Extract currency from IntrBkSttlmAmt and InstdAmt
  const currencyRegex = /<[^>]*Ccy="([^"]*)"[^>]*>/g;
  const currencies = [...xmlPayload.matchAll(currencyRegex)];
  
  return {
    valid: currencies.every(match => match[1] === 'SGD'),
    errors: currencies.filter(match => match[1] !== 'SGD')
      .map(match => `Invalid currency: ${match[1]}, expected SGD`)
  };
};
```

### Country Validation
```typescript
const validateCountry = (xmlPayload: string): ValidationResult => {
  // Extract country codes from PstlAdr sections
  const countryRegex = /<Ctry>([^<]*)<\/Ctry>/g;
  const countries = [...xmlPayload.matchAll(countryRegex)];
  
  return {
    valid: countries.every(match => match[1] === 'SG'),
    errors: countries.filter(match => match[1] !== 'SG')
      .map(match => `Invalid country: ${match[1]}, expected SG`)
  };
};
```

## XML to JSON Conversion

### Input XML Structure
```xml
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
      <Dbtr><Nm>Tan Wei Ming</Nm></Dbtr>
      <CdtrAcct><Id><Othr><Id>SPSERVICES001</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

### Output JSON Structure
```json
{
  "messageId": "uuid-here",
  "puid": "G3I1234567890123",
  "messageType": "PACS008",
  "processingData": {
    "messageData": {
      "debtorAccount": "123456789001",
      "creditorAccount": "SPSERVICES001",
      "amount": "1500.00",
      "currency": "SGD",
      "country": "SG",
      "paymentPurpose": "Payment for services rendered",
      "additionalFields": {
        "debtorName": "Tan Wei Ming",
        "creditorName": "SP Services Ltd",
        "instructionId": "INSTR-SG-001"
      }
    },
    "enrichmentData": {
      "receivedAcctId": "SPSERVICES001",
      "lookupStatusCode": 200,
      "lookupStatusDesc": "Success",
      "normalizedAcctId": "SPSERVICES001",
      "matchedAcctId": "SPSERVICES001",
      "partialMatch": "N",
      "isPhysical": "Y",
      "physicalAcctInfo": {
        "acctId": "SPSERVICES001",
        "acctSys": "MDZ",
        "acctGroup": "SGB",
        "country": "SG",
        "branchId": null,
        "acctAttributes": {
          "acctType": "Physical"
        },
        "acctOpsAttributes": {
          "isActive": "Yes",
          "acctStatus": "Active",
          "expiryDate": "31/12/2025",
          "restraints": {
            "stopAll": "N",
            "stopDebits": "N",
            "stopCredits": "N",
            "stopATM": "N",
            "stopEFTPos": "N",
            "stopUnknown": "N",
            "warnings": "None"
          }
        },
        "bicfi": "ANZBSG3MXXX",
        "currencyCode": "SGD"
      }
    },
    "validationResult": {
      "currencyValid": true,
      "countryValid": true,
      "enrichmentValid": true,
      "xmlStructureValid": true,
      "validationErrors": [],
      "validationWarnings": []
    }
  },
  "createdAt": 1702890600000,
  "validatedAt": 1702890605000,
  "sourceService": "fast-validation-service"
}
```

## Kafka Configuration

### Topic Configuration
```typescript
const kafkaConfig = {
  clientId: 'fast-validation-service',
  brokers: ['localhost:9092'],
  topics: {
    orchestrator: 'fast-orchestrator-input',
    deadLetter: 'fast-validation-errors'
  },
  producer: {
    maxInFlightRequests: 1,
    idempotent: true,
    transactionTimeout: 30000
  }
};
```

### Message Publishing
```typescript
const publishToOrchestrator = async (processingMessage: ProcessingMessage): Promise<void> => {
  await producer.send({
    topic: 'fast-orchestrator-input',
    messages: [{
      key: processingMessage.puid,
      value: JSON.stringify(processingMessage),
      headers: {
        messageType: processingMessage.messageType,
        sourceService: 'fast-validation-service',
        timestamp: Date.now().toString()
      }
    }]
  });
};
```

## Error Handling Strategy

### Validation Error Categories
1. **Currency Validation Errors**: Non-SGD currencies found
2. **Country Validation Errors**: Non-SG countries found
3. **Enrichment Data Errors**: Invalid or missing enrichment attributes
4. **XML Structure Errors**: Malformed or invalid XML structure
5. **Kafka Publishing Errors**: Failed to publish to message queue

### Error Response Format
```typescript
{
  success: false,
  errorMessage: "Singapore market validation failed",
  validationResult: {
    currencyValid: false,
    countryValid: false,
    enrichmentValid: true,
    xmlStructureValid: true,
    validationErrors: [
      "Invalid currency: USD, expected SGD",
      "Invalid country: US, expected SG"
    ],
    validationWarnings: []
  }
}
```

## Configuration

### Environment Variables
```bash
# gRPC Configuration
GRPC_PORT=50053

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=fast-validation-service
ORCHESTRATOR_TOPIC=fast-orchestrator-input
ERROR_TOPIC=fast-validation-errors

# Service Configuration
SERVICE_NAME=fast-validation-service
LOG_LEVEL=info
COUNTRY=SG
REQUIRED_CURRENCY=SGD
TIMEZONE=Asia/Singapore

# Validation Configuration
STRICT_VALIDATION=true
ALLOW_WARNINGS=true
MAX_VALIDATION_TIME_MS=3000
```

## Testing Strategy

### Unit Tests
- Singapore market validation (SGD/SG validation)
- XML to JSON conversion accuracy
- Enrichment data validation
- Kafka message publishing
- Error handling scenarios

### Integration Tests
- End-to-end validation flow
- Kafka integration with message consumption
- Service-to-service communication
- Error propagation testing

### Test Scenarios
```typescript
// Example test case
test('should validate Singapore PACS008 and publish to Kafka', async () => {
  const enrichedXML = loadTestXML('enriched_pacs008_sg.xml');
  const enrichmentData = createTestEnrichmentData();
  
  const response = await validationService.validateMessage({
    messageId: 'test-uuid',
    puid: 'G3ITEST123456789',
    messageType: 'PACS008',
    enrichedXmlPayload: enrichedXML,
    enrichmentData
  });
  
  expect(response.success).toBe(true);
  expect(response.validationResult.currencyValid).toBe(true);
  expect(response.validationResult.countryValid).toBe(true);
  expect(response.kafkaTopic).toBe('fast-orchestrator-input');
  
  // Verify Kafka message was published
  const publishedMessage = await getLastKafkaMessage('fast-orchestrator-input');
  expect(publishedMessage.puid).toBe('G3ITEST123456789');
});

test('should reject non-SGD currency', async () => {
  const usdXML = loadTestXML('pacs008_usd.xml'); // Contains USD instead of SGD
  
  const response = await validationService.validateMessage({
    messageType: 'PACS008',
    enrichedXmlPayload: usdXML,
    enrichmentData: createTestEnrichmentData()
  });
  
  expect(response.success).toBe(false);
  expect(response.validationResult.currencyValid).toBe(false);
  expect(response.validationResult.validationErrors)
    .toContain('Invalid currency: USD, expected SGD');
});
```

## Success Criteria

- [ ] Successfully validate all Singapore market requirements (SGD currency, SG country)
- [ ] Accurate XML to JSON conversion with enrichment data integration
- [ ] Successful Kafka message publishing to orchestrator topic
- [ ] Maintain sub-300ms average validation processing time
- [ ] Achieve 99.9% success rate for valid Singapore messages
- [ ] Proper error handling and status propagation
- [ ] Comprehensive validation coverage for all PACS message types
- [ ] Robust Kafka integration with error handling

## Timeline

**Total Duration**: 4 weeks
**Key Milestones**:
- Week 1: Project setup, validation engine, Singapore market rules
- Week 2: XML to JSON conversion, enrichment data integration
- Week 3: Kafka integration, message publishing, service integration
- Week 4: Testing, error handling, performance optimization, documentation

This implementation plan ensures the fast-validation-service properly validates Singapore market requirements, converts XML to structured JSON with enrichment data, and successfully publishes to Kafka for downstream processing by the orchestrator service. 