# Fast DDI Validation Service - Design Document

## Overview

The **Fast DDI Validation Service** is a gRPC-based microservice responsible for validating enriched PACS messages, performing mandate lookup for Direct Debit Instructions via REST API, and publishing them to Kafka for downstream orchestration. It serves as the bridge between synchronous gRPC processing and asynchronous Kafka-based orchestration in the Singapore G3 Payment Platform.

**Note**: PACS.002 response generation is now handled by the **fast-inwd-processor-service** which receives requests directly from external clients.

### Key Responsibilities
- Validate enriched payment messages for Singapore market compliance
- **Perform mandate lookup validation** for Direct Debit Instructions (DDI) via HTTP REST API
- Perform XSD schema validation for PACS messages
- Currency validation (SGD-specific rules)
- Country validation (Singapore market compliance)
- Convert XML to JSON format for downstream processing
- Publish validated messages to Kafka for orchestration

### Service Details
- **Service Type**: gRPC Service
- **Port**: 50053
- **Package**: `gpp.g3.ddivalidation`
- **Technology Stack**: TypeScript, gRPC, Kafka, Axios (HTTP client)
- **Environment**: Singapore G3 Payment Platform
- **Client**: fast-inwd-processor-service (direct requests)
- **Dependencies**: fast-mandatelookup-service (mandate validation via REST API)

---

## Sequence Diagram

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────┐    ┌─────────────────────────┐
│ fast-inwd-processor     │    │ fast-ddi-validation     │    │ fast-mandatelookup      │    │ Kafka       │    │ fast-orchestrator       │
│ service                 │    │ service                 │    │ service (REST API)      │    │ Broker      │    │ service                 │
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘    └─────────────┘    └─────────────────────────┘
              │                              │                              │                        │                        │
              │ ValidateEnrichedMessage()    │                              │                        │                        │
              │─────────────────────────────>│                              │                        │                        │
              │                              │                              │                        │                        │
              │                              │ Extract & Validate           │                        │                        │
              │                              │ ◄─┐                          │                        │                        │
              │                              │   │ Parse XML                │                        │                        │
              │                              │   │ Validate SGD             │                        │                        │
              │                              │   │ Validate SG              │                        │                        │
              │                              │ ◄─┘                          │                        │                        │
              │                              │                              │                        │                        │
              │                              │ POST /api/v1/mandates/lookup │                        │                        │
              │                              │─────────────────────────────>│                        │                        │
              │                              │ Content-Type: application/json│                        │                        │
              │                              │                              │                        │                        │
              │                              │ HTTP 200 JSON Response       │                        │                        │
              │                              │◄─────────────────────────────│                        │                        │
              │                              │                              │                        │                        │
              │                              │ Validate Enrichment Data     │                        │                        │
              │                              │ ◄─┐                          │                        │                        │
              │                              │   │ Check Mandate Result     │                        │                        │
              │                              │   │ Convert XML to JSON      │                        │                        │
              │                              │ ◄─┘                          │                        │                        │
              │                              │                              │                        │                        │
              │                              │ Publish validated msg        │                        │                        │
              │                              │─────────────────────────────────────────────────────>│                        │
              │                              │                              │                        │                        │
              │ ValidationResponse(success)  │                              │                        │                        │
              │◄─────────────────────────────│                              │                        │                        │
              │                              │                              │                        │ Consume for orchestration
              │                              │                              │                        │───────────────────────>│
              │                              │                              │                        │                        │
              │ [PACS.002 Response Generation│                              │                        │                        │
              │  handled by inwd-processor]  │                              │                        │                        │
```

**Note**: The fast-inwd-processor-service handles PACS.002 response generation based on the validation success/failure result from this service.

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
│ - mandateLookupClient          │
│─────────────────────────────────│
│ + validateEnrichedMessage()    │
│ + performValidations()         │
│ + validateMandate()            │
│ + validateCurrency()           │
│ + validateCountry()            │
│ + validateEnrichmentData()     │
│ + validateXMLStructure()       │
│ + publishToKafka()            │
│ + healthCheck()                │
└─────────────────────────────────┘
         ┌───────┼───────┐
         │       │       │
         ▼       ▼       ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   KafkaClient   │ │   XMLParser     │ │MandateLookupClnt│
│─────────────────│ │─────────────────│ │ (HTTP Client)   │
│ - producer      │ │                 │ │─────────────────│
│─────────────────│ │─────────────────│ │ - httpClient    │
│ + publish()     │ │ + parseXML()    │ │ - baseUrl       │
│ + connect()     │ │ + convertJSON() │ │─────────────────│
│ + healthCheck() │ │ + extractFields()│ │ + lookupMandate()│
└─────────────────┘ └─────────────────┘ │ + healthCheck() │
                                        │ + getServiceInfo()│
                                        │ + disconnect()  │
                                        └─────────────────┘
```

---

## Enhanced Validation Flow

### Validation Steps (Updated)

1. **Basic XML Validation**: Well-formedness and schema validation
2. **Market Validation**: Currency (SGD) and country (SG) validation
3. **🆕 Mandate Validation**: Direct Debit Instruction mandate lookup via HTTP REST API
4. **Enrichment Data Validation**: Validate account lookup and reference data
5. **JSON Conversion**: Convert XML to JSON for downstream processing
6. **Kafka Publishing**: Publish validated message to orchestration topic

### Mandate Integration Logic (Updated for REST)

```typescript
async validateMandate(request: ValidationRequest): Promise<MandateValidationResult> {
  // Extract mandate information from XML
  const mandateInfo = this.extractMandateInfo(request.xmlPayload);
  
  if (!mandateInfo.mandateId && request.messageType === 'PACS.003') {
    return {
      success: false,
      errorCode: 'MANDATE_ID_MISSING',
      errorMessage: 'Mandate ID is required for Direct Debit Instructions'
    };
  }

  // Skip mandate validation for non-DDI message types
  if (request.messageType !== 'PACS.003') {
    return {
      success: true,
      mandateRequired: false,
      message: 'Mandate validation skipped for non-DDI message type'
    };
  }

  // Call mandate lookup service via HTTP REST API
  const mandateLookupRequest = {
    messageId: request.messageId,
    puid: request.puid,
    messageType: request.messageType,
    xmlPayload: request.xmlPayload,
    debtorAccount: mandateInfo.debtorAccount,
    creditorAccount: mandateInfo.creditorAccount,
    mandateId: mandateInfo.mandateId,
    amount: mandateInfo.amount,
    currency: mandateInfo.currency,
    metadata: request.metadata
  };

  // HTTP POST to mandate lookup service
  const mandateResult = await this.mandateLookupClient.lookupMandate(mandateLookupRequest);
  
  if (!mandateResult.success) {
    return {
      success: false,
      errorCode: 'MANDATE_VALIDATION_FAILED',
      errorMessage: mandateResult.errorMessage,
      mandateReference: mandateResult.mandateReference,
      validationErrors: mandateResult.validationErrors
    };
  }

  // Validate mandate status
  if (!mandateResult.mandateStatus.isValid || !mandateResult.mandateStatus.isActive) {
    return {
      success: false,
      errorCode: 'MANDATE_INVALID',
      errorMessage: `Mandate is ${mandateResult.mandateStatus.statusCode}: ${mandateResult.mandateStatus.statusDescription}`,
      mandateReference: mandateResult.mandateReference
    };
  }

  return {
    success: true,
    mandateRequired: true,
    mandateReference: mandateResult.mandateReference,
    mandateDetails: mandateResult.mandateDetails,
    message: 'Mandate validation successful'
  };
}
```

---

## Request and Response Formats

### Enhanced gRPC Service Definition

```protobuf
service DDIValidationService {
  rpc ValidateEnrichedMessage(ValidateEnrichedMessageRequest) returns (ValidationResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message ValidateEnrichedMessageRequest {
  string message_id = 1;
  string puid = 2;
  string xml_payload = 3;
  EnrichmentData enrichment_data = 4;
  string message_type = 5;
  map<string, string> metadata = 6;
}

message ValidationResponse {
  bool success = 1;
  repeated string errors = 2;
  string processed_at = 3;
  bool kafka_published = 4;
  MandateValidationResult mandate_validation = 5;  // NEW: Mandate validation result
}

message MandateValidationResult {
  bool mandate_required = 1;
  bool mandate_valid = 2;
  string mandate_reference = 3;
  string mandate_status = 4;
  repeated string mandate_errors = 5;
}
```

### HTTP Mandate Lookup Integration

#### Request to Mandate Service
```http
POST http://localhost:3005/api/v1/mandates/lookup
Content-Type: application/json

{
  "messageId": "G3I_20250116_001234",
  "puid": "G3I_PACS003_20250116_001234",
  "messageType": "PACS.003",
  "xmlPayload": "<xml>...</xml>",
  "debtorAccount": "123456789012",
  "creditorAccount": "987654321098",
  "mandateId": "DDI-123456789",
  "amount": "1000.00",
  "currency": "SGD",
  "metadata": {
    "source": "fast-ddi-validation-service"
  }
}
```

#### Response from Mandate Service
```json
{
  "success": true,
  "mandateReference": "MND-SG-20250116-001234",
  "mandateStatus": {
    "isValid": true,
    "isActive": true,
    "isExpired": false,
    "statusCode": "ACTIVE",
    "statusDescription": "Mandate is valid and active"
  },
  "mandateDetails": {
    "mandateId": "DDI-123456789",
    "debtorAccount": "123456789012",
    "creditorAccount": "987654321098",
    "creationDate": "2024-12-01",
    "expiryDate": "2025-12-01",
    "maxAmount": "5000.00",
    "frequency": "MONTHLY",
    "mandateType": "CONSUMER_DDI"
  },
  "validationErrors": [],
  "errorMessage": "",
  "processedAt": 1705420800000
}
```

### Enhanced Response Examples

**Successful Validation with Mandate:**
```json
{
  "success": true,
  "errors": [],
  "processed_at": "2025-01-16T12:34:56Z",
  "kafka_published": true,
  "mandate_validation": {
    "mandate_required": true,
    "mandate_valid": true,
    "mandate_reference": "MND-SG-20250116-001234",
    "mandate_status": "ACTIVE",
    "mandate_errors": []
  }
}
```

**Failed Validation due to Invalid Mandate:**
```json
{
  "success": false,
  "errors": [
    "MANDATE_VALIDATION_FAILED: Mandate has expired",
    "Mandate expired on 2024-11-30"
  ],
  "processed_at": "2025-01-16T12:34:56Z",
  "kafka_published": false,
  "mandate_validation": {
    "mandate_required": true,
    "mandate_valid": false,
    "mandate_reference": "MND-SG-20240801-005678",
    "mandate_status": "EXPIRED",
    "mandate_errors": [
      "MND002: MANDATE_EXPIRED",
      "Mandate expired on 2024-11-30"
    ]
  }
}
```

---

## Environment Variables (Updated)

```bash
# gRPC Server
GRPC_PORT=50053

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC_VALIDATED_MESSAGES=validated-messages

# Validation Settings
EXPECTED_CURRENCY=SGD
EXPECTED_COUNTRY=SG
TEST_MODE=false

# Mandate Lookup Service (UPDATED: HTTP instead of gRPC)
MANDATE_LOOKUP_SERVICE_URL=http://localhost:3005
MANDATE_LOOKUP_TIMEOUT_MS=3000
MANDATE_VALIDATION_ENABLED=true
SKIP_MANDATE_FOR_NON_DDI=true

# Processing Settings
VALIDATION_TIMEOUT_MS=5000
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=1000
```

---

## Enhanced Error Handling

### Error Categories (Updated)

| Error Type | Error Code | Mandate Related | Description |
|------------|------------|----------------|-------------|
| **Currency Validation** | `CURRENCY_ERROR` | No | Invalid currency (non-SGD) |
| **Country Validation** | `COUNTRY_ERROR` | No | Invalid country (non-SG) |
| **XML Structure** | `XML_ERROR` | No | Invalid XML structure |
| **🆕 Mandate Missing** | `MANDATE_ID_MISSING` | Yes | Mandate ID required for DDI |
| **🆕 Mandate Invalid** | `MANDATE_INVALID` | Yes | Mandate not valid or active |
| **🆕 Mandate Expired** | `MANDATE_EXPIRED` | Yes | Mandate has expired |
| **🆕 Mandate Service Error** | `MANDATE_SERVICE_ERROR` | Yes | Mandate lookup service unavailable (HTTP error) |
| **Enrichment Validation** | `ENRICHMENT_ERROR` | No | Invalid enrichment data |
| **Kafka Publishing** | `KAFKA_ERROR` | No | Publishing failed |

### Enhanced Error Response Flow

```
Error Detected → Categorize Error → Include Mandate Info → Return Detailed Response
```

---

## Performance Characteristics (Updated)

### Processing Metrics
- **Average Response Time**: 200-350ms (including HTTP mandate lookup)
- **Mandate Lookup Time**: ~100-150ms additional overhead (HTTP request)
- **Validation Time**: ~50-100ms (currency, country, XML)
- **Kafka Publishing Time**: ~30ms average
- **Throughput**: 800+ messages per second (with mandate validation)

### SLA Requirements
- **Availability**: 99.9% uptime
- **Response Time**: 95th percentile < 500ms (including HTTP mandate lookup)
- **Error Rate**: < 0.1% for valid requests
- **Mandate Lookup Success Rate**: > 99.5%

---

## Health Check Implementation (Enhanced)

```typescript
async healthCheck(): Promise<HealthCheckResponse> {
  const dependencies = await Promise.allSettled([
    this.kafkaClient.healthCheck(),
    this.mandateLookupClient.healthCheck()  // NEW: HTTP health check
  ]);
  
  const overallHealth = dependencies.every(d => d.status === 'fulfilled');
  
  return {
    status: overallHealth ? 'SERVING' : 'NOT_SERVING',
    message: overallHealth ? 'All dependencies healthy' : 'Some dependencies unhealthy',
    timestamp: Date.now(),
    dependencies: {
      kafka: dependencies[0].status,
      mandateLookup: dependencies[1].status  // NEW: HTTP mandate lookup status
    }
  };
}
```

---

## Integration Testing

### Test Scenarios (Enhanced)

1. **PACS.008 (Non-DDI) - Skip Mandate**
   - Message Type: PACS.008
   - Expected: Validation succeeds, mandate check skipped

2. **PACS.003 (DDI) - Valid Mandate**
   - Message Type: PACS.003
   - Account: 123456781111 (valid mandate pattern)
   - Expected: HTTP request to mandate service, validation succeeds with mandate confirmation

3. **PACS.003 (DDI) - Expired Mandate**
   - Message Type: PACS.003
   - Account: 123456784444 (expired mandate pattern)
   - Expected: HTTP request to mandate service, validation fails with mandate expiry error

4. **PACS.003 (DDI) - No Mandate Found**
   - Message Type: PACS.003
   - Account: 123456785555 (no mandate pattern)
   - Expected: HTTP request to mandate service, validation fails with mandate not found error

5. **PACS.003 (DDI) - Mandate Service Unavailable**
   - Message Type: PACS.003
   - Mandate Service: Down (HTTP 503)
   - Expected: HTTP timeout/error, validation fails with service unavailable error

### Test Commands

```bash
# Test DDI validation with valid mandate
grpcurl -plaintext -d '{
  "message_id": "TEST123",
  "puid": "G3I_TEST_001",
  "message_type": "PACS.003",
  "xml_payload": "<DDI_XML_WITH_MANDATE>",
  "enrichment_data": {...}
}' localhost:50053 gpp.g3.ddivalidation.DDIValidationService/ValidateEnrichedMessage

# Test mandate service health
curl -X GET http://localhost:3005/api/v1/health

# Test mandate lookup directly
curl -X POST http://localhost:3005/api/v1/mandates/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "TEST123",
    "puid": "G3I_TEST_001",
    "messageType": "PACS.003",
    "debtorAccount": "123456781111",
    "creditorAccount": "987654321098",
    "mandateId": "DDI-TEST-001",
    "amount": "1000.00",
    "currency": "SGD"
  }'
```

---

## Deployment Configuration (Updated)

### Docker Environment

```yaml
fast-ddi-validation:
  image: fast-ddi-validation-service:latest
  ports: ["50053:50053"]
  environment:
    - GRPC_PORT=50053
    - KAFKA_BROKERS=kafka:9092
    - KAFKA_TOPIC_VALIDATED_MESSAGES=validated-messages
    - EXPECTED_CURRENCY=SGD
    - EXPECTED_COUNTRY=SG
    - MANDATE_LOOKUP_SERVICE_URL=http://fast-mandatelookup:3005  # UPDATED: HTTP URL
    - MANDATE_LOOKUP_TIMEOUT_MS=3000                             # NEW
    - MANDATE_VALIDATION_ENABLED=true                            # NEW
    - SKIP_MANDATE_FOR_NON_DDI=true                             # NEW
    - TEST_MODE=false
  depends_on:
    - kafka
    - fast-mandatelookup  # NEW dependency
  healthcheck:
    test: ["CMD", "grpc_health_probe", "-addr=:50053"]
    interval: 30s
    timeout: 10s
    retries: 3

fast-mandatelookup:
  image: fast-mandatelookup-service:latest
  ports: ["3005:3005"]
  environment:
    - PORT=3005
    - USE_MOCK_MANDATES=true
    - MOCK_RESPONSE_DELAY_MS=100
    - DEFAULT_CURRENCY=SGD
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3005/api/v1/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

---

## Summary of Enhancements

### 🆕 **New Capabilities Added**

1. **✅ HTTP REST Integration**: Integration with fast-mandatelookup-service via HTTP REST API
2. **✅ DDI-Specific Validation**: Enhanced validation for Direct Debit Instructions
3. **✅ Mandate Status Tracking**: Comprehensive mandate validation results
4. **✅ Enhanced Error Handling**: Mandate-specific error codes and messages
5. **✅ Flexible Validation**: Skip mandate validation for non-DDI message types

### 📋 **Validation Flow Enhancement**

**Before:**
```
XML Validation → Currency/Country → Enrichment → Kafka
```

**After:**
```
XML Validation → Currency/Country → HTTP Mandate Lookup → Enrichment → Kafka
```

### 🎯 **Integration Benefits**

- **Platform Agnostic**: HTTP REST API accessible from any language/platform
- **Regulatory Compliance**: Ensures mandate validation for Direct Debit Instructions
- **Enhanced Security**: Verifies authorization for mandate-based payments
- **Flexible Processing**: Adapts validation based on message type
- **Comprehensive Reporting**: Detailed mandate validation results
- **Service Resilience**: Graceful handling of HTTP timeouts and errors

The enhanced **Fast DDI Validation Service** now provides complete validation including mandate compliance for Direct Debit Instructions via HTTP REST API, ensuring regulatory adherence and payment authorization before processing. 