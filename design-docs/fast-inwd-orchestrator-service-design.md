# Fast Inward Orchestrator Service - Design Document

## Overview

The **Fast Inward Orchestrator Service** (formerly fast-orchestrator-service) is a Java Spring Boot service that serves as the central orchestration hub for asynchronous payment processing in the Singapore G3 Payment Platform. This service has been completely redesigned to focus on configurable workflows, deduplication, message transformation, and downstream service coordination.

**Key Architectural Change**: This service now operates on a Kafka-driven architecture with external client publishing, eliminating the synchronous request-response model and implementing comprehensive workflow orchestration with Google Cloud Spanner for state management.

### Key Responsibilities
- **Kafka Message Consumption**: Consumes enriched messages from external clients via Kafka
- **Configurable Workflows**: Implements CTI (Credit Transfer Inward) and DDI (Direct Debit Inward) workflows
- **Deduplication Management**: SHA-256 hash-based duplicate detection using Google Cloud Spanner
- **Message Transformation**: Converts XML messages to standardized JSON format (no validation)
- **Downstream Publishing**: Publishes JSON messages to accounting, VAM mediation, and limit check services
- **State Management**: Tracks processing state and downstream service responses in Spanner
- **Response Orchestration**: Handles responses from downstream services and updates processing state

### Service Details
- **Service Type**: Spring Boot Application + Kafka Consumer/Producer
- **Port**: 8080 (HTTP), Kafka Consumer
- **Technology Stack**: Java 21, Spring Boot 3.2.1, Kafka, Google Cloud Spanner, fast-core-java
- **Database**: Google Cloud Spanner for deduplication and state management
- **Testing**: Comprehensive Playwright tests using pw-core library

---

## Revised Architecture Flow

```
External Client (Based on BusinessVal Response)
    ↓ (Kafka: enriched-messages)
fast-inwd-orchestrator-service [Java Spring Boot]
    ├─ Google Cloud Spanner (Deduplication & State Management)
    ├─ JSON Transformation (PACS/CAMT → JSON, no validation)
    └─ (Kafka: json-messages)
        ├─ fast-accounting-service
        ├─ fast-vammediation-service
        └─ fast-limitcheck-service
    ↑ (Kafka: response topics)
    └─ State Updates from Downstream Services
```

**Key Architectural Benefits:**
- 🔄 **Decoupled Processing**: Asynchronous processing independent of validation
- ⚡ **Scalable Workflows**: Configurable CTI and DDI processing workflows
- 🔒 **Deduplication**: Robust duplicate prevention using Spanner
- 📊 **State Tracking**: Complete processing state management
- 🎯 **Targeted Publishing**: Intelligent routing to downstream services
- 🛡️ **Fault Tolerance**: Resilient processing with comprehensive error handling

---

## Enhanced Sequence Diagram

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ External Client     │  │ fast-inwd-orchestrator│  │ Google Cloud        │  │ fast-accounting     │  │ fast-vammediation   │  │ fast-limitcheck     │
│ System              │  │ service             │  │ Spanner            │  │ service             │  │ service             │  │ service             │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
          │                        │                        │                        │                        │                        │
          │ Publish Enriched Msg   │                        │                        │                        │                        │
          │──────────────────────→ │                        │                        │                        │                        │
          │ (Kafka: enriched-      │                        │                        │                        │                        │
          │  messages topic)       │                        │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Consume Message        │                        │                        │                        │
          │                        │ ◄─┐                    │                        │                        │                        │
          │                        │   │ Extract Message    │                        │                        │                        │
          │                        │   │ ID & PUID          │                        │                        │                        │
          │                        │ ◄─┘                    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Generate Message Hash  │                        │                        │                        │
          │                        │ (SHA-256)              │                        │                        │                        │
          │                        │ ◄─┐                    │                        │                        │                        │
          │                        │   │ Hash payload +     │                        │                        │                        │
          │                        │   │ metadata           │                        │                        │                        │
          │                        │ ◄─┘                    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Check for Duplicate    │                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Duplicate Check Result │                        │                        │                        │
          │                        │←──────────────────────│                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ [If not duplicate]     │                        │                        │                        │
          │                        │ Create Processing State│                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Determine Workflow     │                        │                        │                        │
          │                        │ (CTI or DDI)           │                        │                        │                        │
          │                        │ ◄─┐                    │                        │                        │                        │
          │                        │   │ Based on message   │                        │                        │                        │
          │                        │   │ type & content     │                        │                        │                        │
          │                        │ ◄─┘                    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Transform XML to JSON  │                        │                        │                        │
          │                        │ ◄─┐                    │                        │                        │                        │
          │                        │   │ Extract payment    │                        │                        │                        │
          │                        │   │ data & enrich      │                        │                        │                        │
          │                        │ ◄─┘ with metadata     │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Publish to Accounting  │                        │                        │                        │
          │                        │────────────────────────────────────────────────→ │                        │                        │
          │                        │ (Kafka: json-accounting-messages)                │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ [If VAM required]      │                        │                        │                        │
          │                        │ Publish to VAM         │                        │                        │                        │
          │                        │────────────────────────────────────────────────────────────────────────→ │                        │
          │                        │ (Kafka: json-vammediation-messages)             │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ [If Limit Check req]   │                        │                        │                        │
          │                        │ Publish to Limit Check │                        │                        │                        │
          │                        │────────────────────────────────────────────────────────────────────────────────────────────────→ │
          │                        │ (Kafka: json-limitcheck-messages)               │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Update Processing State│                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │ (Status: PROCESSING)   │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Accounting Response    │                        │                        │                        │
          │                        │←────────────────────────────────────────────────│                        │                        │
          │                        │ (Kafka: accounting-responses)                   │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Update Accounting Status │                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │ (Status: COMPLETED)    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ VAM Response           │                        │                        │                        │
          │                        │←────────────────────────────────────────────────────────────────────────│                        │
          │                        │ (Kafka: vammediation-responses)                │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Update VAM Status      │                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │ (Status: COMPLETED)    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Limit Check Response   │                        │                        │                        │
          │                        │←────────────────────────────────────────────────────────────────────────────────────────────────│
          │                        │ (Kafka: limitcheck-responses)                  │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Update Limit Status    │                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │ (Status: COMPLETED)    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Check All Complete     │                        │                        │                        │
          │                        │ ◄─┐                    │                        │                        │                        │
          │                        │   │ All downstream     │                        │                        │                        │
          │                        │   │ services done?     │                        │                        │                        │
          │                        │ ◄─┘                    │                        │                        │                        │
          │                        │                        │                        │                        │                        │
          │                        │ Mark Overall Complete  │                        │                        │                        │
          │                        │──────────────────────→ │                        │                        │                        │
          │                        │ (Status: COMPLETED)    │                        │                        │                        │
```

**Enhanced Flow Notes:**
- **Kafka-Driven**: All processing triggered by Kafka message consumption
- **Deduplication**: SHA-256 hash check prevents duplicate processing
- **Workflow-Based**: CTI and DDI workflows with different routing logic
- **State Management**: Complete processing state tracking in Spanner
- **JSON Transformation**: Standardized JSON format for downstream services
- **Response Coordination**: Handles responses from multiple downstream services

---

## Enhanced Class Diagram

```
┌─────────────────────────────────┐
│    OrchestratorApplication      │
│─────────────────────────────────│
│ + main(String[] args)          │
│ @SpringBootApplication         │
│ @EnableKafka                   │
│ @EnableAsync                   │
│ @EnableScheduling              │
└─────────────────────────────────┘
                 │
                 │ initializes
                 ▼
┌─────────────────────────────────┐
│ WorkflowOrchestrationService    │
│─────────────────────────────────│
│ - stateManagementService       │
│ - messageTransformationService │
│ - kafkaPublishingService       │
│ - workflowConfiguration        │
│─────────────────────────────────│
│ + processPaymentMessage()      │
│ + executeCtiWorkflow()         │
│ + executeDdiWorkflow()         │
│ + executeWorkflowStep()        │
│ + handleDownstreamResponse()   │
└─────────────────────────────────┘
       │              │              │              │
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│StateManage  │ │MessageTrans │ │KafkaPublish │ │KafkaConsumer│
│mentService  │ │formService  │ │ingService   │ │Service      │
│─────────────│ │─────────────│ │─────────────│ │─────────────│
│ - repository│ │ - objectMap │ │ - kafkaTemp │ │ - kafkaTemp │
│─────────────│ │ - jsonUtils │ │ - topics    │ │ - listeners │
│ + createInit│ │ + transform │ │─────────────│ │─────────────│
│   ialState()│ │   ToJson()  │ │ + publishTo │ │ + consume   │
│ + checkFor  │ │ + extract   │ │   Accounting│ │   Payment   │
│   Duplicate()│ │   Payment   │ │ + publishTo │ │   Message() │
│ + updateAcc │ │   Data()    │ │   VamMed()  │ │ + consume   │
│   ounting   │ │ + transform │ │ + publishTo │ │   Accounting│
│   Status()  │ │   Enrichment│ │   LimitChk()│ │   Response()│
│ + updateVam │ │   Data()    │ │             │ │ + consume   │
│   Mediation │ │             │ │             │ │   VamMedia  │
│   Status()  │ │             │ │             │ │   tion      │
│ + updateLim │ │             │ │             │ │   Response()│
│   itCheck   │ │             │ │             │ │ + consume   │
│   Status()  │ │             │ │             │ │   LimitCheck│
│ + markAs    │ │             │ │             │ │   Response()│
│   Completed()│ │             │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
       │
       │ uses
       ▼
┌─────────────────────────────────┐
│PaymentProcessingStateRepository │
│─────────────────────────────────│
│ @Repository                    │
│─────────────────────────────────│
│ + save()                       │
│ + findByMessageId()            │
│ + findByMessageHash()          │
│ + findByPuid()                 │
│ + findPendingStates()          │
│ + findTimedOutStates()         │
│ + deleteOldCompletedStates()   │
└─────────────────────────────────┘
       │
       │ manages
       ▼
┌─────────────────────────────────┐
│   PaymentProcessingState        │
│─────────────────────────────────│
│ - messageId: String            │
│ - puid: String                 │
│ - workflowType: WorkflowType   │
│ - overallStatus: ProcessingStatus│
│ - accountingStatus: ProcessingStatus│
│ - vamMediationStatus: ProcessingStatus│
│ - limitCheckStatus: ProcessingStatus│
│ - messageHash: String          │
│ - retryCount: Integer          │
│ - enrichmentDataJson: String   │
│ - responseDataJson: String     │
│ - createdAt: Instant          │
│ - updatedAt: Instant          │
│ - completedAt: Instant        │
│─────────────────────────────────│
│ + markAsCompleted()            │
│ + markAsFailed()               │
│ + areAllDownstreamServices     │
│   Completed()                  │
└─────────────────────────────────┘
```

---

## Configurable Workflow System

### Workflow Configuration

```yaml
# CTI (Credit Transfer Inward) Workflow
workflows:
  credit-transfer-inward:
    name: "credit-transfer-inward"
    description: "Workflow for processing credit transfer inward messages"
    enabled: true
    steps:
      - name: "deduplication-check"
        service: "DeduplicationService"
        required: true
        timeout: 5000
      - name: "message-transformation"
        service: "MessageTransformationService"
        required: true
        timeout: 10000
      - name: "downstream-publishing"
        service: "KafkaPublishingService"
        required: true
        timeout: 15000
        targets: ["accounting", "vammediation", "limitcheck"]
    
  # DDI (Direct Debit Inward) Workflow  
  direct-debit-inward:
    name: "direct-debit-inward"
    description: "Workflow for processing direct debit inward messages"
    enabled: true
    steps:
      - name: "deduplication-check"
        service: "DeduplicationService"
        required: true
        timeout: 5000
      - name: "message-transformation"
        service: "MessageTransformationService"
        required: true
        timeout: 10000
      - name: "downstream-publishing"
        service: "KafkaPublishingService"
        required: true
        timeout: 15000
        targets: ["accounting", "limitcheck"]  # No VAM mediation for DDI
```

### Workflow Execution Logic

```java
@Service
public class WorkflowOrchestrationService {
    
    public void processPaymentMessage(PaymentMessage message) {
        // Determine workflow type based on message
        WorkflowType workflowType = determineWorkflowType(message);
        
        switch (workflowType) {
            case CTI -> executeCtiWorkflow(message);
            case DDI -> executeDdiWorkflow(message);
            default -> throw new IllegalArgumentException("Unsupported workflow type: " + workflowType);
        }
    }
    
    private void executeCtiWorkflow(PaymentMessage message) {
        WorkflowConfig config = workflowConfiguration.getCtiWorkflow();
        
        for (WorkflowStep step : config.getSteps()) {
            executeWorkflowStep(step, message);
        }
    }
    
    private void executeDdiWorkflow(PaymentMessage message) {
        WorkflowConfig config = workflowConfiguration.getDdiWorkflow();
        
        for (WorkflowStep step : config.getSteps()) {
            executeWorkflowStep(step, message);
        }
    }
}
```

---

## Spanner Database Schema

### PaymentProcessingState Table

```sql
CREATE TABLE payment_processing_state (
  message_id STRING(36) NOT NULL,
  puid STRING(50) NOT NULL,
  workflow_type STRING(20) NOT NULL,
  overall_status STRING(20) NOT NULL,
  accounting_status STRING(20) NOT NULL,
  vam_mediation_status STRING(20) NOT NULL,
  limit_check_status STRING(20) NOT NULL,
  message_hash STRING(64) NOT NULL,
  retry_count INT64 NOT NULL DEFAULT 0,
  enrichment_data_json STRING(MAX),
  response_data_json STRING(MAX),
  error_message STRING(1000),
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  updated_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  completed_at TIMESTAMP,
) PRIMARY KEY (message_id);

-- Indexes for efficient queries
CREATE INDEX idx_message_hash ON payment_processing_state(message_hash);
CREATE INDEX idx_puid ON payment_processing_state(puid);
CREATE INDEX idx_overall_status ON payment_processing_state(overall_status);
CREATE INDEX idx_created_at ON payment_processing_state(created_at);
CREATE INDEX idx_workflow_type ON payment_processing_state(workflow_type);
```

### PaymentProcessingAudit Table

```sql
CREATE TABLE payment_processing_audit (
  audit_id STRING(36) NOT NULL,
  message_id STRING(36) NOT NULL,
  puid STRING(50) NOT NULL,
  event_type STRING(50) NOT NULL,
  event_details STRING(MAX),
  processing_step STRING(50),
  step_status STRING(20),
  processing_duration_ms INT64,
  error_message STRING(1000),
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (audit_id, created_at);

-- Indexes for audit queries
CREATE INDEX idx_audit_message_id ON payment_processing_audit(message_id);
CREATE INDEX idx_audit_puid ON payment_processing_audit(puid);
CREATE INDEX idx_audit_event_type ON payment_processing_audit(event_type);
```

---

## JSON Message Structure

### Standardized JSON Output

```json
{
  "messageId": "G3I_20240116_001234",
  "puid": "G3I_PACS008_20240116_001234",
  "messageType": "PACS008",
  "processedAt": "2024-01-16T12:34:56Z",
  "workflow": "credit-transfer-inward",
  "paymentData": {
    "amount": "1000.00",
    "currency": "SGD",
    "debtorAccount": "123456789",
    "creditorAccount": "987654321",
    "debtorName": "John Doe",
    "creditorName": "Jane Smith",
    "remittanceInfo": "Invoice payment",
    "endToEndId": "E2E_20240116_001234",
    "instructionId": "INST_20240116_001234",
    "transactionId": "TXN_20240116_001234"
  },
  "enrichmentData": {
    "accountSystem": "VAM",
    "authMethod": "GROUPLIMIT",
    "accountInfo": {
      "normalizedAccountId": "123456789",
      "accountType": "CURRENT",
      "accountStatus": "ACTIVE",
      "bicfi": "GPPSGSGXXXX"
    },
    "routingInfo": {
      "requiresVamMediation": true,
      "requiresLimitCheck": true,
      "requiresAuthentication": false
    }
  },
  "metadata": {
    "sourceSystem": "external-bank-a",
    "originalMessageType": "PACS008",
    "processingPriority": "NORMAL",
    "businessDate": "2024-01-16"
  }
}
```

---

## Kafka Configuration

### Topic Configuration

```yaml
kafka:
  topics:
    # Input Topics
    enriched-messages:
      partitions: 6
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 604800000  # 7 days
      
    # Output Topics
    json-accounting-messages:
      partitions: 3
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 259200000  # 3 days
      
    json-vammediation-messages:
      partitions: 3
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 259200000  # 3 days
      
    json-limitcheck-messages:
      partitions: 3
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 259200000  # 3 days
      
    # Response Topics
    accounting-responses:
      partitions: 3
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 259200000  # 3 days
      
    vammediation-responses:
      partitions: 3
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 259200000  # 3 days
      
    limitcheck-responses:
      partitions: 3
      replication-factor: 3
      cleanup-policy: delete
      retention-ms: 259200000  # 3 days
```

### Consumer Configuration

```java
@Configuration
@EnableKafka
public class KafkaConfig {
    
    @Bean
    public ConsumerFactory<String, String> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBrokers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "orchestrator-service-group");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 100);
        props.put(ConsumerConfig.FETCH_MIN_BYTES_CONFIG, 1024);
        props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, 500);
        
        return new DefaultKafkaConsumerFactory<>(props);
    }
}
```

---

## Environment Configuration

### Application Properties

```yaml
# application.yml
server:
  port: 8080

spring:
  application:
    name: fast-inwd-orchestrator-service
  cloud:
    gcp:
      spanner:
        instance-id: ${SPANNER_INSTANCE_ID:fast-payments-instance}
        database: ${SPANNER_DATABASE_ID:orchestration-db}
        project-id: ${SPANNER_PROJECT_ID:gpp-g3-project}
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    consumer:
      group-id: orchestrator-service-group
      auto-offset-reset: earliest
      enable-auto-commit: false
      properties:
        spring.json.trusted.packages: "com.gpp.g3.orchestrator.model"
    producer:
      retries: 3
      acks: all
      properties:
        enable.idempotence: true

# Kafka Topics Configuration
kafka:
  topics:
    enriched-messages: enriched-messages
    json-accounting-messages: json-accounting-messages
    json-vammediation-messages: json-vammediation-messages
    json-limitcheck-messages: json-limitcheck-messages
    accounting-responses: accounting-responses
    vammediation-responses: vammediation-responses
    limitcheck-responses: limitcheck-responses

# Workflow Configuration
workflows:
  cti:
    enabled: true
    timeout-ms: 30000
    retry-attempts: 3
    target-services: [accounting, vammediation, limitcheck]
  ddi:
    enabled: true
    timeout-ms: 25000
    retry-attempts: 3
    target-services: [accounting, limitcheck]

# Processing Configuration
processing:
  deduplication:
    enabled: true
    hash-algorithm: SHA-256
    cleanup-interval-hours: 24
    retention-days: 7
  state-management:
    timeout-hours: 24
    cleanup-interval-hours: 6
    audit-retention-days: 30

# fast-core Integration
fast-core:
  environment: ${FAST_CORE_ENVIRONMENT:production}
  log-level: ${FAST_CORE_LOG_LEVEL:INFO}

# Logging Configuration
logging:
  level:
    com.gpp.g3.orchestrator: INFO
    org.springframework.kafka: WARN
    com.google.cloud.spanner: WARN
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level [%logger{36}] - %msg%n"
```

### Environment Variables

```bash
# Server Configuration
SERVER_PORT=8080
SPRING_PROFILES_ACTIVE=production

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CONSUMER_GROUP_ID=orchestrator-service-group

# Google Cloud Spanner Configuration
SPANNER_PROJECT_ID=gpp-g3-project
SPANNER_INSTANCE_ID=fast-payments-instance
SPANNER_DATABASE_ID=orchestration-db
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Workflow Configuration
ENABLE_CTI_WORKFLOW=true
ENABLE_DDI_WORKFLOW=true
WORKFLOW_TIMEOUT_MS=30000
MAX_RETRY_ATTEMPTS=3

# Deduplication Configuration
ENABLE_DEDUPLICATION=true
DEDUPLICATION_CLEANUP_INTERVAL_HOURS=24
DEDUPLICATION_RETENTION_DAYS=7

# State Management Configuration
STATE_TIMEOUT_HOURS=24
STATE_CLEANUP_INTERVAL_HOURS=6
AUDIT_RETENTION_DAYS=30

# fast-core Configuration
FAST_CORE_ENVIRONMENT=production
FAST_CORE_LOG_LEVEL=INFO

# Monitoring Configuration
ENABLE_METRICS=true
METRICS_EXPORT_INTERVAL_SECONDS=60
HEALTH_CHECK_INTERVAL_SECONDS=30
```

---

## Performance Characteristics

### Processing Metrics
- **Message Consumption Rate**: 2000+ messages per second
- **Deduplication Check Time**: ~10-20ms average
- **Message Transformation Time**: ~50-100ms average
- **Downstream Publishing Time**: ~30-50ms per service
- **State Update Time**: ~20-30ms average
- **End-to-End Processing Time**: ~200-400ms per message
- **Memory Usage**: 2-4GB per instance (includes Spanner connections)
- **CPU Usage**: 40-70% under peak load

### Throughput Characteristics
- **Peak Throughput**: 3000+ messages per second
- **Sustained Throughput**: 2500+ messages per second
- **Concurrent Processing**: 100+ messages simultaneously
- **Spanner Operations**: 10,000+ operations per second
- **Kafka Operations**: 15,000+ operations per second

### SLA Requirements
- **Availability**: 99.95% uptime
- **Processing Latency**: P95 < 500ms, P99 < 1000ms
- **Message Loss Rate**: < 0.001%
- **Deduplication Accuracy**: > 99.99%
- **State Consistency**: 100% (ACID compliance via Spanner)

---

## Monitoring and Observability

### Key Metrics

- **Message Processing Rate**: Messages per second by workflow type
- **Deduplication Hit Rate**: Percentage of duplicate messages detected
- **Transformation Success Rate**: Successful XML to JSON transformations
- **Downstream Publishing Success Rate**: Successful publications by service
- **Response Processing Time**: Time to process downstream responses
- **State Management Metrics**: State transitions and update latencies
- **Error Rates**: Errors per second by error type and processing step
- **Spanner Metrics**: Connection pool usage, query latencies, transaction success rates

### Health Checks

```java
@Component
public class OrchestratorHealthIndicator implements HealthIndicator {
    
    @Override
    public Health health() {
        try {
            // Check Kafka connectivity
            kafkaTemplate.send("health-check-topic", "ping").get(1, TimeUnit.SECONDS);
            
            // Check Spanner connectivity
            spannerTemplate.execute("SELECT 1");
            
            // Check processing state
            boolean isProcessing = workflowOrchestrationService.isHealthy();
            
            if (isProcessing) {
                return Health.up()
                    .withDetail("kafka", "UP")
                    .withDetail("spanner", "UP")
                    .withDetail("processing", "ACTIVE")
                    .build();
            } else {
                return Health.down()
                    .withDetail("processing", "INACTIVE")
                    .build();
            }
        } catch (Exception e) {
            return Health.down()
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}
```

### Audit Logging

```java
@Component
public class ProcessingAuditLogger {
    
    public void logProcessingEvent(String messageId, String eventType, 
                                 String processingStep, Map<String, Object> details) {
        AuditLog auditLog = AuditLog.builder()
            .messageId(messageId)
            .eventType(eventType)
            .processingStep(processingStep)
            .eventDetails(objectMapper.writeValueAsString(details))
            .timestamp(Instant.now())
            .build();
            
        auditLogRepository.save(auditLog);
        
        // Also log to structured logger for real-time monitoring
        structuredLogger.info("Processing event", Map.of(
            "messageId", messageId,
            "eventType", eventType,
            "processingStep", processingStep,
            "details", details
        ));
    }
}
```

---

## Playwright Testing Framework

### Test Infrastructure

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  
  projects: [
    {
      name: 'orchestrator',
      testDir: './tests/orchestrator',
    },
  ],
  
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
});
```

### Test Scenarios

```typescript
// tests/orchestrator/credit-transfer-workflow.spec.ts
import { test, expect } from '@playwright/test';
import { KafkaTestUtils } from '../utils/kafka-test-utils';
import { SpannerTestUtils } from '../utils/spanner-test-utils';

test.describe('Credit Transfer Workflow', () => {
  let kafkaUtils: KafkaTestUtils;
  let spannerUtils: SpannerTestUtils;
  
  test.beforeEach(async () => {
    kafkaUtils = new KafkaTestUtils();
    spannerUtils = new SpannerTestUtils();
    await kafkaUtils.clearReceivedMessages();
  });
  
  test('should process CTI message successfully', async () => {
    const messageId = 'TEST_CTI_001';
    const puid = 'G3I_TEST_CTI_001';
    
    const testMessage = {
      messageId,
      puid,
      messageType: 'PACS008',
      xmlPayload: '<PACS008_TEST_XML>...',
      enrichmentData: {
        accountSystem: 'VAM',
        authMethod: 'GROUPLIMIT'
      }
    };
    
    // Send message to orchestrator
    await kafkaUtils.sendMessage('enriched-messages', messageId, testMessage);
    
    // Wait for processing state creation
    await spannerUtils.waitForMessageStatus(messageId, 'PROCESSING');
    
    // Verify downstream publishing
    const accountingMessage = await kafkaUtils.waitForMessage('json-accounting-messages');
    expect(accountingMessage.messageId).toBe(messageId);
    expect(accountingMessage.workflow).toBe('credit-transfer-inward');
    
    const vamMessage = await kafkaUtils.waitForMessage('json-vammediation-messages');
    expect(vamMessage.messageId).toBe(messageId);
    
    const limitMessage = await kafkaUtils.waitForMessage('json-limitcheck-messages');
    expect(limitMessage.messageId).toBe(messageId);
    
    // Simulate downstream responses
    await kafkaUtils.sendMessage('accounting-responses', messageId, {
      messageId,
      status: 'COMPLETED',
      result: 'SUCCESS'
    });
    
    await kafkaUtils.sendMessage('vammediation-responses', messageId, {
      messageId,
      status: 'COMPLETED',
      result: 'SUCCESS'
    });
    
    await kafkaUtils.sendMessage('limitcheck-responses', messageId, {
      messageId,
      status: 'COMPLETED',
      result: 'SUCCESS'
    });
    
    // Wait for overall completion
    await spannerUtils.waitForMessageStatus(messageId, 'COMPLETED');
    
    // Verify final state
    const finalState = await spannerUtils.getProcessingState(messageId);
    expect(finalState.overallStatus).toBe('COMPLETED');
    expect(finalState.accountingStatus).toBe('COMPLETED');
    expect(finalState.vamMediationStatus).toBe('COMPLETED');
    expect(finalState.limitCheckStatus).toBe('COMPLETED');
  });
  
  test('should detect and reject duplicate messages', async () => {
    const messageId = 'TEST_DUPLICATE_001';
    const testMessage = {
      messageId,
      puid: 'G3I_TEST_DUP_001',
      messageType: 'PACS008',
      xmlPayload: '<IDENTICAL_XML>...'
    };
    
    // Send original message
    await kafkaUtils.sendMessage('enriched-messages', messageId, testMessage);
    await spannerUtils.waitForMessageStatus(messageId, 'PROCESSING');
    
    // Send duplicate message
    await kafkaUtils.sendMessage('enriched-messages', messageId + '_DUP', testMessage);
    
    // Verify duplicate is detected and rejected
    await spannerUtils.waitForMessageDuplicate(messageId + '_DUP', true);
    
    // Verify only one message was processed
    const accountingMessages = await kafkaUtils.getReceivedMessages('json-accounting-messages');
    expect(accountingMessages.length).toBe(1);
  });
});
```

---

## Error Handling and Recovery

### Error Categories

| Error Type | Recovery Strategy | Max Retries | Action |
|------------|-------------------|-------------|---------|
| **Spanner Connection Failed** | Exponential Backoff | 5 | Reconnect with backoff |
| **Kafka Publishing Failed** | Linear Retry | 3 | Retry publishing |
| **Message Transformation Failed** | No Retry | 0 | Mark as failed, audit |
| **Duplicate Message** | No Retry | 0 | Log and discard |
| **Downstream Service Timeout** | Manual Intervention | 0 | Mark for investigation |
| **Invalid Message Format** | No Retry | 0 | Mark as failed, audit |

### Retry Logic

```java
@Retryable(value = {SpannerException.class}, maxAttempts = 5)
public PaymentProcessingState updateProcessingState(String messageId, ProcessingStatus status) {
    try {
        return stateManagementService.updateAccountingStatus(messageId, status);
    } catch (SpannerException e) {
        logger.warn("Spanner operation failed, retrying...", e);
        throw e;
    }
}

@Recover
public PaymentProcessingState recover(SpannerException ex, String messageId, ProcessingStatus status) {
    logger.error("Failed to update processing state after all retries", ex);
    // Implement fallback strategy (e.g., queue for manual processing)
    return null;
}
```

---

## Security Considerations

### Data Protection
- **Encryption at Rest**: All Spanner data encrypted with Google Cloud KMS
- **Encryption in Transit**: TLS 1.3 for all Kafka and Spanner communications
- **Message Sanitization**: Remove sensitive data before logging
- **Access Control**: IAM-based access to Spanner and Kafka resources

### Audit Requirements
- **Complete Audit Trail**: All processing steps logged with timestamps
- **Data Retention**: Audit logs retained for regulatory compliance periods
- **Non-Repudiation**: Cryptographic message hashing for integrity verification
- **Compliance**: SOX, PCI DSS, and regional banking regulations

---

## Summary

### Key Enhancements

1. **✅ Java Spring Boot Architecture**: Modern, scalable Java-based implementation
2. **✅ Configurable Workflows**: Flexible CTI and DDI workflow definitions
3. **✅ Spanner State Management**: ACID-compliant state tracking and deduplication
4. **✅ JSON Transformation**: Standardized JSON format for downstream services
5. **✅ Comprehensive Testing**: Playwright-based E2E testing with infrastructure
6. **✅ Enhanced Monitoring**: Complete observability and audit logging
7. **✅ fault-core Integration**: Leverages common utilities and patterns

### Architectural Benefits

- **Scalability**: Horizontal scaling through Kafka partitioning and Spring Boot instances
- **Reliability**: ACID transactions via Spanner ensure data consistency
- **Maintainability**: Clean separation of concerns with configurable workflows
- **Testability**: Comprehensive testing framework with Docker infrastructure
- **Observability**: Real-time monitoring and comprehensive audit trails
- **Performance**: Optimized for high-throughput message processing

The redesigned **Fast Inward Orchestrator Service** provides a robust, scalable, and compliant solution for payment message orchestration with comprehensive workflow management, state tracking, and downstream service coordination. 