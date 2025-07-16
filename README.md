# G3 Payment Platform (GPPG3) - Singapore Payment Processing System

## 🏗️ **Project Overview**

The Singapore G3 Payment Platform (GPPG3) is a **complete microservices-based payment processing system** designed for high-performance PACS message processing with intelligent routing based on account systems (VAM/MDZ/MEPS).

## 🚀 **System Architecture**

### **Core Services**
- **🎯 Enrichment Service** (50052) - **DIRECT ENTRY POINT** for all payment messages
- **✅ Validation Service** (50053) - Message validation & Kafka publishing (PACS.003 only)
- **🎛️ Orchestrator** (3004) - Intelligent routing based on account systems (dual topic consumer)
- **🏦 Accounting Service** (8002) - Transaction processing
- **⚖️ Limit Check Service** (3006) - Transaction limit validation

### **Supporting Services**
- **🔍 Account Lookup** (50059) - Account system detection
- **📊 Reference Data** (50060) - Authentication method lookup
- **🔗 VAM/MDZ Mediation** - External system integration

## 🎯 **Key Features**

✅ **Direct Entry Architecture** - No request handler, enrichment service is the entry point  
✅ **Conditional Message Routing** - PACS.003 via validation, PACS.008 direct to Kafka  
✅ **Dual Topic Orchestration** - Unified processing from both `validated-messages` and `enriched-messages`  
✅ **Intelligent Account System Detection** - VAM/MDZ/MEPS routing  
✅ **Authentication Method Logic** - GROUPLIMIT, AFPTHENLIMIT, AFPONLY  
✅ **Kafka Async Processing** - Reliable message queuing  
✅ **gRPC High-Performance Communication** - Synchronous service calls  
✅ **Comprehensive Testing** - End-to-end validation with Playwright

## 🚀 **Quick Start**

### **1. Prerequisites**
```bash
# Install Node.js 18+ and Docker
node --version  # Should be 18+
docker --version
```

### **2. Setup Project**
```bash
# Clone and install dependencies
git clone <repository-url>
cd GPPG3
npm install

# Start infrastructure
docker-compose up -d kafka zookeeper

# Install all service dependencies
npm run services:install
```

### **3. Start Services**
```bash
# Start core services for development (no request handler needed)
npm run start:fast-enrichment &    # Entry point service
npm run start:fast-validation &    # For PACS.003 messages
npm run start:fast-orchestrator &  # Dual topic consumer

# Or use utilities scripts
cd utilities
./start-services.sh
```

### **4. Test the System**
```bash
# Run comprehensive tests
cd utilities
./comprehensive-test.sh

# Test specific flows
./simple-vam-mdz-e2e-test.js
```

## 📁 **Project Structure**

```
GPPG3/
├── 📄 README.md                           # This file
├── 📄 package.json                        # Monorepo workspace configuration
├── 🐳 docker-compose.yml                  # Service orchestration
├── 📂 docs/                               # 📚 All documentation
│   ├── 📂 guides/                         # Setup and technical guides
│   ├── 📂 reports/                        # Implementation and test reports
│   └── 📂 services/                       # Service-specific documentation
├── 📂 utilities/                          # 🛠️ Development and testing tools
├── 📂 fast-enrichment-service/            # 🎯 **ENTRY POINT** service (direct)
├── 📂 fast-validation-service/            # ✅ Message validation (PACS.003 only)
├── 📂 fast-orchestrator-service/          # 🎛️ Dual topic intelligent routing
├── 📂 fast-accounting-service/            # 🏦 Transaction processing
├── 📂 fast-limitcheck-service/            # ⚖️ Limit checking
├── 📂 fast-accountlookup-service/         # 🔍 Account system detection
├── 📂 fast-referencedata-service/         # 📊 Authentication method lookup
├── 📂 fast-vammediation-service/          # 🔗 VAM system integration
├── 📂 fast-mdzmediation-service/          # 🔗 MDZ system integration
└── 📂 pw-core/                            # 🧪 Core testing framework
```

### **Available Scripts**
```bash
# Service management
npm run services:install           # Install dependencies for all services
npm run services:build             # Build all services
npm run services:test              # Run tests for all services

# Individual service commands (no request handler)
npm run start:fast-enrichment      # Start enrichment service (entry point)
npm run start:fast-validation      # Start validation service
npm run start:fast-orchestrator    # Start orchestrator service

# Testing and utilities
npm run pw-core:build              # Build core testing framework
npm run pw-core:test               # Run core tests
```

### **Service Development**
Each service follows a consistent structure:
```
fast-[service-name]/
├── src/                    # TypeScript source code
├── proto/                  # gRPC protocol definitions
├── tests/                  # Playwright tests
├── package.json           # Service dependencies
├── README.md              # Service documentation
├── Dockerfile             # Container configuration
└── .env.example           # Environment variables
```

## 📚 **Documentation**

### **📂 Centralized Documentation in `docs/`**
- **[docs/README.md](docs/README.md)** - Complete documentation index
- **[docs/guides/](docs/guides/)** - Setup guides and technical documentation
- **[docs/reports/](docs/reports/)** - Implementation status and test reports
- **[docs/services/](docs/services/)** - Service-specific documentation

### **🛠️ Utilities & Testing**
- **[utilities/README.md](utilities/README.md)** - Development tools and scripts
- **[utilities/](utilities/)** - Testing scripts, monitoring tools, and utilities

## 🧪 **Testing**

### **Test Categories**
1. **Unit Tests** - Individual service functionality
2. **Integration Tests** - Service-to-service communication  
3. **End-to-End Tests** - Complete message flow validation
4. **Performance Tests** - Load testing and benchmarking

### **Running Tests**
```bash
# Navigate to utilities for comprehensive testing
cd utilities

# Run all tests
./comprehensive-test.sh

# Run specific test scenarios
./simple-vam-mdz-e2e-test.js       # VAM/MDZ routing tests
./test-limit-check-scenario.js     # Limit checking tests
```

## 🎯 **Message Flow**

### **Revised PACS Processing Flow**
```
1. Enrichment Service (50052) ← **DIRECT ENTRY** for all payment messages
2. Account Lookup (50059) ← Determines VAM/MDZ system
3. Reference Data (50060) ← Gets authentication method
4. Conditional Routing:
   - PACS.003 → Validation (50053) → Kafka (validated-messages) → Orchestrator (3004)
   - PACS.008 → Kafka (enriched-messages) → Orchestrator (3004)
5. Unified Orchestration → Accounting (8002) + Limit Check (3006) + VAM/MDZ Mediation
```

### **Account System Logic**
- **VAM System**: Account numbers starting with `999` or containing `VAM`
- **MDZ System**: All other account numbers  
- **Authentication**: GROUPLIMIT for government accounts, AFPTHENLIMIT for others

### **Kafka Topic Strategy**
- **`validated-messages`**: PACS.003 messages after validation
- **`enriched-messages`**: PACS.008 messages directly from enrichment
- **`accounting-messages`**: Messages for accounting processing
- **`limitcheck-messages`**: Messages for limit checking (GROUPLIMIT only)

### **Service Ports**
- **50052**: Enrichment Service (gRPC) - **ENTRY POINT**
- **50053**: Validation Service (gRPC) - PACS.003 validation only  
- **50059**: Account Lookup Service (gRPC)
- **50060**: Reference Data Service (gRPC)
- **3004**: Orchestrator Service (HTTP) - Dual topic consumer
- **3005**: VAM Mediation Service (HTTP)
- **3006**: Limit Check Service (HTTP)
- **8002**: Accounting Service (HTTP)
The following sequence diagram shows the complete end-to-end flow with **conditional routing** based on message type:

```mermaid
sequenceDiagram
    participant Client as External Client
    participant ES as Enrichment Service<br/>(50052 - Entry Point)
    participant AL as Account Lookup<br/>(50059)
    participant RD as Reference Data<br/>(50060)
    participant VS as Validation Service<br/>(50053)
    participant K1 as Kafka<br/>(validated-messages)
    participant K2 as Kafka<br/>(enriched-messages)
    participant OS as Orchestrator<br/>(3004)
    participant AS as Accounting Service<br/>(8002)
    participant LC as Limit Check<br/>(3006)
    participant VAM as VAM Mediation<br/>(3005)
    participant MDZ as MDZ Mediation<br/>(8004)

    Note over Client,MDZ: Revised Architecture - Direct Enrichment Entry

    Client->>+ES: 1. Direct Message (gRPC)<br/>PACS.008 or PACS.003
    
    Note over ES,RD: Enrichment Phase (Common)
    ES->>+AL: 2. LookupAccount(accountNumber)
    AL-->>-ES: 3. AccountInfo(system: VAM/MDZ, status: ACTIVE)
    
    ES->>+RD: 4. GetAuthMethod(accountInfo)
    RD-->>-ES: 5. AuthMethod(GROUPLIMIT/AFPTHENLIMIT)
    
    Note over ES,MDZ: Conditional Routing Based on Message Type
    
    alt PACS.003 Message
        ES->>+VS: 6a. ValidateMessage(enrichedMessage)
        Note over VS,K1: Validation & Publishing
        VS->>VS: 7a. XSD Validation
        VS->>K1: 8a. Publish to "validated-messages"
        VS-->>-ES: 9a. ValidationResult(SUCCESS)
        ES-->>-Client: 10a. ProcessingResponse(messageId, status: ACCEPTED)
        
        Note over K1,MDZ: Asynchronous Processing via Validation Flow
        K1->>+OS: 11a. Consume "validated-messages" (PACS.003)
    else PACS.008 Message
        ES->>K2: 6b. Publish to "enriched-messages"
        ES-->>-Client: 7b. ProcessingResponse(messageId, status: ACCEPTED)
        
        Note over K2,MDZ: Asynchronous Processing via Direct Flow
        K2->>+OS: 8b. Consume "enriched-messages" (PACS.008)
    end
    
    Note over OS,MDZ: Unified Orchestration Logic (Same for Both Flows)
    
    alt VAM Account System
        OS->>+AS: 12a. ProcessTransaction(message)
        AS-->>-OS: 13a. TransactionResult(SUCCESS)
        
        alt GROUPLIMIT Auth Method
            OS->>+LC: 14a. CheckLimits(transactionData)
            LC-->>-OS: 15a. LimitResult(APPROVED)
        end
        
        OS->>+VAM: 16a. SendToVAM(processedMessage)
        VAM-->>-OS: 17a. VAMResponse(SUCCESS)
        
    else MDZ Account System
        OS->>+AS: 12b. ProcessTransaction(message)
        AS-->>-OS: 13b. TransactionResult(SUCCESS)
        
        alt GROUPLIMIT Auth Method
            OS->>+LC: 14b. CheckLimits(transactionData)
            LC-->>-OS: 15b. LimitResult(APPROVED)
        end
        
        OS->>+MDZ: 16b. SendToMDZ(processedMessage)
        MDZ-->>-OS: 17b. MDZResponse(SUCCESS)
    end
    
    Note over OS,Client: Completion Flow (Unified)
    OS->>K1: 18. Publish completion to "pacs-response-messages"
    
    Note over Client,MDZ: End-to-End Processing Complete
```

### **🔄 Processing Phases Explained**

1. **🎯 Direct Entry Phase** (Steps 1-5)
   - Client sends messages directly to Enrichment Service (no request handler)
   - Enrichment Service handles account lookup and reference data retrieval
   - Same enrichment logic for both PACS.003 and PACS.008

2. **🚦 Conditional Routing Phase** (Steps 6-11)
   - **PACS.003**: Enrichment → Validation → Kafka (`validated-messages`) → Orchestrator
   - **PACS.008**: Enrichment → Kafka (`enriched-messages`) → Orchestrator
   - Client receives immediate response after routing decision

3. **⚡ Unified Orchestration Phase** (Steps 12-17)
   - Orchestrator processes both message types with the same business logic
   - VAM/MDZ routing based on account system (not message type)
   - Authentication method handling remains consistent
   - Accounting and limit checking apply to both flows

4. **✅ Completion Phase** (Step 18)
   - Single completion flow regardless of entry path
   - PACS.002 response generation and publishing

## 🔧 **Configuration**

### **Environment Variables**
Key configuration files:
- **`.env.example`** - Template for environment variables
- **`docker-compose.yml`** - Service orchestration configuration
- **`package.json`** - Workspace and script configuration

### **Service Ports**
- **50051**: Request Handler (gRPC)
- **50052**: Enrichment Service (gRPC)  
- **50053**: Validation Service (gRPC)
- **50059**: Account Lookup Service (gRPC)
- **50060**: Reference Data Service (gRPC)
- **3004**: Orchestrator Service (HTTP)
- **3005**: VAM Mediation Service (HTTP)
- **3006**: Limit Check Service (HTTP)
- **8002**: Accounting Service (HTTP)
- **9092**: Kafka Broker

## 🤝 **Contributing**

1. **Setup Development Environment** - Follow Quick Start guide
2. **Review Documentation** - Check `docs/` for comprehensive guides
3. **Run Tests** - Use `utilities/` scripts for testing
4. **Follow Service Structure** - Maintain consistent patterns across services
5. **Update Documentation** - Keep docs current with changes

## 📄 **License**

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

**🚀 Ready to start? Check out the [Quick Start](#-quick-start) guide or explore the [documentation](docs/README.md)!** 