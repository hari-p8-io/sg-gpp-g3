# Fast DDI Validation Service - Design Document

## Overview

The **Fast DDI Validation Service** is a gRPC-based microservice responsible for validating enriched PACS messages and publishing them to Kafka for downstream orchestration. It serves as the bridge between synchronous gRPC processing and asynchronous Kafka-based orchestration in the Singapore G3 Payment Platform.

### Key Responsibilities
- Validate enriched payment messages for Singapore market compliance
- Perform XSD schema validation for PACS messages
- Currency validation (SGD-specific rules)
- Country validation (Singapore market compliance)
- Convert XML to JSON format for downstream processing
- Publish validated messages to Kafka for orchestration

### Service Details
- **Service Type**: gRPC Service
- **Port**: 50053
- **Package**: `gpp.g3.ddivalidation`
- **Technology Stack**: TypeScript, gRPC, Kafka
- **Environment**: Singapore G3 Payment Platform

---

## Sequence Diagram

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────┐    ┌─────────────────────────┐
│ fast-inwd-processor     │    │ fast-ddi-validation     │    │ Kafka       │    │ fast-orchestrator       │
│ service                 │    │ service                 │    │ Broker      │    │ service                 │
└─────────────────────────┘    └─────────────────────────┘    └─────────────┘    └─────────────────────────┘
              │                              │                        │                        │
              │ ValidateEnrichedMessage()    │                        │                        │
              │─────────────────────────────>│                        │                        │
              │                              │                        │                        │
              │                              │ Extract & Validate     │                        │
              │                              │ ◄─┐                    │                        │
              │                              │   │ Parse XML          │                        │
              │                              │   │ Validate SGD       │                        │
              │                              │   │ Validate SG        │                        │
              │                              │   │ Convert to JSON    │                        │
              │                              │ ◄─┘                    │                        │
              │                              │                        │                        │
              │                              │ Publish validated msg  │                        │
              │                              │───────────────────────>│                        │
              │                              │                        │                        │
              │ ValidationResponse(success)  │                        │                        │
              │◄─────────────────────────────│                        │                        │
              │                              │                        │ Consume for orchestration
              │                              │                        │───────────────────────>│
```

---

## Class Diagram

```
┌─────────────────────────────────┐
│      ValidationHandler          │
│─────────────────────────────────│
│ - validationService            │
│─────────────────────────────────│
│ + validateEnrichedMessage()    │
│ + healthCheck()                │
│ + convertFromGrpc()            │
└─────────────────────────────────┘
                 │
                 │ uses
                 ▼
┌─────────────────────────────────┐
│     DDIValidationService        │
│─────────────────────────────────│
│ + expectedCurrency: string     │
│ + expectedCountry: string      │
│ + isTestMode: boolean          │
│─────────────────────────────────│
│ + validateEnrichedMessage()    │
│ + performValidations()         │
│ + validateCurrency()           │
│ + validateCountry()            │
│ + publishToKafka()            │
└─────────────────────────────────┘
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌─────────────────┐ ┌─────────────────┐
│   KafkaClient   │ │   XMLParser     │
│─────────────────│ │─────────────────│
│ - producer      │ │                 │
│─────────────────│ │─────────────────│
│ + publish()     │ │ + parseXML()    │
│ + connect()     │ │ + convertJSON() │
│ + healthCheck() │ │ + extractFields()│
└─────────────────┘ └─────────────────┘
```

---

## Request and Response Formats

### gRPC Service Definition

```protobuf
syntax = "proto3";

package gpp.g3.ddivalidation;

service DDIValidationService {
  rpc ValidateEnrichedMessage(ValidateEnrichedMessageRequest) returns (ValidateEnrichedMessageResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

### ValidateEnrichedMessageRequest

```protobuf
message ValidateEnrichedMessageRequest {
  string message_id = 1;                    // UUID for tracking
  string puid = 2;                         // G3I identifier  
  string message_type = 3;                 // PACS008, PACS007, PACS003
  string enriched_xml_payload = 4;         // Enriched XML from processor
  EnrichmentData enrichment_data = 5;      // Account enrichment data
  int64 timestamp = 6;                     // Processing timestamp
  map<string, string> metadata = 7;       // Additional context
}
```

### ValidateEnrichedMessageResponse

```protobuf
message ValidateEnrichedMessageResponse {
  string message_id = 1;                   // Echo back UUID
  string puid = 2;                         // Echo back G3I identifier
  bool success = 3;                        // Validation success flag
  string error_message = 4;                // Error details if failed
  ValidationResult validation_result = 5;   // Detailed validation results
  string json_payload = 6;                 // Converted JSON payload
  bool kafka_published = 7;                // Kafka publishing status
  int64 processed_at = 8;                  // Processing completion time
  string next_service = 9;                 // Next service identifier
}
```

### ValidationResult

```protobuf
message ValidationResult {
  bool is_valid = 1;                       // Overall validation status
  repeated ValidationError errors = 2;      // List of validation errors
  CurrencyValidation currency_validation = 3; // Currency validation details
  CountryValidation country_validation = 4;   // Country validation details
  map<string, string> validation_metadata = 5; // Additional validation data
}
```

### EnrichmentData

```protobuf
message EnrichmentData {
  string received_acct_id = 1;             // Original account ID
  int32 lookup_status_code = 2;            // Lookup status (200=success)
  string lookup_status_desc = 3;           // Status description
  string normalized_acct_id = 4;           // Normalized account ID
  string matched_acct_id = 5;              // Matched account ID
  string partial_match = 6;                // Partial match flag (Y/N)
  string is_physical = 7;                  // Physical account flag (Y/N)
  PhysicalAcctInfo physical_acct_info = 8; // Account details
  string auth_method = 9;                  // Authentication method
}
```

---

## Business Rules and Validation Logic

### Singapore Market Validation Rules

| Rule Type | Validation Logic | Expected Value |
|-----------|------------------|----------------|
| **Currency** | Must be SGD for Singapore market | `SGD` |
| **Country** | Must be SG for local processing | `SG` |
| **Account Format** | Validates account ID formats | Various patterns |
| **Amount** | Validates transaction amounts and limits | Positive numbers |
| **Enrichment Data** | Validates completeness of enrichment | Required fields present |

### Validation Error Codes

| Error Code | Description | Severity |
|------------|-------------|----------|
| `INVALID_CURRENCY` | Non-SGD currency detected | ERROR |
| `INVALID_COUNTRY` | Non-SG country detected | ERROR |
| `MISSING_ENRICHMENT` | Required enrichment data missing | ERROR |
| `INVALID_XML_STRUCTURE` | Malformed XML structure | ERROR |
| `VALIDATION_ERROR` | General validation failure | ERROR |

---

## Configuration

### Environment Variables

```bash
# gRPC Configuration
GRPC_PORT=50053
SERVICE_NAME=fast-ddi-validation-service

# Market Configuration  
EXPECTED_CURRENCY=SGD
EXPECTED_COUNTRY=SG
TIMEZONE=Asia/Singapore

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=validated-messages
KAFKA_CLIENT_ID=fast-ddi-validation-service

# Processing Configuration
VALIDATION_TIMEOUT_MS=5000
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=1000

# Test Configuration
USE_TEST_MODE=false
ENVIRONMENT=development
```

---

## Database Schema

**Note**: This service does not maintain persistent data storage. It operates as a stateless validation and transformation service.

### Kafka Topic Schema

#### Topic: `validated-messages`

```json
{
  "messageId": "string",
  "puid": "string", 
  "messageType": "string",
  "jsonPayload": {
    "messageId": "string",
    "puid": "string",
    "messageType": "string",
    "enrichedXmlPayload": "string",
    "enrichmentData": "object",
    "extractedFields": {
      "cdtrAcct": "string",
      "amount": "string", 
      "currency": "string",
      "country": "string"
    },
    "processedAt": "string",
    "sourceService": "fast-ddi-validation-service"
  },
  "enrichmentData": "object",
  "validationResult": "object",
  "timestamp": "number"
}
```

---

## Service Integration

### Upstream Services
- **fast-inwd-processor-service** (Port 50052): Provides enriched messages for validation

### Downstream Services  
- **fast-orchestrator-service** (Port 3004): Consumes validated messages via Kafka

### Message Flow
```
fast-inwd-processor-service (PACS.003)
    ↓ (gRPC ValidateEnrichedMessage)
fast-ddi-validation-service
    ↓ (Kafka: validated-messages)
fast-orchestrator-service
```

---

## Error Handling

### Error Response Structure

```json
{
  "messageId": "uuid",
  "puid": "G3I123456789", 
  "success": false,
  "errorMessage": "Singapore market validation failed",
  "validationResult": {
    "isValid": false,
    "errors": [
      {
        "field": "currency",
        "errorCode": "INVALID_CURRENCY", 
        "errorMessage": "Invalid currency: USD, expected SGD",
        "severity": "ERROR"
      }
    ],
    "currencyValidation": {
      "isValid": false,
      "expectedCurrency": "SGD",
      "validationMessage": "Currency validation failed"
    },
    "countryValidation": {
      "isValid": false, 
      "expectedCountry": "SG",
      "validationMessage": "Country validation failed"
    }
  },
  "kafkaPublished": false,
  "processedAt": 1640995200000
}
```

---

## Performance Characteristics

### Service Performance Metrics
- **Average Response Time**: < 300ms for validation processing
- **Throughput**: 1000+ messages per second
- **Success Rate**: 99.9% for valid Singapore messages
- **Kafka Publishing**: < 100ms additional latency

### Resource Requirements
- **CPU**: Low to moderate (validation logic)
- **Memory**: 512MB - 1GB (XML parsing and transformation)
- **Network**: High (Kafka publishing)
- **Storage**: Minimal (stateless service)

---

## Monitoring and Health Checks

### Health Check Endpoint
```protobuf
rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
```

### Health Check Response
```json
{
  "status": "SERVING", // SERVING, NOT_SERVING, UNKNOWN
  "message": "Validation service is healthy",
  "timestamp": 1640995200000
}
```

### Monitoring Metrics
- Validation success/failure rates
- Processing latency per message type
- Kafka publishing success rates
- Error distribution by validation rule
- Service uptime and availability

---

## Security Considerations

### Data Protection
- No sensitive data persistence
- Secure gRPC communication
- Kafka message encryption in transit
- Input validation and sanitization

### Access Control
- Service-to-service authentication
- Network-level security (VPC/firewall rules)
- Role-based access for monitoring

---

## Deployment Notes

### Dependencies
- Kafka cluster availability
- Network connectivity to orchestrator service
- gRPC port 50053 accessibility

### Scaling Considerations
- Horizontal scaling supported (stateless)
- Kafka partitioning for load distribution
- Load balancing across service instances

### Configuration Management
- Environment-specific configuration
- Feature flags for test mode
- Market-specific validation rules 