# Fast Inward Processor Service - Design Document

## Overview

The **Fast Inward Processor Service** serves as the central orchestration hub for the Singapore G3 Payment Platform, coordinating account lookup, reference data retrieval, and validation services. It handles enriched PACS messages and implements intelligent routing based on message types and processing requirements.

**Note**: This service now receives requests directly from external clients (the requesthandler service has been removed) and generates PACS.002 responses for all processed messages.

### Key Responsibilities
- **Central orchestration** for account lookup, reference data, and validation services
- **Direct client integration** - receives requests from external systems
- **Intelligent routing** based on message types (PACS.003→validation, PACS.008/007→direct Kafka)
- **PACS.002 response generation** for all message types and processing scenarios
- **Service coordination** with fast-accountlookup-service and fast-referencedata-service
- **Enhanced validation orchestration** including mandate lookup for Direct Debit Instructions

### Service Details
- **Service Type**: gRPC Service
- **Port**: 50052
- **Package**: `gpp.g3.inwdprocessor`
- **Technology Stack**: TypeScript, gRPC, Kafka
- **Clients**: External payment systems (direct integration)
- **Dependencies**: fast-accountlookup-service, fast-referencedata-service, fast-ddi-validation-service, **fast-mandatelookup-service** (via validation)

---

## Enhanced Sequence Diagram with Mandate Lookup

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────┐
│ External Client     │  │ fast-inwd-processor │  │ fast-accountlookup  │  │ fast-referencedata  │  │ fast-ddi-validation │  │ fast-mandatelookup  │  │ Kafka       │
│ System              │  │ service             │  │ service             │  │ service             │  │ service             │  │ service             │  │ Broker      │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────┘
          │                        │                        │                        │                        │                        │                        │
          │ ProcessInwardMessage() │                        │                        │                        │                        │                        │
          │──────────────────────→ │                        │                        │                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ LookupAccount()        │                        │                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ AccountLookupResponse  │                        │                        │                        │                        │
          │                        │←──────────────────────│                        │                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ GetReferenceData()     │                        │                        │                        │                        │
          │                        │──────────────────────────────────────────────→ │                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ ReferenceDataResponse  │                        │                        │                        │                        │
          │                        │←──────────────────────────────────────────────│                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ [Route Decision: PACS.003 → Validation]       │                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ ValidateEnrichedMessage()                      │                        │                        │                        │
          │                        │──────────────────────────────────────────────────────────────────────→ │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │                        │                        │                        │ [For PACS.003 DDI]    │                        │
          │                        │                        │                        │                        │ LookupMandate()        │                        │
          │                        │                        │                        │                        │──────────────────────→ │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │                        │                        │                        │ MandateLookupResponse  │                        │
          │                        │                        │                        │                        │←──────────────────────│                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │                        │                        │                        │ [Validation continues] │                        │
          │                        │                        │                        │                        │ Publish to Kafka       │                        │
          │                        │                        │                        │                        │──────────────────────────────────────────────→ │
          │                        │                        │                        │                        │                        │                        │
          │                        │ ValidationResponse                             │                        │                        │                        │
          │                        │←──────────────────────────────────────────────────────────────────────│                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ Generate PACS.002      │                        │                        │                        │                        │
          │                        │ ◄─┐                    │                        │                        │                        │                        │
          │                        │   │ Success/Failure    │                        │                        │                        │                        │
          │                        │   │ Based on validation│                        │                        │                        │                        │
          │                        │   │ & mandate result   │                        │                        │                        │                        │
          │                        │ ◄─┘                    │                        │                        │                        │                        │
          │                        │                        │                        │                        │                        │                        │
          │                        │ Publish PACS.002       │                        │                        │                        │                        │
          │                        │──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────→ │
          │                        │                        │                        │                        │                        │                        │
          │ ProcessingResponse     │                        │                        │                        │                        │                        │
          │←──────────────────────│                        │                        │                        │                        │                        │
          │ (includes PACS.002     │                        │                        │                        │                        │                        │
          │  generation status     │                        │                        │                        │                        │                        │
          │  & mandate validation) │                        │                        │                        │                        │                        │
```

**Enhanced Flow Notes:**
- For **PACS.003 (DDI)**: Validation service calls mandate lookup service to verify mandate validity
- **Mandate validation** results affect PACS.002 response generation (success/failure status)
- **PACS.008/007**: Direct routing to Kafka (no mandate validation required)
- **PACS.002 responses** include mandate validation status for DDI transactions

---

## Updated Service Response

### Enhanced ProcessingResponse

```json
{
  "messageId": "G3I_20250116_001234",
  "puid": "G3I_PACS003_20250116_001234", 
  "success": true,
  "processingResult": {
    "enrichmentCompleted": true,
    "validationCompleted": true,
    "mandateValidated": true,
    "routingDecision": "VALIDATION_SERVICE",
    "nextService": "fast-orchestrator-service"
  },
  "enrichmentData": {
    "accountLookupResult": {
      "accountSystem": "VAM",
      "accountValid": true
    },
    "referenceDataResult": {
      "authenticationMethod": "GROUPLIMIT", 
      "processingInstructions": {...}
    },
    "validationResult": {
      "validationSuccess": true,
      "mandateValidation": {
        "mandateRequired": true,
        "mandateValid": true,
        "mandateReference": "MND-SG-20250116-001234",
        "mandateStatus": "ACTIVE"
      }
    }
  },
  "pacsResponseGenerated": true,
  "pacsResponseStatus": "ACSC",
  "pacsResponsePublished": true,
  "kafkaPublished": true,
  "processedAt": "2025-01-16T12:34:56Z",
  "processingTimeMs": 245
}
```

---

## Updated Error Handling

### Enhanced Error Categories

| Error Type | Includes Mandate | Description | PACS.002 Status |
|------------|------------------|-------------|-----------------|
| **Account Lookup Failed** | N/A | Invalid or missing account | RJCT |
| **Reference Data Failed** | N/A | Authentication method unavailable | RJCT |
| **Validation Failed** | No | Currency/Country/XML validation failure | RJCT |
| **🆕 Mandate Invalid** | Yes | DDI mandate validation failed | RJCT |
| **🆕 Mandate Expired** | Yes | DDI mandate has expired | RJCT |
| **🆕 Mandate Service Error** | Yes | Mandate lookup service unavailable | RJCT |
| **Kafka Publishing Failed** | Varies | Downstream publishing failure | RJCT |
| **Technical Error** | Varies | Internal processing error | RJCT |

### Enhanced Error Response Example

```json
{
  "messageId": "G3I_20250116_001235",
  "puid": "G3I_PACS003_20250116_001235",
  "success": false,
  "errorMessage": "Mandate validation failed: Mandate has expired",
  "errorCode": "MANDATE_EXPIRED",
  "processingResult": {
    "enrichmentCompleted": true,
    "validationCompleted": false,
    "mandateValidated": false,
    "routingDecision": "VALIDATION_SERVICE",
    "validationErrors": [
      "MND002: MANDATE_EXPIRED",
      "Mandate expired on 2024-11-30"
    ]
  },
  "pacsResponseGenerated": true,
  "pacsResponseStatus": "RJCT",
  "pacsResponsePublished": true,
  "kafkaPublished": false,
  "processedAt": "2025-01-16T12:34:56Z",
  "processingTimeMs": 180
}
```

---

## Updated Environment Variables

```bash
# gRPC Server
GRPC_PORT=50052

# Service Dependencies
ACCOUNT_LOOKUP_SERVICE_URL=localhost:50059
REFERENCE_DATA_SERVICE_URL=localhost:50060
DDI_VALIDATION_SERVICE_URL=localhost:50053

# NEW: Mandate validation configuration (inherited via validation service)
MANDATE_VALIDATION_ENABLED=true
ENABLE_MANDATE_LOGGING=true

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC_VALIDATED_MESSAGES=validated-messages
KAFKA_TOPIC_DIRECT_MESSAGES=direct-processing-messages
KAFKA_TOPIC_PACS_RESPONSES=pacs-response-messages

# PACS.002 Configuration
GENERATE_PACS002_RESPONSES=true
PACS002_SUCCESS_CODE=ACSC
PACS002_FAILURE_CODE=RJCT

# Processing Settings
PROCESSING_TIMEOUT_MS=10000
MAX_RETRY_ATTEMPTS=3
ENABLE_INTELLIGENT_ROUTING=true
ROUTE_PACS003_TO_VALIDATION=true
ROUTE_PACS008_DIRECT=true
ROUTE_PACS007_DIRECT=true
```

---

## Updated Performance Characteristics

### Processing Metrics (with Mandate Lookup)
- **Average Response Time**: 300-450ms (including mandate validation for DDI)
- **Account Lookup Time**: ~50-100ms
- **Reference Data Time**: ~50-100ms  
- **Validation Time (DDI)**: ~200-350ms (including mandate lookup ~100-150ms)
- **Validation Time (Non-DDI)**: ~100-200ms (no mandate lookup)
- **PACS.002 Generation**: ~30-50ms
- **Kafka Publishing**: ~30ms average
- **Throughput**: 600+ messages per second (mixed message types)
- **DDI-Specific Throughput**: 400+ messages per second (with mandate validation)

### SLA Requirements
- **Availability**: 99.9% uptime
- **Response Time**: 95th percentile < 600ms (including mandate lookup)
- **Error Rate**: < 0.1% for valid requests
- **Mandate Validation Success Rate**: > 99.5% (for DDI transactions)
- **PACS.002 Generation Success Rate**: > 99.9%

---

## Updated Health Check Implementation

```typescript
async healthCheck(): Promise<HealthCheckResponse> {
  const dependencies = await Promise.allSettled([
    this.accountLookupClient.healthCheck(),
    this.referenceDataClient.healthCheck(),
    this.validationClient.healthCheck(), // Now includes mandate lookup health
    this.responseKafkaClient.healthCheck()
  ]);
  
  const overallHealth = dependencies.every(d => d.status === 'fulfilled');
  
  return {
    status: overallHealth ? 'SERVING' : 'NOT_SERVING',
    message: overallHealth ? 'All dependencies healthy' : 'Some dependencies unhealthy',
    timestamp: Date.now(),
    dependencies: {
      accountLookup: dependencies[0].status,
      referenceData: dependencies[1].status,
      validation: dependencies[2].status, // Includes mandate lookup via validation service
      responseKafka: dependencies[3].status
    }
  };
}
```

---

## Integration Testing Scenarios (Enhanced)

### Enhanced Test Scenarios

1. **PACS.008 (Non-DDI) - Standard Flow**
   - Message Type: PACS.008
   - Expected: Account lookup → Reference data → Direct Kafka (no validation/mandate)
   - PACS.002: Success with ACSC status

2. **PACS.003 (DDI) - Valid Mandate**
   - Message Type: PACS.003, Account: 123456781111 (valid mandate pattern)
   - Expected: Account lookup → Reference data → Validation → Mandate lookup (success) → Kafka
   - PACS.002: Success with ACSC status, mandate details included

3. **PACS.003 (DDI) - Expired Mandate**
   - Message Type: PACS.003, Account: 123456784444 (expired mandate pattern)
   - Expected: Account lookup → Reference data → Validation → Mandate lookup (expired) → Failure
   - PACS.002: Failure with RJCT status, mandate expiry reason

4. **PACS.003 (DDI) - No Mandate Found**
   - Message Type: PACS.003, Account: 123456785555 (no mandate pattern)
   - Expected: Account lookup → Reference data → Validation → Mandate lookup (not found) → Failure
   - PACS.002: Failure with RJCT status, mandate not found reason

5. **PACS.003 (DDI) - Mandate Service Unavailable**
   - Message Type: PACS.003, Mandate Service: Down
   - Expected: Account lookup → Reference data → Validation → Mandate lookup (service error) → Failure
   - PACS.002: Failure with RJCT status, technical error reason

### Enhanced Test Commands

```bash
# Test DDI with valid mandate
grpcurl -plaintext -d '{
  "message_id": "TEST_DDI_VALID",
  "puid": "G3I_TEST_DDI_001",
  "xml_payload": "<PACS003_DDI_XML>",
  "message_type": "PACS.003"
}' localhost:50052 gpp.g3.inwdprocessor.InwdProcessorService/ProcessInwardMessage

# Test DDI with expired mandate  
grpcurl -plaintext -d '{
  "message_id": "TEST_DDI_EXPIRED",
  "puid": "G3I_TEST_DDI_002",
  "xml_payload": "<PACS003_DDI_XML_WITH_EXPIRED_ACCOUNT>",
  "message_type": "PACS.003"
}' localhost:50052 gpp.g3.inwdprocessor.InwdProcessorService/ProcessInwardMessage

# Test non-DDI (should skip mandate validation)
grpcurl -plaintext -d '{
  "message_id": "TEST_NON_DDI",
  "puid": "G3I_TEST_008_001", 
  "xml_payload": "<PACS008_XML>",
  "message_type": "PACS.008"
}' localhost:50052 gpp.g3.inwdprocessor.InwdProcessorService/ProcessInwardMessage
```

---

## Summary of Mandate Integration

### 🆕 **Enhanced Capabilities**

1. **✅ Mandate-Aware Validation**: DDI messages now undergo mandate validation
2. **✅ Intelligent Routing**: Maintains efficient routing while adding mandate compliance
3. **✅ Enhanced PACS.002**: Response generation includes mandate validation status
4. **✅ Service Orchestration**: Coordinates mandate lookup via validation service
5. **✅ Error Handling**: Comprehensive mandate-specific error responses

### 📋 **Processing Flow Enhancement**

**DDI Messages (PACS.003):**
```
Client → Account Lookup → Reference Data → Validation → Mandate Lookup → PACS.002 → Response
```

**Non-DDI Messages (PACS.008/007):**
```
Client → Account Lookup → Reference Data → Direct Kafka → PACS.002 → Response
```

### 🎯 **Integration Benefits**

- **Regulatory Compliance**: Ensures mandate validation for Direct Debit Instructions
- **Service Efficiency**: Non-DDI messages bypass mandate validation for optimal performance
- **Comprehensive Responses**: PACS.002 responses include mandate validation status
- **Resilient Processing**: Graceful handling of mandate service availability
- **Enhanced Monitoring**: Complete audit trail including mandate validation results

The enhanced **Fast Inward Processor Service** now provides complete payment processing with mandate compliance for Direct Debit Instructions while maintaining efficient routing for other message types.