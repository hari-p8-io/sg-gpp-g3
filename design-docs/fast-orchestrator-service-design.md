# Fast Orchestrator Service - Design Document

## Overview

The **Fast Orchestrator Service** is an HTTP Express.js service combined with Kafka consumer/producer capabilities that handles message routing and orchestration in the Singapore G3 Payment Platform. It consumes validated and enriched messages from Kafka topics and routes them based on account systems and authentication methods.

### Key Responsibilities
- Consume messages from Kafka topics (validated-messages, enriched-messages)
- Route messages based on account system (VAM/MDZ) and authentication method
- Integrate with downstream systems (VAM mediation, limit checks)
- Maintain orchestration audit trail in Cloud Spanner
- Provide HTTP APIs for monitoring and management
- Handle message transformation and delivery

### Service Details
- **Service Type**: HTTP Service + Kafka Consumer/Producer
- **Port**: 3004 (HTTP), Kafka Consumer
- **Technology Stack**: TypeScript, Express.js, Kafka, Cloud Spanner
- **Role**: Message routing and orchestration hub

---

## Sequence Diagram

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│Kafka Topics │  │Orchestrator │  │Cloud Spanner│  │VAM/Mediation│  │Limit Check  │
│(Consumers)  │  │Service      │  │Database     │  │Services     │  │Services     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
       │                │                │                │                │
       │ Validated Msg  │                │                │                │
       │───────────────>│                │                │                │
       │                │ Store Process  │                │                │
       │                │───────────────>│                │                │
       │                │ Audit Record   │                │                │
       │                │                │                │                │
       │                │ Route Decision │                │                │
       │                │ ◄─┐            │                │                │
       │                │   │ Check Auth │                │                │
       │                │   │ Method     │                │                │
       │                │ ◄─┘            │                │                │
       │                │                │                │                │
       │                │ Send to VAM    │                │                │
       │                │───────────────────────────────>│                │
       │                │                │                │ VAM Response   │
       │                │◄───────────────────────────────│                │
       │                │                │                │                │
       │ Enriched Msg   │ Send to Limits │                │                │
       │───────────────>│───────────────────────────────────────────────>│
       │                │                │                │ Limit Response │
       │                │◄───────────────────────────────────────────────│
       │                │ Update Status  │                │                │
       │                │───────────────>│                │                │
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
│─────────────────────────────────│
│ + processValidatedMessage()    │
│ + processEnrichedMessage()     │
│ + routeMessage()               │
│ + storeAuditRecord()           │
│ + updateProcessingStatus()     │
└─────────────────────────────────┘
       │              │              │
       │              │              │
       ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│KafkaConsumer│ │SpannerClient│ │VamMediation │
│─────────────│ │─────────────│ │Client       │
│ - topics[]  │ │ - database  │ │─────────────│
│─────────────│ │─────────────│ │ - endpoint  │
│ + consume() │ │ + insert()  │ │─────────────│
│ + commit()  │ │ + update()  │ │ + sendVam() │
│ + close()   │ │ + query()   │ │ + checkLimits()
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## Message Routing Logic

### Routing Decision Table

| Message Source | Auth Method | Account System | Routing Destination |
|---------------|-------------|----------------|-------------------|
| validated-messages | GROUPLIMIT | VAM | VAM Mediation + Limit Check |
| validated-messages | GROUPLIMIT | MDZ | Limit Check Only |
| validated-messages | AFPTHENLIMIT | VAM/MDZ | Authentication First + Limits |
| validated-messages | AFPONLY | VAM/MDZ | Direct Processing |
| enriched-messages | GROUPLIMIT | VAM | VAM Mediation + Limit Check |
| enriched-messages | GROUPLIMIT | MDZ | Limit Check Only |
| enriched-messages | AFPTHENLIMIT | VAM/MDZ | Authentication First + Limits |
| enriched-messages | AFPONLY | VAM/MDZ | Direct Processing |

### Routing Implementation

```typescript
async routeMessage(message: ProcessedMessage): Promise<RoutingResult> {
  const { authMethod, accountSystem, messageType } = message.enrichmentData;
  
  switch (authMethod) {
    case 'GROUPLIMIT':
      if (accountSystem === 'VAM') {
        return await this.routeToVamWithLimits(message);
      } else {
        return await this.routeToLimitsOnly(message);
      }
    
    case 'AFPTHENLIMIT':
      return await this.routeToAuthenticationFirst(message);
    
    case 'AFPONLY':
      return await this.routeToDirectProcessing(message);
    
    default:
      throw new Error(`Unknown auth method: ${authMethod}`);
  }
}
```

---

## HTTP API Endpoints

### Health and Monitoring

| Endpoint | Method | Description | Response |
|----------|--------|-------------|----------|
| `/health` | GET | Service health check | Health status |
| `/metrics` | GET | Processing metrics | Metrics data |
| `/status` | GET | Service status | Current status |

### Message Processing

| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/process/manual` | POST | Manual message processing | Message payload |
| `/replay/{messageId}` | POST | Replay failed message | Message ID |

### Monitoring and Management

| Endpoint | Method | Description | Response |
|----------|--------|-------------|----------|
| `/queue/status` | GET | Kafka queue status | Queue metrics |
| `/processing/stats` | GET | Processing statistics | Stats data |
| `/audit/{messageId}` | GET | Message audit trail | Audit records |

---

## Database Schema (Cloud Spanner)

### ProcessingSteps Table

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
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  UpdatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (MessageId, ProcessingStep, StepStartTime);
```

### OrchestrationAudit Table

```sql
CREATE TABLE OrchestrationAudit (
  MessageId STRING(50) NOT NULL,
  Puid STRING(50) NOT NULL,
  MessageType STRING(20) NOT NULL,
  SourceTopic STRING(50) NOT NULL,
  AuthMethod STRING(20) NOT NULL,
  AccountSystem STRING(10) NOT NULL,
  RoutingDecision STRING(50) NOT NULL,
  ProcessingStatus STRING(20) NOT NULL,
  ProcessingStartTime TIMESTAMP NOT NULL,
  ProcessingEndTime TIMESTAMP,
  TotalDuration INT64,
  EnrichmentData JSON,
  ProcessingDetails JSON,
  ErrorDetails JSON,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  UpdatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (MessageId, ProcessingStartTime);
```

---

## Kafka Configuration

### Consumer Configuration

```javascript
const consumerConfig = {
  groupId: 'fast-orchestrator-group',
  topics: ['validated-messages', 'enriched-messages'],
  autoCommit: false,
  maxBytesPerPartition: 1048576,
  sessionTimeout: 30000,
  heartbeatInterval: 3000
};
```

### Topic Subscriptions

| Topic | Message Source | Processing Flow |
|-------|---------------|-----------------|
| `validated-messages` | fast-ddi-validation-service | PACS.003 messages |
| `enriched-messages` | fast-inwd-processor-service | PACS.008/007 direct |

---

## Environment Variables

```bash
# HTTP Server
HTTP_PORT=3004
NODE_ENV=production

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=fast-orchestrator-group
KAFKA_TOPIC_VALIDATED=validated-messages
KAFKA_TOPIC_ENRICHED=enriched-messages

# Cloud Spanner
SPANNER_PROJECT_ID=gpp-g3-project
SPANNER_INSTANCE_ID=gpp-g3-instance
SPANNER_DATABASE_ID=orchestration-db

# Downstream Services
VAM_MEDIATION_ENDPOINT=https://vam-mediation.internal
LIMIT_CHECK_ENDPOINT=https://limit-check.internal
AUTHENTICATION_ENDPOINT=https://auth.internal

# Processing Settings
MAX_RETRY_ATTEMPTS=3
PROCESSING_TIMEOUT_MS=30000
BATCH_SIZE=100
```

---

## Error Handling and Retry Logic

### Error Categories

| Error Type | Retry Strategy | Max Retries | Backoff |
|------------|---------------|-------------|---------|
| **Network Timeout** | Exponential Backoff | 3 | 1s, 2s, 4s |
| **Service Unavailable** | Linear Backoff | 5 | 2s, 4s, 6s, 8s, 10s |
| **Authentication Failed** | Manual Intervention | 0 | N/A |
| **Message Format Error** | Dead Letter Queue | 0 | N/A |
| **Database Error** | Exponential Backoff | 3 | 1s, 3s, 9s |

### Retry Implementation

```typescript
async processWithRetry(message: Message, maxRetries: number = 3): Promise<ProcessingResult> {
  let attempt = 0;
  let lastError: Error;
  
  while (attempt < maxRetries) {
    try {
      return await this.processMessage(message);
    } catch (error) {
      lastError = error;
      attempt++;
      
      if (attempt < maxRetries) {
        const delay = this.calculateBackoff(attempt, error.type);
        await this.delay(delay);
      }
    }
  }
  
  // Send to dead letter queue
  await this.sendToDeadLetterQueue(message, lastError);
  throw lastError;
}
```

---

## Performance Characteristics

### Processing Metrics
- **Average Processing Time**: 200-500ms per message
- **Throughput**: 500+ messages per second
- **Concurrent Processing**: 50+ messages simultaneously
- **Memory Usage**: 1-2GB per instance

### SLA Requirements
- **Availability**: 99.9% uptime
- **Processing Latency**: 95th percentile < 1 second
- **Message Loss Rate**: < 0.01%
- **Order Preservation**: Within partition guaranteed

---

## Monitoring and Alerting

### Key Metrics

- **Message Processing Rate**: Messages per second by topic
- **Processing Latency**: P50, P95, P99 latencies
- **Error Rates**: By error type and downstream service
- **Queue Depth**: Kafka consumer lag
- **Database Performance**: Spanner query latencies

### Health Checks

```typescript
async healthCheck(): Promise<HealthStatus> {
  const checks = await Promise.allSettled([
    this.kafkaConsumer.checkConnectivity(),
    this.spannerClient.checkConnection(),
    this.vamMediationClient.healthCheck(),
    this.limitCheckClient.healthCheck()
  ]);
  
  return {
    status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'unhealthy',
    dependencies: {
      kafka: checks[0].status,
      spanner: checks[1].status,
      vamMediation: checks[2].status,
      limitCheck: checks[3].status
    },
    timestamp: new Date().toISOString()
  };
}
```

---

## Deployment Configuration

### Docker Configuration

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3004
CMD ["npm", "start"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fast-orchestrator-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fast-orchestrator-service
  template:
    metadata:
      labels:
        app: fast-orchestrator-service
    spec:
      containers:
      - name: orchestrator
        image: fast-orchestrator-service:latest
        ports:
        - containerPort: 3004
        env:
        - name: HTTP_PORT
          value: "3004"
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        - name: SPANNER_PROJECT_ID
          value: "gpp-g3-project"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3004
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3004
          initialDelaySeconds: 10
          periodSeconds: 5
``` 