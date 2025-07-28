# Revised Implementation Plan - Fast Payments System
## Service Renaming and Responsibility Updates

### Last Updated: December 13, 2024
### Status: **PLANNING PHASE**

---

## 🎯 **Overview of Changes**

This document outlines the comprehensive implementation plan for the revised fast payments system architecture based on new requirements. The changes include service renaming, responsibility redistribution, technology stack updates, and communication protocol modifications.

---

## 📋 **Service Renaming Matrix**

| Current Service Name | New Service Name | Technology Stack | Key Changes |
|---------------------|------------------|------------------|-------------|
| `fast-inwd-processor-service` | `fast-inwd-businessval-service` | TypeScript/gRPC + fast-core | REST API integration, no validation logic |
| `fast-ddi-validation-service` | **REMOVED** | N/A | Service no longer required |
| `fast-requesthandler-service` | **REMOVED** | N/A | Responsibility moved to orchestrator |
| `fast-orchestrator-service` | `fast-inwd-orchestrator-service` | **Java Spring Boot + fast-core** | JSON transformation, deduplication, configurable workflows |
| `fast-accounting-service` | `fast-accounting-service` | Node.js + fast-core | JSON consumption over Kafka |
| `fast-vammediation-service` | `fast-vammediation-service` | Node.js + fast-core | JSON consumption over Kafka |
| `fast-limitcheck-service` | `fast-limitcheck-service` | TypeScript + fast-core | JSON consumption over Kafka |

---

## 🏗️ **Revised Architecture Flow**

### **New Message Processing Pipeline (UPDATED):**

```
External Client
    ↓ (gRPC)
fast-inwd-businessval-service (Port 50052) [RENAMED + ENHANCED]
    ├─ (gRPC) → fast-accountlookup-service (Port 50059)
    ├─ (REST) → fast-referencedata-service [NEW: REST API]
    └─ (REST) → fast-mandatelookup-service (for PACS003)
    ↓ (Synchronous Response: PACS002/CAMT029)
External Client ← fast-inwd-businessval-service

External Client (Based on Response)
    ↓ (Kafka: enriched-messages)
fast-inwd-orchestrator-service [NEW: Java Spring Boot]
    ├─ Spanner DB (Deduplication Check)
    ├─ JSON Transformation (PACS/CAMT → JSON)
    └─ (Kafka: json-messages)
        ├─ fast-accounting-service
        ├─ fast-vammediation-service
        └─ fast-limitcheck-service
```

### **Key Architectural Changes:**
- 🔄 **Direct Client Integration**: External client calls `fast-inwd-businessval-service` directly
- ⚡ **Immediate Response**: Service returns PACS002/CAMT029 after validation
- 🔀 **Client-Driven Kafka**: External client sends message to orchestrator based on response
- 📤 **Asynchronous Processing**: Orchestrator handles downstream processing independently

### **🔄 Architectural Benefits of This Change:**
- 🚀 **Faster Response Times**: Immediate PACS002/CAMT029 responses without waiting for full processing
- 🔀 **Decoupled Processing**: Synchronous validation separated from asynchronous downstream processing
- 🎯 **Client Control**: External clients have full control over when to trigger async processing
- ⚖️ **Better Load Distribution**: Validation load separated from processing load
- 🛡️ **Improved Resilience**: Validation success doesn't depend on downstream service availability

---

## 🚀 **Detailed Service Implementation Plans**

### **1. fast-inwd-businessval-service (RENAMED + ENHANCED)**

#### **Current State:** `fast-inwd-processor-service`
- Port: 50052
- Technology: TypeScript, gRPC
- Responsibilities: Account lookup coordination, reference data via gRPC

#### **Target State:** `fast-inwd-businessval-service`
- **Port:** 50052 (unchanged)
- **Technology:** TypeScript, gRPC + REST clients + fast-core
- **Enhanced Responsibilities:**
  - ✅ **Account Lookup Integration:** Calls `fast-accountlookup-service` (existing)
  - 🆕 **REST API Integration:** Calls reference data service via REST instead of gRPC
  - ✅ **Mandate Lookup:** Calls `fast-mandatelookup-service` for PACS003 messages (existing)
  - 🆕 **Business Logic Processing:** Core business processing without validation overhead
  - 🆕 **Immediate Response Generation:** Returns PACS002/CAMT029 responses synchronously
  - 🆕 **Direct Client Integration:** Receives requests directly from external clients
  - 🆕 **fast-core Integration:** Uses common utilities and patterns from fast-core library

#### **Implementation Tasks:**
1. **Directory Renaming:**
   ```bash
   fast-inwd-processor-service/ → fast-inwd-businessval-service/
   ```

2. **REST Client Integration:**
   ```typescript
   // New REST client for reference data
   class ReferenceDataRestClient {
     async lookupAuthMethod(accountId: string): Promise<AuthMethodResponse> {
       // HTTP REST call instead of gRPC
     }
   }
   ```

3. **Proto File Updates:**
   ```
   fast-inwd-businessval-service/proto/gpp/g3/
   ├── businessval/
   │   ├── businessval_service.proto
   │   └── businessval_types.proto
   ```

4. **Service Integration Changes:**
   - Replace gRPC client for reference data with HTTP REST client
   - Maintain existing gRPC integration for account lookup
   - Maintain existing REST integration for mandate lookup (PACS003)

5. **fast-core Integration:**
   ```typescript
   // Package.json dependencies
   {
     "dependencies": {
       "@gpp/fast-core": "^1.0.0",
       // other dependencies...
     }
   }
   
   // Usage in service
   import { Logger, MessageUtils, ResponseBuilder } from '@gpp/fast-core';
   ```

6. **Response Generation Logic:**
   ```typescript
   // Simplified response generation using fast-core
   import { ResponseBuilder } from '@gpp/fast-core';
   
   class ResponseGenerationService {
     generatePacs002Response(request: ProcessorRequest, processingResult: ProcessingResult): Pacs002Response {
       return ResponseBuilder.createPacs002(request, processingResult);
     }
     
     generateCamt029Response(request: ProcessorRequest, rejectionReason: string): Camt029Response {
       return ResponseBuilder.createCamt029(request, rejectionReason);
     }
   }
   ```

7. **Direct Client Integration:**
   - Accept direct gRPC calls from external clients (no request handler needed)
   - Implement synchronous request-response pattern
   - Use fast-core utilities for common operations

---

### **2. fast-ddi-validation-service (REMOVAL)**

#### **Current State:** Active service
- Port: 50053
- Technology: TypeScript, gRPC
- Responsibilities: Message validation, Kafka publishing

#### **Target State:** **REMOVED**
- All validation logic to be incorporated into other services
- Kafka publishing responsibility moved to orchestrator

#### **Migration Tasks:**
1. **Data Migration:**
   - Move validation logic to `fast-inwd-businessval-service`
   - Move Kafka publishing to `fast-inwd-orchestrator-service`

2. **Service Decommission:**
   ```bash
   # Remove service directory
   rm -rf fast-ddi-validation-service/
   ```

3. **Configuration Updates:**
   - Remove service from Docker Compose
   - Remove service from package.json workspaces
   - Update dependent service configurations

---

### **3. fast-inwd-orchestrator-service (RENAMED + REIMPLEMENTED)**

#### **Current State:** `fast-orchestrator-service`
- Port: 3004
- Technology: Node.js/Express + Kafka
- Responsibilities: Message routing based on business rules

#### **Target State:** `fast-inwd-orchestrator-service`
- **Port:** 8080 (Spring Boot default)
- **Technology:** **Java Spring Boot + Kafka + Google Cloud Spanner + fast-core**
- **Enhanced Responsibilities:**
  - 🆕 **Direct Kafka Consumption:** Receives messages from external clients via Kafka
  - 🆕 **Configurable Workflows:** Credit transfer inward and direct debit workflows
  - 🆕 **Deduplication Check:** Against Spanner database
  - 🆕 **Message Transformation:** PACS/CAMT XML → JSON format (no validation)
  - 🆕 **JSON Publishing:** Send JSON to downstream services via Kafka
  - ✅ **Orchestration Logic:** Enhanced routing (existing)
  - 🆕 **Asynchronous Processing:** Handles post-processing independently
  - 🆕 **fast-core Integration:** Uses common Java utilities from fast-core
  - 🆕 **Playwright Testing:** Comprehensive end-to-end testing with pw-core

#### **Implementation Tasks:**

1. **Java Spring Boot Project Structure:**
   ```
   fast-inwd-orchestrator-service/
   ├── src/main/java/com/gpp/g3/orchestrator/
   │   ├── OrchestratorApplication.java
   │   ├── config/
   │   │   ├── KafkaConfig.java
   │   │   ├── SpannerConfig.java
   │   │   └── WorkflowConfig.java
   │   ├── service/
   │   │   ├── DeduplicationService.java
   │   │   ├── MessageTransformationService.java
   │   │   ├── WorkflowOrchestrationService.java
   │   │   └── JsonPublishingService.java
   │   ├── model/
   │   │   ├── PaymentMessage.java
   │   │   ├── JsonMessage.java
   │   │   └── WorkflowConfig.java
   │   └── controller/
   │       └── OrchestratorController.java
   ├── src/main/resources/
   │   ├── application.yml
   │   ├── workflows/
   │   │   ├── credit-transfer-inward.yml
   │   │   └── direct-debit.yml
   │   └── schema/
   │       └── json-message-schema.json
   ├── src/test/java/com/gpp/g3/orchestrator/
   │   ├── integration/
   │   │   ├── OrchestratorIntegrationTest.java
   │   │   ├── KafkaIntegrationTest.java
   │   │   └── SpannerIntegrationTest.java
   │   ├── e2e/
   │   │   ├── OrchestratorE2ETest.java
   │   │   ├── WorkflowE2ETest.java
   │   │   └── DeduplicationE2ETest.java
   │   └── config/
   │       └── TestConfiguration.java
   └── pom.xml
   ```

2. **Key Java Dependencies:**
   ```xml
   <dependencies>
     <dependency>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-web</artifactId>
     </dependency>
     <dependency>
       <groupId>org.springframework.kafka</groupId>
       <artifactId>spring-kafka</artifactId>
     </dependency>
     <dependency>
       <groupId>com.google.cloud</groupId>
       <artifactId>google-cloud-spanner-spring-boot-starter</artifactId>
     </dependency>
     <dependency>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-json</artifactId>
     </dependency>
     <dependency>
       <groupId>com.gpp</groupId>
       <artifactId>fast-core-java</artifactId>
       <version>1.0.0</version>
     </dependency>
     
     <!-- Test Dependencies -->
     <dependency>
       <groupId>com.gpp</groupId>
       <artifactId>pw-core</artifactId>
       <version>1.0.0</version>
       <scope>test</scope>
     </dependency>
     <dependency>
       <groupId>com.microsoft.playwright</groupId>
       <artifactId>playwright</artifactId>
       <version>1.40.0</version>
       <scope>test</scope>
     </dependency>
   </dependencies>
   ```

3. **Spanner Database Schema:**
   ```sql
   CREATE TABLE DeduplicationCache (
     message_id STRING(36) NOT NULL,
     message_hash STRING(64) NOT NULL,
     processing_timestamp TIMESTAMP NOT NULL,
     expiry_timestamp TIMESTAMP NOT NULL,
   ) PRIMARY KEY (message_id);
   
   CREATE INDEX idx_message_hash ON DeduplicationCache(message_hash);
   ```

4. **Configurable Workflow System:**
   ```yaml
   # credit-transfer-inward.yml
   workflow:
     name: "credit-transfer-inward"
     steps:
       - name: "deduplication-check"
         service: "DeduplicationService"
       - name: "pacs-to-json-transform"
         service: "MessageTransformationService"
       - name: "publish-to-downstream"
         service: "JsonPublishingService"
         targets: ["accounting", "vammediation", "limitcheck"]
   ```

5. **JSON Message Structure:**
   ```json
   {
     "messageId": "uuid",
     "puid": "G3I_identifier",
     "messageType": "PACS008",
     "processedAt": "2024-12-13T10:00:00Z",
     "paymentData": {
       "amount": "1000.00",
       "currency": "SGD",
       "debtorAccount": "123456789",
       "creditorAccount": "987654321"
     },
     "enrichmentData": {
       "accountSystem": "VAM",
       "authMethod": "GROUPLIMIT",
       "accountInfo": {...}
     },
     "workflow": "credit-transfer-inward"
   }
   ```

6. **Playwright Testing Implementation:**
   ```java
   // Example E2E test using pw-core
   @SpringBootTest
   @TestPropertySource(locations = "classpath:application-test.properties")
   public class OrchestratorE2ETest extends PwCoreBaseTest {
     
     @Test
     public void testCreditTransferWorkflow() {
       // Given: A credit transfer message
       PaymentMessage message = createTestCreditTransferMessage();
       
       // When: Message is sent to Kafka
       kafkaTemplate.send("enriched-messages", message);
       
       // Then: Verify downstream services receive JSON
       pwCore.waitForKafkaMessage("json-accounting-messages");
       pwCore.waitForKafkaMessage("json-vammediation-messages");
       pwCore.waitForKafkaMessage("json-limitcheck-messages");
       
       // And: Verify deduplication entry created
       pwCore.verifySpannerRecord("DeduplicationCache", message.getMessageId());
     }
     
     @Test
     public void testDeduplicationPrevention() {
       PaymentMessage originalMessage = createTestMessage();
       PaymentMessage duplicateMessage = createTestMessage(originalMessage.getMessageId());
       
       // Send original message
       kafkaTemplate.send("enriched-messages", originalMessage);
       pwCore.waitForProcessingComplete();
       
       // Send duplicate message
       kafkaTemplate.send("enriched-messages", duplicateMessage);
       
       // Verify duplicate is rejected
       pwCore.verifyNoDuplicateProcessing();
     }
   }
   ```

7. **fast-core Integration Examples:**
   ```java
   // Using fast-core utilities
   import com.gpp.fastcore.kafka.KafkaPublisher;
   import com.gpp.fastcore.transformation.MessageTransformer;
   import com.gpp.fastcore.deduplication.DeduplicationService;
   import com.gpp.fastcore.logging.StructuredLogger;
   
   @Service
   public class OrchestrationService {
     
     @Autowired
     private KafkaPublisher kafkaPublisher;
     
     @Autowired
     private MessageTransformer transformer;
     
     @Autowired
     private StructuredLogger logger;
     
     public void processMessage(PaymentMessage message) {
       logger.info("Processing message", Map.of("messageId", message.getMessageId()));
       
       // Use fast-core transformation
       JsonMessage jsonMessage = transformer.transformToJson(message);
       
       // Use fast-core Kafka publishing
       kafkaPublisher.publishToMultipleTopics(jsonMessage, getTargetTopics());
     }
   }
   ```

---

### **4. fast-requesthandler-service (REMOVED)**

#### **Current State:** Active service
- Port: 50051
- Technology: TypeScript, gRPC
- Responsibilities: Entry point for external clients, routing to enrichment service

#### **Target State:** **REMOVED**
- External clients now call `fast-inwd-businessval-service` directly
- Orchestrator service handles any required request coordination

#### **Migration Tasks:**
1. **Service Decommission:**
   ```bash
   # Remove service directory
   rm -rf fast-requesthandler-service/
   ```

2. **Configuration Updates:**
   - Remove service from Docker Compose
   - Remove service from package.json workspaces
   - Update client configurations to call businessval service directly

3. **Client Migration:**
   - Update external clients to call `fast-inwd-businessval-service:50052` directly
   - Remove any references to port 50051 in client configurations

---

### **5. Downstream Services Updates**

#### **fast-accounting-service, fast-vammediation-service, fast-limitcheck-service**

#### **Current State:**
- Consume messages via Kafka in various formats
- Mixed message structures
- Independent processing logic

#### **Target State:**
- **Unified JSON consumption** from orchestrator
- **Standardized message format**
- **fast-core integration** for common utilities
- **Simplified processing logic** (no validation overhead)

#### **Implementation Tasks:**

1. **fast-core Integration:**
   ```javascript
   // Package.json dependencies for Node.js services
   {
     "dependencies": {
       "@gpp/fast-core": "^1.0.0",
       // other dependencies...
     }
   }
   ```

2. **JSON Message Consumption with fast-core:**
   ```javascript
   // Example for fast-accounting-service
   const { Logger, MessageProcessor, KafkaConsumer } = require('@gpp/fast-core');
   
   async function processJsonMessage(jsonMessage) {
     const logger = Logger.create({ service: 'fast-accounting' });
     const { messageId, paymentData, enrichmentData, workflow } = jsonMessage;
     
     logger.info('Processing payment message', { messageId, workflow });
     
     // Use fast-core utilities for processing
     const accountingResult = await MessageProcessor.processPayment({
       amount: paymentData.amount,
       currency: paymentData.currency,
       accounts: {
         debtor: paymentData.debtorAccount,
         creditor: paymentData.creditorAccount
       },
       system: enrichmentData.accountSystem,
       workflow: workflow
     });
     
     return accountingResult;
   }
   ```

3. **Kafka Topic Updates:**
   ```yaml
   # Updated Kafka Topics
   topics:
     - name: "enriched-messages"               # External clients → Orchestrator
       partitions: 3
       replication: 2
     - name: "json-accounting-messages"        # Orchestrator → Accounting
       partitions: 3
       replication: 2
     - name: "json-vammediation-messages"      # Orchestrator → VAM Mediation
       partitions: 3
       replication: 2
     - name: "json-limitcheck-messages"        # Orchestrator → Limit Check
       partitions: 3
       replication: 2
   ```

4. **External Client Integration:**
   ```javascript
   // External client logic
   async function processPaymentMessage(pacsMessage) {
     // Step 1: Call businessval service for validation
     const validationResponse = await callBusinessValService(pacsMessage);
     
     // Step 2: Check PACS002/CAMT029 response
     if (validationResponse.success) {
       // Step 3: Send to orchestrator for async processing
       await publishToKafka('enriched-messages', {
         messageId: validationResponse.messageId,
         originalMessage: pacsMessage,
         enrichmentData: validationResponse.enrichmentData,
         validationResult: validationResponse.validationResult
       });
     }
     
     return validationResponse; // Return PACS002/CAMT029 to calling system
   }
   ```

---

## 👥 **External Client Responsibilities**

With the new architecture, external clients have enhanced responsibilities:

### **Client Integration Requirements:**
1. **Direct gRPC Integration**: Call `fast-inwd-businessval-service` directly
2. **Response Handling**: Process PACS002/CAMT029 responses appropriately
3. **Kafka Publishing**: Send messages to orchestrator based on validation results
4. **Error Handling**: Handle both synchronous and asynchronous error scenarios

### **Client Implementation Example:**
```javascript
// External client implementation pattern
class PaymentProcessingClient {
  async processPayment(pacsMessage) {
    try {
      // Step 1: Synchronous validation
      const validationResponse = await this.callBusinessValService(pacsMessage);
      
      // Step 2: Handle immediate response
      await this.handlePacs002Response(validationResponse);
      
      // Step 3: Conditional async processing
      if (validationResponse.success && this.shouldTriggerAsyncProcessing(validationResponse)) {
        await this.publishForAsyncProcessing(pacsMessage, validationResponse);
      }
      
      return validationResponse;
    } catch (error) {
      // Handle errors appropriately
      return this.generateErrorResponse(error);
    }
  }
}
```

### **Client Configuration:**
```yaml
# External client configuration
gpp:
  businessval:
    service:
      url: "grpc://fast-inwd-businessval-service:50052"
      timeout: 5000ms
  kafka:
    brokers: ["kafka1:9092", "kafka2:9092"]
    topics:
      enriched-messages: "enriched-messages"
    producer:
      acks: "all"
      retries: 3
```

---

## 📊 **Migration Timeline**

### **Phase 1: Service Renaming and fast-core Integration (Week 1-2)**
1. ✅ Rename `fast-inwd-processor-service` → `fast-inwd-businessval-service`
2. ✅ Remove `fast-requesthandler-service` completely
3. ✅ Integrate fast-core libraries across all services
4. ✅ Implement REST client for reference data service
5. ✅ Update proto files and service definitions
6. ✅ Remove all validation logic (schema, currency, country checks)

### **Phase 2: Orchestrator Migration with Testing (Week 3-4)**
1. 🆕 Implement `fast-inwd-orchestrator-service` in Java Spring Boot
2. 🆕 Integrate fast-core Java libraries
3. 🆕 Set up Spanner database for deduplication
4. 🆕 Implement configurable workflow system
5. 🆕 Create message transformation logic (XML → JSON, no validation)
6. 🆕 Implement comprehensive Playwright tests using pw-core

### **Phase 3: Service Integration (Week 5-6)**
1. 🔄 Update downstream services for JSON consumption with fast-core
2. 🔄 Implement new Kafka topics and message structures
3. 🔄 Update routing and orchestration logic
4. 🔄 End-to-end testing with pw-core test suites

### **Phase 4: Testing and Deployment (Week 7-8)**
1. 🧪 End-to-end testing of new architecture
2. 🧪 Performance testing and optimization
3. 🚀 Gradual deployment and monitoring
4. 📚 Documentation updates

---

## 🔧 **Configuration Updates Required**

### **Docker Compose Updates:**
```yaml
version: '3.8'
services:
  fast-inwd-businessval-service:  # renamed, integrated with fast-core
    build: ./fast-inwd-businessval-service
    ports:
      - "50052:50052"
    environment:
      - REFERENCE_DATA_REST_URL=http://fast-referencedata-service:8080
      - FAST_CORE_LOG_LEVEL=INFO
      
  fast-inwd-orchestrator-service:  # reimplemented in Java with fast-core
    build: ./fast-inwd-orchestrator-service
    ports:
      - "8080:8080"
    environment:
      - SPRING_CLOUD_GCP_SPANNER_INSTANCE_ID=fast-payments
      - SPRING_CLOUD_GCP_SPANNER_DATABASE=deduplication
      - FAST_CORE_ENVIRONMENT=production
      - PW_CORE_TEST_MODE=false
      
  # Removed services:
  # - fast-requesthandler-service (functionality moved to orchestrator)
  # - fast-ddi-validation-service (no longer required)
```

### **Environment Variables:**
```bash
# fast-inwd-businessval-service
REFERENCE_DATA_REST_URL=http://localhost:8080/api/v1/reference-data
MANDATE_LOOKUP_REST_URL=http://localhost:3005/api/v1/mandate-lookup

# fast-inwd-orchestrator-service
SPANNER_INSTANCE_ID=fast-payments-instance
SPANNER_DATABASE_ID=deduplication-db
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
WORKFLOW_CONFIG_PATH=/app/config/workflows
```

---

## 🎯 **Success Criteria**

### **Technical Requirements:**
- ✅ All services renamed and operational with fast-core integration
- ✅ fast-requesthandler-service completely removed
- ✅ fast-ddi-validation-service completely removed
- ✅ REST API integration for reference data working
- ✅ PACS002/CAMT029 response generation working correctly
- ✅ Direct client integration with businessval service functional
- ✅ External client Kafka publishing operational
- ✅ Java Spring Boot orchestrator deployed and functional
- ✅ Spanner deduplication working correctly
- ✅ JSON message transformation accurate (no validation logic)
- ✅ Downstream services consuming JSON successfully
- ✅ Comprehensive Playwright test coverage using pw-core
- ✅ All validation logic removed from business processing

### **Performance Requirements:**
- ⚡ Synchronous validation response (PACS002/CAMT029) < 200ms
- ⏱️ Asynchronous processing latency < 500ms end-to-end
- 📈 Support for 1000+ messages/minute throughput
- 🔄 Deduplication check < 50ms average
- 💾 JSON transformation < 100ms average
- 🚀 External client Kafka publishing < 50ms

### **Operational Requirements:**
- 📊 Comprehensive monitoring and alerting
- 📝 Updated documentation and runbooks
- 🧪 Full test coverage for new components
- 🔧 Zero-downtime deployment capability

---

## 🚨 **Risk Mitigation**

### **High-Risk Areas:**
1. **Spanner Integration:** New database dependency
   - **Mitigation:** Implement fallback caching, comprehensive testing
   
2. **Java Spring Boot Migration:** Technology stack change
   - **Mitigation:** Parallel development, gradual migration
   
3. **Message Format Changes:** Breaking changes for downstream services
   - **Mitigation:** Backward compatibility, phased rollout

### **Rollback Plan:**
- Maintain current `fast-orchestrator-service` during transition
- Implement feature flags for gradual migration
- Database backup and restore procedures for Spanner
- Kafka topic retention for message replay capability

---

## 📚 **Documentation Updates Required**

1. **API Documentation:** Updated REST API specs
2. **Architecture Diagrams:** New service interaction flows
3. **Deployment Guides:** Java Spring Boot deployment procedures
4. **Operational Runbooks:** Monitoring, troubleshooting, and maintenance
5. **Developer Guides:** Local development setup for new architecture

---

*This implementation plan provides a comprehensive roadmap for the revised fast payments system architecture. Each phase includes specific deliverables, success criteria, and risk mitigation strategies to ensure successful implementation.* 