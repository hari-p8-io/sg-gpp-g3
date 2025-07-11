# Fast Orchestrator Service - Financial Message Implementation Plan

## Overview

This document outlines the implementation plan for the `fast-orchestrator-service` to handle financial message orchestration via Kafka consumption, receiving validated JSON messages from `fast-validation-service` and coordinating further processing through the payment pipeline for multiple markets.

## Requirements Summary

- Consume validated JSON messages from fast-validation-service via Kafka
- Orchestrate message flow through the payment processing pipeline
- Route messages to appropriate downstream services based on message type and business rules
- Maintain comprehensive audit trail and status tracking
- Handle error scenarios and dead letter processing
- Support multiple markets with configurable routing rules

## Architecture Changes

### Current State
- HTTP REST API or basic service
- Simple request/response handling
- No orchestration logic

### Target State
- **Kafka Consumer**: Process messages from fast-validation-service
- **Orchestration Engine**: Route messages based on business rules
- **Service Coordination**: Manage calls to downstream services
- **Audit Trail**: Comprehensive logging and tracking
- **Error Handling**: Dead letter queues and retry mechanisms
- **Multi-Market Support**: Configurable routing and processing rules

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0",
    "kafkajs": "^2.2.0",
    "uuid": "^9.0.0",
    "joi": "^17.9.0",
    "@google-cloud/spanner": "^6.0.0",
    "cron": "^2.4.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "grpc-tools": "^1.12.0",
    "@types/node-cron": "^3.0.0"
  }
}
```

## Service Definitions

### File: `proto/orchestrator_service.proto`
```protobuf
syntax = "proto3";

package gpp.g3.orchestrator;

service OrchestratorService {
  // Health check for the orchestrator service
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
  
  // Get processing status of a message
  rpc GetProcessingStatus(StatusRequest) returns (StatusResponse);
  
  // Reprocess a failed message
  rpc ReprocessMessage(ReprocessRequest) returns (ReprocessResponse);
}

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
  MessageData message_data = 1;
  EnrichmentData enrichment_data = 2;
  ValidationResult validation_result = 3;
}

message MessageData {
  string debtor_account = 1;
  string creditor_account = 2;
  string amount = 3;
  string currency = 4;
  string country = 5;
  string payment_purpose = 6;
  map<string, string> additional_fields = 7;
}

message ProcessingStep {
  string step_name = 1;                            // Service/step name
  string status = 2;                               // PENDING, PROCESSING, COMPLETED, FAILED
  int64 started_at = 3;                           // When step started
  int64 completed_at = 4;                         // When step completed
  string error_message = 5;                       // Error if failed
  map<string, string> step_data = 6;              // Step-specific data
}

message StatusRequest {
  oneof identifier {
    string message_id = 1;
    string puid = 2;
  }
}

message StatusResponse {
  string message_id = 1;
  string puid = 2;
  string overall_status = 3;                      // PROCESSING, COMPLETED, FAILED
  repeated ProcessingStep steps = 4;              // All processing steps
  int64 last_updated = 5;
}

message ReprocessRequest {
  string message_id = 1;
  string reason = 2;
  string restart_from_step = 3;                   // Which step to restart from
}

message ReprocessResponse {
  bool success = 1;
  string message = 2;
  string new_processing_id = 3;
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

## Database Schema (Cloud Spanner)

### Table: `orchestration_audit`
```sql
CREATE TABLE orchestration_audit (
  processing_id STRING(36) NOT NULL,        -- UUID for this processing instance
  message_id STRING(36) NOT NULL,           -- Original message UUID
  puid STRING(16) NOT NULL,                 -- G3I identifier
  message_type STRING(10) NOT NULL,         -- PACS008, PACS007, PACS003
  overall_status STRING(20) NOT NULL,       -- PROCESSING, COMPLETED, FAILED
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  last_updated TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  processing_data JSON,                     -- Full processing data
  error_details STRING(MAX),                -- Error information if failed
) PRIMARY KEY (processing_id);

CREATE INDEX idx_message_id ON orchestration_audit (message_id);
CREATE INDEX idx_puid ON orchestration_audit (puid);
CREATE INDEX idx_status_created ON orchestration_audit (overall_status, created_at);
```

### Table: `processing_steps`
```sql
CREATE TABLE processing_steps (
  step_id STRING(36) NOT NULL,              -- UUID for this step
  processing_id STRING(36) NOT NULL,        -- FK to orchestration_audit
  step_name STRING(50) NOT NULL,            -- Service/step name
  step_order INT64 NOT NULL,                -- Order of execution
  status STRING(20) NOT NULL,               -- PENDING, PROCESSING, COMPLETED, FAILED
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message STRING(MAX),
  step_data JSON,                           -- Step-specific data
  retry_count INT64 DEFAULT (0),
) PRIMARY KEY (step_id);

CREATE INDEX idx_processing_id_order ON processing_steps (processing_id, step_order);
CREATE INDEX idx_status_started ON processing_steps (status, started_at);
```

## Implementation Phases

### Phase 1: Project Setup (Week 1)
- [ ] Create orchestrator service structure
- [ ] Set up Kafka consumer configuration
- [ ] Configure Cloud Spanner for audit trail
- [ ] Set up protocol buffer definitions
- [ ] Create database schema and tables

### Phase 2: Kafka Integration (Week 1-2)
- [ ] Implement Kafka consumer for validation service messages
- [ ] Create message processing pipeline
- [ ] Add dead letter queue handling
- [ ] Implement consumer group management
- [ ] Add offset management and error recovery

### Phase 3: Orchestration Engine (Week 2)
- [ ] Build message routing logic based on business rules
- [ ] Implement processing step management
- [ ] Create audit trail logging
- [ ] Add status tracking and updates
- [ ] Implement Singapore-specific routing rules

### Phase 4: Downstream Service Integration (Week 2-3)
- [ ] Set up gRPC clients for downstream services
- [ ] Implement service calling logic with retry/circuit breaker
- [ ] Add error handling and status propagation
- [ ] Create step-by-step processing workflow
- [ ] Add timeout and failure recovery

### Phase 5: Monitoring & Management (Week 3)
- [ ] Create processing status endpoints
- [ ] Implement reprocessing capabilities
- [ ] Add monitoring and alerting
- [ ] Create management dashboards
- [ ] Add performance metrics

### Phase 6: Testing & Documentation (Week 3-4)
- [ ] Create comprehensive test suite
- [ ] Add end-to-end integration tests
- [ ] Performance testing and optimization
- [ ] Error scenario testing
- [ ] Documentation and runbooks

## File Structure

```
fast-orchestrator-service/
├── src/
│   ├── kafka/
│   │   ├── consumer.ts                     # Kafka consumer setup
│   │   ├── messageProcessor.ts             # Process incoming messages
│   │   └── deadLetterHandler.ts            # Handle failed messages
│   ├── orchestration/
│   │   ├── orchestrationEngine.ts          # Main orchestration logic
│   │   ├── routingRules.ts                 # Message routing rules
│   │   ├── stepManager.ts                  # Manage processing steps
│   │   └── singaporeRules.ts               # Singapore-specific rules
│   ├── services/
│   │   ├── limitCheckClient.ts             # Client for limit check service
│   │   ├── accountingClient.ts             # Client for accounting service
│   │   ├── vamMediationClient.ts           # Client for VAM mediation
│   │   └── mdzMediationClient.ts           # Client for MDZ mediation
│   ├── database/
│   │   ├── auditRepository.ts              # Audit trail operations
│   │   ├── stepRepository.ts               # Processing step operations
│   │   └── spannerClient.ts                # Spanner connection
│   ├── grpc/
│   │   ├── server.ts                       # gRPC server for management
│   │   └── handlers/
│   │       └── orchestratorHandler.ts      # Status and management endpoints
│   ├── utils/
│   │   ├── logger.ts                       # Structured logging
│   │   ├── metrics.ts                      # Performance metrics
│   │   └── errorHandler.ts                 # Error handling utilities
│   └── index.ts                            # Main entry point
├── proto/
│   └── orchestrator_service.proto
├── tests/
│   ├── unit/
│   │   ├── orchestrationEngine.test.ts
│   │   ├── routingRules.test.ts
│   │   └── stepManager.test.ts
│   ├── integration/
│   │   ├── kafkaIntegration.test.ts
│   │   └── endToEndOrchestration.test.ts
│   └── fixtures/
│       └── sample_processing_messages.json
└── config/
    ├── kafka.ts
    ├── spanner.ts
    └── default.ts
```

## Singapore Market Orchestration Rules

### Message Type Routing
```typescript
const singaporeRoutingRules = {
  PACS008: [  // Customer Credit Transfer
    'fast-limitcheck-service',     // Check transfer limits
    'fast-accounting-service',     // Record accounting entries
    'fast-vammediation-service',   // VAM system integration
    'fast-mdzmediation-service'    // MDZ clearing system
  ],
  
  PACS007: [  // Payment Reversal
    'fast-accounting-service',     // Reverse accounting entries
    'fast-vammediation-service',   // VAM reversal processing
    'fast-mdzmediation-service'    // MDZ reversal processing
  ],
  
  PACS003: [  // Direct Debit
    'fast-limitcheck-service',     // Check debit limits
    'fast-accounting-service',     // Record debit entries
    'fast-mdzmediation-service'    // MDZ direct debit processing
  ]
};
```

### Business Rules Engine
```typescript
const applyBusinessRules = (message: ProcessingMessage): ProcessingStep[] => {
  const steps: ProcessingStep[] = [];
  const { messageType, processingData } = message;
  const amount = parseFloat(processingData.messageData.amount);
  
  // Singapore-specific rules
  if (processingData.messageData.currency === 'SGD') {
    
    // High-value transaction rules (>= SGD 50,000)
    if (amount >= 50000) {
      steps.push({
        stepName: 'high-value-validation',
        status: 'PENDING',
        stepData: { threshold: '50000', reason: 'High-value SGD transaction' }
      });
    }
    
    // Standard routing based on message type
    const routingSteps = singaporeRoutingRules[messageType] || [];
    routingSteps.forEach((serviceName, index) => {
      steps.push({
        stepName: serviceName,
        status: 'PENDING',
        stepOrder: index + 1,
        stepData: { service: serviceName }
      });
    });
  }
  
  return steps;
};
```

## Kafka Message Processing

### Consumer Configuration
```typescript
const kafkaConsumer = kafka.consumer({
  groupId: 'fast-orchestrator-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 5000,
  allowAutoTopicCreation: false
});

await kafkaConsumer.subscribe({ 
  topic: 'fast-orchestrator-input',
  fromBeginning: false 
});
```

### Message Processing Flow
```typescript
const processMessage = async (message: ProcessingMessage): Promise<void> => {
  const processingId = generateUUID();
  
  try {
    // 1. Create audit record
    await createProcessingAudit(processingId, message);
    
    // 2. Apply business rules to determine steps
    const steps = applyBusinessRules(message);
    await createProcessingSteps(processingId, steps);
    
    // 3. Execute steps sequentially
    for (const step of steps) {
      await executeProcessingStep(processingId, step, message);
    }
    
    // 4. Mark as completed
    await updateProcessingStatus(processingId, 'COMPLETED');
    
  } catch (error) {
    await handleProcessingError(processingId, error);
  }
};
```

## Downstream Service Integration

### Service Client Example
```typescript
class LimitCheckClient {
  private client: any;
  
  async checkLimits(message: ProcessingMessage): Promise<LimitCheckResult> {
    const request = {
      messageId: message.messageId,
      accountId: message.processingData.messageData.creditorAccount,
      amount: message.processingData.messageData.amount,
      currency: message.processingData.messageData.currency,
      transactionType: message.messageType
    };
    
    return new Promise((resolve, reject) => {
      this.client.CheckTransactionLimits(request, (error: any, response: any) => {
        if (error) {
          reject(new Error(`Limit check failed: ${error.message}`));
        } else {
          resolve(response);
        }
      });
    });
  }
}
```

## Error Handling and Recovery

### Dead Letter Queue Processing
```typescript
const handleDeadLetterMessage = async (message: ProcessingMessage, error: Error): Promise<void> => {
  await producer.send({
    topic: 'fast-orchestrator-dead-letter',
    messages: [{
      key: message.puid,
      value: JSON.stringify({
        originalMessage: message,
        error: error.message,
        failedAt: Date.now(),
        retryCount: message.retryCount || 0
      }),
      headers: {
        errorType: 'PROCESSING_FAILED',
        originalTopic: 'fast-orchestrator-input'
      }
    }]
  });
};
```

### Retry Logic
```typescript
const executeStepWithRetry = async (
  step: ProcessingStep, 
  message: ProcessingMessage, 
  maxRetries: number = 3
): Promise<void> => {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      await executeStep(step, message);
      return; // Success
    } catch (error) {
      retryCount++;
      
      if (retryCount >= maxRetries) {
        throw error; // Final failure
      }
      
      // Exponential backoff
      await sleep(Math.pow(2, retryCount) * 1000);
    }
  }
};
```

## Configuration

### Environment Variables
```bash
# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=fast-orchestrator-group
INPUT_TOPIC=fast-orchestrator-input
DEAD_LETTER_TOPIC=fast-orchestrator-dead-letter

# gRPC Configuration
GRPC_PORT=50054

# Database Configuration
SPANNER_PROJECT_ID=gpp-g3-sg-local
SPANNER_INSTANCE_ID=sg-orchestrator-instance
SPANNER_DATABASE_ID=orchestration-db

# Service Configuration
SERVICE_NAME=fast-orchestrator-service
LOG_LEVEL=info
COUNTRY=SG
DEFAULT_CURRENCY=SGD

# Processing Configuration
MAX_RETRY_ATTEMPTS=3
PROCESSING_TIMEOUT_MS=30000
HIGH_VALUE_THRESHOLD=50000

# Downstream Services
LIMITCHECK_SERVICE_URL=localhost:50055
ACCOUNTING_SERVICE_URL=localhost:50056
VAM_MEDIATION_SERVICE_URL=localhost:50057
MDZ_MEDIATION_SERVICE_URL=localhost:50058
```

## Monitoring and Alerting

### Key Metrics
- Messages processed per minute
- Average processing time per message type
- Error rate by processing step
- Dead letter queue depth
- Service availability for downstream services

### Health Checks
```typescript
const performHealthCheck = async (): Promise<HealthStatus> => {
  const checks = await Promise.allSettled([
    checkKafkaConnectivity(),
    checkSpannerConnectivity(),
    checkDownstreamServices(),
    checkProcessingQueue()
  ]);
  
  return {
    status: checks.every(check => check.status === 'fulfilled') ? 'SERVING' : 'NOT_SERVING',
    details: checks.map(check => ({
      component: check.component,
      status: check.status,
      message: check.status === 'rejected' ? check.reason : 'OK'
    }))
  };
};
```

## Testing Strategy

### Unit Tests
- Orchestration engine logic
- Routing rules for Singapore market
- Step execution and error handling
- Business rules application
- Database operations

### Integration Tests
- End-to-end message processing
- Kafka integration with consumer groups
- Service-to-service communication
- Error recovery and retry mechanisms
- Dead letter queue processing

### Performance Tests
- High-volume message processing
- Concurrent processing capability
- Memory and CPU usage under load
- Database performance with large audit trails

## Success Criteria

- [ ] Successfully consume and process messages from fast-validation-service
- [ ] Implement comprehensive orchestration for all PACS message types
- [ ] Maintain sub-500ms average processing time per step
- [ ] Achieve 99.9% message processing success rate
- [ ] Comprehensive audit trail for all processing activities
- [ ] Robust error handling with dead letter queue processing
- [ ] Singapore market compliance for all routing rules
- [ ] Real-time monitoring and alerting capabilities

## Timeline

**Total Duration**: 4 weeks
**Key Milestones**:
- Week 1: Project setup, Kafka integration, database schema
- Week 2: Orchestration engine, routing rules, step management
- Week 3: Downstream service integration, error handling, monitoring
- Week 4: Testing, performance optimization, documentation

This implementation plan ensures the fast-orchestrator-service effectively coordinates PACS message processing through the Singapore payment pipeline while maintaining comprehensive audit trails and robust error handling capabilities. 