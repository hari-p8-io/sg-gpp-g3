# Fast Inward Orchestrator Service

## Overview

The **Fast Inward Orchestrator Service** is a Java 21 Spring Boot microservice that orchestrates payment processing workflows for Credit Transfer Inward (CTI) and Direct Debit Inward (DDI) transactions. It provides configurable workflows, state management in Google Cloud Spanner, and seamless integration with downstream services through Kafka.

## Architecture

### Technology Stack
- **Java 21** with Spring Boot 3.2.1
- **Google Cloud Spanner** for state persistence and deduplication
- **Apache Kafka** for message streaming
- **fast-core** for common utilities
- **pw-core** for Playwright testing
- **Maven** for dependency management

### Key Features
- ✅ **Configurable Workflows**: CTI and DDI workflows with YAML configuration
- ✅ **State Management**: Complete lifecycle tracking in Spanner
- ✅ **Deduplication**: SHA-256 hash-based message deduplication
- ✅ **JSON Transformation**: XML to JSON conversion for downstream services
- ✅ **Response Handling**: Async response tracking from downstream services
- ✅ **Comprehensive Testing**: E2E tests with pw-core integration
- ✅ **Monitoring**: REST APIs for state management and monitoring

## Service Architecture

```
External Clients
    ↓ (Kafka: enriched-messages)
Fast Inward Orchestrator Service
    ├─ Spanner (State Management)
    ├─ Workflow Engine (CTI/DDI)
    ├─ Message Transformation
    └─ (Kafka: json-messages)
        ├─ fast-accounting-service
        ├─ fast-vammediation-service
        └─ fast-limitcheck-service
```

## State Management

The service maintains comprehensive state for each payment message:

### Processing States
- `RECEIVED` - Message received but not processed
- `PROCESSING` - Currently being processed
- `COMPLETED` - Processing completed successfully
- `FAILED` - Processing failed
- `RETRYING` - Processing is being retried
- `NOT_REQUIRED` - Processing not required for this workflow
- `PENDING` - Waiting for dependency
- `TIMEOUT` - Processing timed out

### State Tracking
- **Overall Status**: Complete message processing status
- **Service-Specific Status**: Individual status for accounting, VAM mediation, limit check
- **Timestamps**: Created, updated, completed timestamps
- **Retry Count**: Number of retry attempts
- **Error Messages**: Detailed error information

## Workflow Configuration

### CTI (Credit Transfer Inward) Workflow
```yaml
workflows:
  cti:
    name: "credit-transfer-inward"
    timeoutMinutes: 30
    maxRetries: 3
    steps:
      - name: "deduplication-check"
        service: "DeduplicationService"
        required: true
      - name: "pacs-to-json-transform"
        service: "MessageTransformationService"
        required: true
      - name: "publish-to-downstream"
        service: "JsonPublishingService"
        targets: ["accounting", "vammediation", "limitcheck"]
```

### DDI (Direct Debit Inward) Workflow
```yaml
workflows:
  ddi:
    name: "direct-debit-inward"
    timeoutMinutes: 45
    maxRetries: 3
    steps:
      - name: "deduplication-check"
        service: "DeduplicationService"
        required: true
      - name: "pacs-to-json-transform"
        service: "MessageTransformationService"
        required: true
      - name: "publish-to-downstream"
        service: "JsonPublishingService"
        targets: ["accounting", "vammediation", "limitcheck"]
```

## Message Processing Flow

### 1. Message Reception
- Consume enriched payment messages from Kafka topic `enriched-messages`
- Deserialize JSON payload to `PaymentMessage` object
- Determine workflow type (CTI/DDI) based on message type

### 2. Deduplication Check
- Generate SHA-256 hash from message content
- Check Spanner for existing processing state with same hash
- Reject duplicate messages to prevent reprocessing

### 3. State Creation
- Create initial `PaymentProcessingState` in Spanner
- Initialize downstream service statuses based on requirements:
  - **Accounting**: Always required
  - **VAM Mediation**: Required if `accountSystem = "VAM"`
  - **Limit Check**: Required if `authMethod = "GROUPLIMIT"`

### 4. Message Transformation
- Parse XML payload (PACS008, PACS007, PACS003, CAMT053, CAMT054)
- Extract payment data (amount, currency, accounts, etc.)
- Transform to standardized JSON format for downstream services

### 5. Downstream Publishing
- Publish JSON messages to service-specific Kafka topics
- Update service statuses to `PROCESSING`
- Track message delivery and handle failures

### 6. Response Handling
- Consume response messages from downstream services
- Update individual service statuses in Spanner
- Mark overall processing as `COMPLETED` when all services finish

## API Endpoints

### Health Check
```
GET /api/v1/orchestrator/health
```

### State Management
```
GET /api/v1/orchestrator/state/{messageId}
GET /api/v1/orchestrator/state/puid/{puid}
GET /api/v1/orchestrator/state/pending
GET /api/v1/orchestrator/state/timeout?timeoutMinutes=30
POST /api/v1/orchestrator/state/{messageId}/fail
POST /api/v1/orchestrator/state/{messageId}/retry
```

### Monitoring
```
GET /api/v1/orchestrator/stats
POST /api/v1/orchestrator/cleanup?retentionDays=30
```

## Configuration

### Environment Variables
```bash
# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CONSUMER_GROUP_ID=fast-inwd-orchestrator-group

# Spanner Configuration
GCP_PROJECT_ID=fast-payments-project
SPANNER_INSTANCE_ID=fast-payments-instance
SPANNER_DATABASE_ID=orchestrator-db

# Topic Configuration
KAFKA_TOPIC_ENRICHED_MESSAGES=enriched-messages
KAFKA_TOPIC_ACCOUNTING=json-accounting-messages
KAFKA_TOPIC_VAM_MEDIATION=json-vammediation-messages
KAFKA_TOPIC_LIMIT_CHECK=json-limitcheck-messages
```

### Application Profiles
- **dev**: Development profile with debug logging
- **test**: Test profile with test-specific topics
- **prod**: Production profile with optimized settings

## Database Schema

### Primary Table: `payment_processing_state`
```sql
CREATE TABLE payment_processing_state (
  message_id STRING(36) NOT NULL,
  puid STRING(255) NOT NULL,
  message_type STRING(50) NOT NULL,
  workflow_type STRING(50) NOT NULL,
  overall_status STRING(50) NOT NULL,
  accounting_status STRING(50),
  vam_mediation_status STRING(50),
  limit_check_status STRING(50),
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  message_hash STRING(64) NOT NULL,
  retry_count INT64 NOT NULL DEFAULT (0),
  error_message STRING(MAX),
  enrichment_data STRING(MAX),
  response_data STRING(MAX),
) PRIMARY KEY (message_id);
```

### Indexes
- Deduplication: `message_hash`
- PUID queries: `puid`
- Status queries: `overall_status`
- Workflow queries: `workflow_type`
- Time-based queries: `created_at`
- Timeout monitoring: `overall_status, created_at`

## Testing

### Unit Tests
- Service layer tests with mocked dependencies
- Repository tests with Spanner test containers
- Configuration tests for workflow validation

### Integration Tests
- Kafka integration with test containers
- Spanner integration with emulator
- End-to-end workflow testing

### E2E Tests with pw-core
```java
@Test
void testCreditTransferInwardWorkflow() {
    // Send message to Kafka
    kafkaTemplate.send("test-enriched-messages", messageId, messageJson);
    
    // Verify processing
    pwCore.waitForKafkaMessage("test-json-accounting-messages", messageId);
    pwCore.verifySpannerRecord("payment_processing_state", messageId);
    
    // Simulate responses and verify completion
    simulateDownstreamResponses(messageId);
    assertProcessingCompleted(messageId);
}
```

## Building and Running

### Prerequisites
- Java 21
- Maven 3.9+
- Docker (for Kafka and Spanner emulator)
- Google Cloud SDK (for production Spanner)

### Build
```bash
mvn clean compile
mvn test
mvn package
```

### Run Locally
```bash
# Start dependencies
docker-compose up -d kafka spanner-emulator

# Run application
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

### Docker Build
```bash
docker build -t fast-inwd-orchestrator-service:latest .
```

## Monitoring and Observability

### Actuator Endpoints
- Health: `/actuator/health`
- Metrics: `/actuator/metrics`
- Prometheus: `/actuator/prometheus`

### Logging
- Structured JSON logging with correlation IDs
- Configurable log levels per component
- Request/response logging for debugging

### Metrics
- Message processing rates
- Processing latency
- Error rates by service
- Spanner operation metrics
- Kafka consumer lag

## Error Handling

### Retry Strategy
- Configurable retry count per workflow
- Exponential backoff for transient failures
- Dead letter queues for permanent failures

### Circuit Breaker
- Downstream service circuit breakers
- Automatic recovery and monitoring
- Fallback strategies for critical flows

## Deployment

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fast-inwd-orchestrator-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fast-inwd-orchestrator-service
  template:
    spec:
      containers:
      - name: orchestrator
        image: fast-inwd-orchestrator-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "prod"
```

## Security

### Authentication
- Service-to-service authentication via mTLS
- Google Cloud IAM for Spanner access
- Kafka SASL/SSL for secure messaging

### Data Protection
- Encryption at rest (Spanner)
- Encryption in transit (TLS)
- Sensitive data masking in logs

## Performance Considerations

### Spanner Optimization
- Efficient indexing strategy
- Connection pooling
- Batch operations where possible

### Kafka Optimization
- Appropriate partitioning strategy
- Consumer group management
- Message batching and compression

### Memory Management
- Java 21 optimizations
- Garbage collection tuning
- Connection pool sizing

## Contributing

1. Follow Java coding standards
2. Write comprehensive tests
3. Update documentation
4. Use conventional commit messages
5. Ensure compatibility with fast-core and pw-core

## License

Internal use - GPP G3 Payment Platform 