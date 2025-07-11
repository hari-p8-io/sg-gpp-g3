# G3 Payment Platform (GPPG3) - Singapore Payment Processing System

## 🏗️ **Project Overview**

The Singapore G3 Payment Platform (GPPG3) is a **complete microservices-based payment processing system** designed for high-performance PACS message processing with intelligent routing based on account systems (VAM/MDZ/MEPS).

## 🚀 **System Architecture**

### **Core Services**
- **🎯 Request Handler** (50051) - PACS message entry point
- **🔄 Enrichment Service** (50052) - Central orchestration hub  
- **✅ Validation Service** (50053) - Message validation & Kafka publishing
- **🎛️ Orchestrator** (3004) - Intelligent routing based on account systems
- **🏦 Accounting Service** (8002) - Transaction processing
- **⚖️ Limit Check Service** (3006) - Transaction limit validation

### **Supporting Services**
- **🔍 Account Lookup** (50059) - Account system detection
- **📊 Reference Data** (50060) - Authentication method lookup
- **🔗 VAM/MDZ Mediation** - External system integration

## 🎯 **Key Features**

✅ **Complete PACS Message Processing** - PACS.008, PACS.002, CAMT messages  
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
# Start all services for development
npm run start:fast-requesthandler &
npm run start:fast-enrichment &
npm run start:fast-validation &
npm run start:fast-orchestrator &

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
├── 📂 fast-requesthandler-service/        # 🎯 Entry point service
├── 📂 fast-enrichment-service/            # 🔄 Central orchestration hub
├── 📂 fast-validation-service/            # ✅ Message validation
├── 📂 fast-orchestrator-service/          # 🎛️ Intelligent routing
├── 📂 fast-accounting-service/            # 🏦 Transaction processing
├── 📂 fast-limitcheck-service/            # ⚖️ Limit checking
├── 📂 fast-accountlookup-service/         # 🔍 Account system detection
├── 📂 fast-referencedata-service/         # 📊 Authentication method lookup
├── 📂 fast-vammediation-service/          # 🔗 VAM system integration
├── 📂 fast-mdzmediation-service/          # 🔗 MDZ system integration
└── 📂 pw-core/                            # 🧪 Core testing framework
```

## 🛠️ **Development**

### **Available Scripts**
```bash
# Service management
npm run services:install           # Install dependencies for all services
npm run services:build             # Build all services
npm run services:test              # Run tests for all services

# Individual service commands
npm run start:fast-requesthandler  # Start request handler
npm run start:fast-enrichment      # Start enrichment service
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

### **PACS.008 Processing Flow**
```
1. Request Handler (50051) ← PACS.008 message
2. Enrichment Service (50052) ← Orchestrates enrichment
3. Account Lookup (50059) ← Determines VAM/MDZ system
4. Reference Data (50060) ← Gets authentication method
5. Validation Service (50053) ← Validates and publishes to Kafka
6. Orchestrator (3004) ← Routes based on account system
7. Accounting (8002) ← Processes transaction
8. Limit Check (3006) ← Validates limits (if required)
9. VAM/MDZ Mediation ← External system integration
```

### **Account System Logic**
- **VAM System**: Account numbers starting with `999` or containing `VAM`
- **MDZ System**: All other account numbers  
- **Authentication**: GROUPLIMIT for government accounts, AFPTHENLIMIT for others

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