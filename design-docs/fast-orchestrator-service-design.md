# Fast Orchestrator Service - Design Document

## Overview

The **Fast Orchestrator Service** is an HTTP Express.js service combined with Kafka consumer/producer capabilities that handles message routing and orchestration in the Singapore G3 Payment Platform. It consumes validated and enriched messages from Kafka topics, routes them based on account systems and authentication methods, and also handles PACS.002 response messages from the fast-inwd-processor-service.

### Key Responsibilities
- Consume messages from Kafka topics (validated-messages, enriched-messages, pacs-response-messages)
- Route messages based on account system (VAM/MDZ) and authentication method
- Integrate with downstream systems (VAM mediation, limit checks)
- **Process PACS.002 response messages** and forward to external systems
- Maintain orchestration audit trail in Cloud Spanner
- Provide HTTP APIs for monitoring and management
- Handle message transformation and delivery

### Service Details
- **Service Type**: HTTP Service + Kafka Consumer/Producer
- **Port**: 3004 (HTTP), Kafka Consumer
- **Technology Stack**: TypeScript, Express.js, Kafka, Cloud Spanner
- **Role**: Message routing, orchestration hub, and PACS.002 response handler

---

## Sequence Diagram

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│Kafka Topics │  │Orchestrator │  │Cloud Spanner│  │VAM/Mediation│  │External     │  │PACS Response│
│(Consumers)  │  │Service      │  │Database     │  │Services     │  │Systems      │  │Messages     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
       │                │                │                │                │                │
       │ Validated Msg  │                │                │                │                │
       │───────────────>│                │                │                │                │
       │                │ Store Process  │                │                │                │
       │                │───────────────>│                │                │                │
       │                │ Audit Record   │                │                │                │
       │                │                │                │                │                │
       │                │ Route Decision │                │                │                │
       │                │ ◄─┐            │                │                │                │
       │                │   │ Check Auth │                │                │                │
       │                │   │ Method     │                │                │                │
       │                │ ◄─┘            │                │                │                │
       │                │                │                │                │                │
       │                │ Send to VAM    │                │                │                │
       │                │───────────────────────────────>│                │                │
       │                │                │                │ VAM Response   │                │
       │                │◄───────────────────────────────│                │                │
       │                │                │                │                │                │
       │ Enriched Msg   │ Send to Limits │                │                │                │
       │───────────────>│───────────────────────────────────────────────>│                │
       │                │                │                │ Limit Response │                │
       │                │◄───────────────────────────────────────────────│                │
       │                │ Update Status  │                │                │                │
       │                │───────────────>│                │                │                │
       │                │                │                │                │                │
       │ PACS.002 Resp  │ Process Response Message        │                │                │
       │───────────────>│ ◄─┐            │                │                │                │
       │                │   │ Extract    │                │                │                │
       │                │   │ Response   │                │                │                │
       │                │ ◄─┘ Details    │                │                │                │
       │                │                │                │                │                │
       │                │ Forward PACS.002 Response       │                │                │
       │                │─────────────────────────────────────────────────>│                │
       │                │                │                │                │                │
       │                │ Update Response Status          │                │                │
       │                │───────────────>│                │                │                │
```

---

## Class Diagram

```
┌─────────────────────────────────┐
│      ExpressApplication         │
│─────────────────────────────────│
│ - port: number                 │
│ - orchestratorService          │
│─────────────────────────────────│
│ + start()                      │
│ + setupRoutes()                │
│ + healthCheck()                │
│ + getMetrics()                 │
└─────────────────────────────────┘
                 │
                 │ uses
                 ▼
┌─────────────────────────────────┐
│    OrchestratorService          │
│─────────────────────────────────│
│ - kafkaConsumer                │
│ - kafkaProducer                │
│ - spannerClient                │
│ - vatMediationClient           │
│ - limitCheckClient             │
│ - externalSystemClient         │
│─────────────────────────────────│
│ + processValidatedMessage()    │
│ + processEnrichedMessage()     │
│ + processPacs002Response()     │
│ + routeMessage()               │
│ + forwardResponseToExternal()  │
│ + storeAuditRecord()           │
│ + updateProcessingStatus()     │
└─────────────────────────────────┘
       │              │              │              │
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│KafkaConsumer│ │SpannerClient│ │VamMediation │ │ExternalSys  │
│─────────────│ │─────────────│ │Client       │ │Client       │
│ - topics[]  │ │ - database  │ │─────────────│ │─────────────│
│─────────────│ │─────────────│ │ - endpoint  │ │ - endpoints │
│ + consume() │ │ + insert()  │ │─────────────│ │─────────────│
│ + commit()  │ │ + update()  │ │ + sendVam() │ │ + sendPacs002()
│ + close()   │ │ + query()   │ │ + checkLimits()│ + sendStatus()
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Enhanced Message Routing Logic

### Routing Decision Table (Updated)

| Message Source | Auth Method | Account System | Routing Destination | PACS.002 Handling |
|---------------|-------------|----------------|--------------------|--------------------|
| validated-messages | GROUPLIMIT | VAM | VAM Mediation + Limit Check | Processed separately |
| validated-messages | GROUPLIMIT | MDZ | Limit Check Only | Processed separately |
| validated-messages | AFPTHENLIMIT | VAM/MDZ | Authentication First + Limits | Processed separately |
| validated-messages | AFPONLY | VAM/MDZ | Direct Processing | Processed separately |
| enriched-messages | GROUPLIMIT | VAM | VAM Mediation + Limit Check | Processed separately |
| enriched-messages | GROUPLIMIT | MDZ | Limit Check Only | Processed separately |
| enriched-messages | AFPTHENLIMIT | VAM/MDZ | Authentication First + Limits | Processed separately |
| enriched-messages | AFPONLY | VAM/MDZ | Direct Processing | Processed separately |
| **pacs-response-messages** | **N/A** | **N/A** | **External Systems** | **Forward to Requestor** |

### PACS.002 Response Processing

```typescript
async processPacs002Response(responseMessage: PACS002Message): Promise<void> {
  const { messageId, puid, status, originalMessageType, xmlPayload } = responseMessage;
  
  // Log response receipt
  logger.info('PACS.002 response received', {
    messageId,
    puid,
    status,
    originalMessageType
  });
  
  // Store response audit trail
  await this.storeResponseAuditRecord(responseMessage);
  
  // Determine external system endpoint based on original message routing
  const externalEndpoint = await this.getOriginalRequestorEndpoint(puid);
  
  if (externalEndpoint) {
    // Forward PACS.002 to original requestor
    await this.forwardResponseToExternal(responseMessage, externalEndpoint);
    
    // Update response status
    await this.updateResponseStatus(messageId, 'DELIVERED');
  } else {
    logger.error('No external endpoint found for PACS.002 response', { messageId, puid });
    await this.updateResponseStatus(messageId, 'DELIVERY_FAILED');
  }
}
```

---

## Kafka Configuration (Updated)

### Consumer Configuration

```javascript
const consumerConfig = {
  groupId: 'fast-orchestrator-group',
  topics: [
    'validated-messages', 
    'enriched-messages',
    'pacs-response-messages'  // NEW: PACS.002 response messages
  ],
  autoCommit: false,
  maxBytesPerPartition: 1048576,
  sessionTimeout: 30000,
  heartbeatInterval: 3000
};
```

### Topic Subscriptions (Updated)

| Topic | Message Source | Processing Flow | Purpose |
|-------|---------------|-----------------|---------|
| `validated-messages` | fast-ddi-validation-service | PACS.003 messages | Payment processing |
| `enriched-messages` | fast-inwd-processor-service | PACS.008/007 direct | Payment processing |
| `pacs-response-messages` | fast-inwd-processor-service | PACS.002 responses | Response delivery |

---

## Database Schema Updates (Cloud Spanner)

### Enhanced ProcessingSteps Table

```sql
CREATE TABLE ProcessingSteps (
  MessageId STRING(50) NOT NULL,
  Puid STRING(50) NOT NULL,
  MessageType STRING(20) NOT NULL,
  ProcessingStep STRING(50) NOT NULL,
  StepStatus STRING(20) NOT NULL,
  StepStartTime TIMESTAMP NOT NULL,
  StepEndTime TIMESTAMP,
  StepDuration INT64,
  StepDetails JSON,
  ErrorMessage STRING(1000),
  RetryCount INT64 DEFAULT 0,
  ResponseStatus STRING(20),        -- NEW: PACS.002 response status
  ResponseDeliveredAt TIMESTAMP,    -- NEW: Response delivery timestamp
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  UpdatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (MessageId, ProcessingStep, StepStartTime);
```

### New PACS002ResponseAudit Table

```sql
CREATE TABLE PACS002ResponseAudit (
  ResponseMessageId STRING(50) NOT NULL,
  OriginalMessageId STRING(50) NOT NULL,
  Puid STRING(50) NOT NULL,
  OriginalMessageType STRING(20) NOT NULL,
  ResponseStatus STRING(10) NOT NULL,
  ResponseXmlPayload STRING(MAX),
  ExternalEndpoint STRING(200),
  DeliveryStatus STRING(20) NOT NULL,
  DeliveryAttempts INT64 DEFAULT 0,
  ProcessingTimeMs INT64,
  ReceivedAt TIMESTAMP NOT NULL,
  DeliveredAt TIMESTAMP,
  ErrorMessage STRING(1000),
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  UpdatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (ResponseMessageId, ReceivedAt);
```

---

## Environment Variables (Updated)

```bash
# HTTP Server
HTTP_PORT=3004
NODE_ENV=production

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=fast-orchestrator-group
KAFKA_TOPIC_VALIDATED=validated-messages
KAFKA_TOPIC_ENRICHED=enriched-messages
KAFKA_TOPIC_PACS_RESPONSES=pacs-response-messages  # NEW

# Cloud Spanner
SPANNER_PROJECT_ID=gpp-g3-project
SPANNER_INSTANCE_ID=gpp-g3-instance
SPANNER_DATABASE_ID=orchestration-db

# Downstream Services
VAM_MEDIATION_ENDPOINT=https://vam-mediation.internal
LIMIT_CHECK_ENDPOINT=https://limit-check.internal
AUTHENTICATION_ENDPOINT=https://auth.internal

# External Systems (NEW)
EXTERNAL_SYSTEM_ENDPOINTS=https://bank-a.external,https://bank-b.external
RESPONSE_DELIVERY_TIMEOUT_MS=10000
RESPONSE_RETRY_ATTEMPTS=3

# Processing Settings
MAX_RETRY_ATTEMPTS=3
PROCESSING_TIMEOUT_MS=30000
BATCH_SIZE=100
```

---

## Enhanced Error Handling

### PACS.002 Response Processing Errors

| Error Type | Retry Strategy | Max Retries | Action |
|------------|---------------|-------------|--------|
| **External System Unavailable** | Exponential Backoff | 3 | Store for manual intervention |
| **Invalid Response Format** | No Retry | 0 | Log and mark as failed |
| **Endpoint Not Found** | Manual Intervention | 0 | Administrative review |
| **Delivery Timeout** | Linear Backoff | 2 | Retry with increased timeout |

### Response Delivery Flow

```typescript
async forwardResponseToExternal(responseMessage: PACS002Message, endpoint: string): Promise<boolean> {
  let attempt = 0;
  const maxAttempts = 3;
  
  while (attempt < maxAttempts) {
    try {
      const response = await this.externalSystemClient.sendPacs002(endpoint, responseMessage);
      
      if (response.success) {
        logger.info('PACS.002 response delivered successfully', {
          messageId: responseMessage.messageId,
          endpoint,
          attempt: attempt + 1
        });
        return true;
      }
      
      attempt++;
      if (attempt < maxAttempts) {
        await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
      
    } catch (error) {
      logger.error('PACS.002 response delivery failed', {
        messageId: responseMessage.messageId,
        endpoint,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      attempt++;
      if (attempt < maxAttempts) {
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  // All attempts failed
  logger.error('PACS.002 response delivery failed after all attempts', {
    messageId: responseMessage.messageId,
    endpoint,
    totalAttempts: maxAttempts
  });
  
  return false;
}
```

---

## Performance Characteristics (Updated)

### Enhanced Processing Metrics
- **Average Processing Time**: 200-500ms per message
- **PACS.002 Processing Time**: 50-150ms additional per response
- **Throughput**: 500+ messages per second (including responses)
- **Response Delivery Time**: 100-300ms to external systems
- **Concurrent Processing**: 50+ messages simultaneously
- **Memory Usage**: 1.5-2.5GB per instance

### SLA Requirements
- **Availability**: 99.9% uptime
- **Processing Latency**: 95th percentile < 1 second
- **Response Delivery**: 95th percentile < 500ms
- **Message Loss Rate**: < 0.01%
- **Response Delivery Success Rate**: > 99.5%

---

## Monitoring and Alerting (Enhanced)

### Key Metrics

- **Message Processing Rate**: Messages per second by topic
- **PACS.002 Response Rate**: Responses processed per second
- **Response Delivery Success Rate**: Percentage of successful external deliveries
- **Processing Latency**: P50, P95, P99 latencies by message type
- **External System Response Times**: Delivery latencies by endpoint
- **Error Rates**: By error type, downstream service, and external system
- **Queue Depth**: Kafka consumer lag for all topics

### Health Checks (Updated)

```typescript
async healthCheck(): Promise<HealthStatus> {
  const checks = await Promise.allSettled([
    this.kafkaConsumer.checkConnectivity(),
    this.spannerClient.checkConnection(),
    this.vamMediationClient.healthCheck(),
    this.limitCheckClient.healthCheck(),
    this.externalSystemClient.healthCheck()  // NEW: External systems health
  ]);
  
  return {
    status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'unhealthy',
    dependencies: {
      kafka: checks[0].status,
      spanner: checks[1].status,
      vamMediation: checks[2].status,
      limitCheck: checks[3].status,
      externalSystems: checks[4].status  // NEW
    },
    timestamp: new Date().toISOString()
  };
}
```

---

## Summary of Enhancements

### New Capabilities Added

1. **✅ PACS.002 Response Processing**: Handles PACS.002 messages from fast-inwd-processor-service
2. **✅ External System Integration**: Forwards responses to original requestors
3. **✅ Response Audit Trail**: Comprehensive tracking of response delivery
4. **✅ Enhanced Error Handling**: Robust retry mechanisms for response delivery
5. **✅ Delivery Monitoring**: Real-time tracking of response delivery success rates

### Integration Points

- **Input**: PACS.002 responses from `pacs-response-messages` Kafka topic
- **Processing**: Response validation, endpoint resolution, delivery orchestration
- **Output**: PACS.002 delivery to external systems via HTTP/HTTPS
- **Audit**: Complete response processing and delivery audit trail in Cloud Spanner

The enhanced **Fast Orchestrator Service** now provides complete end-to-end orchestration including proper PACS.002 response delivery to original payment requestors, ensuring full transaction lifecycle closure and regulatory compliance. 