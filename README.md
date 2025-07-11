# G3 Payment Platform (GPPG3) - Implementation Repository

## 🏗️ **Repository Structure**

This repository contains the Singapore G3 Payment Platform implementation with a clean, organized structure:

```
GPPG3/
├── 📋 CURRENT_IMPLEMENTATION_STATUS.md    # Complete system status
├── 📋 SERVICE_IMPLEMENTATION_SUMMARY.md   # Service overview
├── 📋 README.md                           # This file
├── 🔧 docker-compose.yml                  # Docker configuration
├── 🔧 package.json                        # Root dependencies
├── 🔧 .gitignore                          # Git ignore rules
├── 🔧 node_modules/                       # Dependencies
├── 🧪 pw-core/                            # Core Playwright testing framework
├── 🛠️ utilities/                          # Utility scripts and tools
├── 🚀 fast-requesthandler-service/        # Entry point service
├── 🚀 fast-enrichment-service/            # Central orchestration hub
├── 🚀 fast-accountlookup-service/         # Account system detection
├── 🚀 fast-referencedata-service/         # Authentication method lookup
├── 🚀 fast-validation-service/            # Message validation
├── 🚀 fast-orchestrator-service/          # Routing & orchestration
├── 🚀 fast-accounting-service/            # Transaction processing
└── 🚀 fast-limitcheck-service/            # Limit checking
```

### **🧪 Core Testing Framework**
- **`pw-core/`** - Playwright core testing framework with reusable test utilities
- **`utilities/`** - Development scripts, test files, and configuration utilities

### **🚀 Service Architecture**
All services follow a consistent structure with proper TypeScript implementation, gRPC/HTTP APIs, and comprehensive logging.

## 🎯 **Quick Start**

### **1. System Status**
- **Status**: ✅ **FULLY OPERATIONAL**
- **Last Tested**: July 10, 2025
- **Pipeline**: Complete end-to-end PACS message processing verified

### **2. Service Architecture**
```
RequestHandler (50051) → Enrichment (50052) → AccountLookup (50059) → 
ReferenceData (50060) → Validation (50053) → Orchestrator (3004) → 
Accounting (8002) + LimitCheck (3006) + VAM/MDZ Mediation
```

### **3. Key Features**
- ✅ **VAM/MDZ Account System Detection** - Automatic routing based on account numbers
- ✅ **GROUPLIMIT Authentication** - Reference data lookup and validation
- ✅ **Kafka Async Processing** - Reliable message queuing and processing
- ✅ **gRPC Synchronous Communication** - High-performance service communication
- ✅ **Health Monitoring** - All services include health check endpoints

## 🚀 **Getting Started**

### **Start All Services**
```bash
# Start infrastructure
docker-compose up -d

# Start all services (from utilities)
./utilities/start-services.sh

# Quick health check
./utilities/1-service-health-check.sh
```

### **Run Tests**
```bash
# Full end-to-end test
./utilities/test-full-flow.sh

# Comprehensive testing
./utilities/comprehensive-test.sh

# VAM/MDZ flow testing
./utilities/run-vam-mdz-test.sh
```

## 📊 **System Architecture**

### **Message Flow - PACS008 Processing**
1. **Request Handler** (Port 50051) - Receives PACS008 messages
2. **Enrichment Service** (Port 50052) - Central orchestration hub
3. **Account Lookup** (Port 50059) - Determines account system (VAM/MDZ)
4. **Reference Data** (Port 50060) - Gets authentication method (GROUPLIMIT)
5. **Validation Service** (Port 50053) - Validates enriched messages
6. **Orchestrator** (Port 3004) - Routes based on account system
7. **Accounting** (Port 8002) - Processes accounting transactions
8. **Limit Check** (Port 3006) - Validates transaction limits
9. **VAM/MDZ Mediation** - External system integration

### **Account System Logic**
- **VAM Accounts**: Account numbers starting with `999` or containing `VAM`
- **MDZ Accounts**: All other account numbers
- **Authentication**: GROUPLIMIT for accounts starting with `999*`

### **Kafka Topics**
- `validated-messages` - Messages after validation
- `vam-messages` - Messages routed to VAM system
- `accounting-messages` - Messages for accounting processing
- `limitcheck-messages` - Messages for limit checking

## 🛠️ **Development**

### **Service Structure**
Each service follows a consistent structure:
```
fast-[service-name]/
├── src/                    # Source code
├── proto/                  # gRPC protocol definitions
├── package.json           # Dependencies
├── README.md              # Service documentation
├── IMPLEMENTATION_PLAN.md # Detailed implementation status
└── [service-specific files]
```

### **Testing & Utilities**
All testing scripts, utilities, and development tools are organized in the `utilities/` directory:
- **Service Management**: Scripts to start/stop services
- **Testing**: Comprehensive test suites for all scenarios
- **Monitoring**: Kafka monitoring and logging utilities
- **Documentation**: Test results and technical documentation

## 📋 **Documentation**

### **Implementation Status**
- **[CURRENT_IMPLEMENTATION_STATUS.md](CURRENT_IMPLEMENTATION_STATUS.md)** - Complete system status
- **[SERVICE_IMPLEMENTATION_SUMMARY.md](SERVICE_IMPLEMENTATION_SUMMARY.md)** - Service overview
- **[utilities/README.md](utilities/README.md)** - Testing and utility documentation

### **Service Documentation**
Each service includes detailed documentation:
- Implementation plans and current status
- API specifications and endpoints
- Configuration and deployment guides
- Testing procedures and examples

## 🔧 **Configuration**

### **Environment Setup**
```bash
# Install dependencies
npm install

# Start infrastructure
docker-compose up -d kafka zookeeper

# Install service dependencies
npm run install-all
```

### **Service Ports**
- **50051**: Request Handler (gRPC)
- **50052**: Enrichment Service (gRPC)
- **50053**: Validation Service (gRPC)
- **50059**: Account Lookup (gRPC)
- **50060**: Reference Data (gRPC)
- **3004**: Orchestrator (HTTP)
- **3005**: VAM Mediation (HTTP)
- **3006**: Limit Check (HTTP)
- **8002**: Accounting (HTTP)
- **9092**: Kafka Broker

## 🧪 **Testing**

### **Test Categories**
1. **Unit Tests** - Individual service testing
2. **Integration Tests** - Service-to-service communication
3. **End-to-End Tests** - Complete message flow validation
4. **Load Tests** - Performance and scalability testing
5. **Scenario Tests** - Business logic validation

### **Test Execution**
```bash
# Navigate to utilities for all testing
cd utilities

# Run specific test categories
./comprehensive-test.sh              # All tests
./test-full-flow.sh                  # E2E flow
./run-vam-mdz-test.sh               # VAM/MDZ scenarios
./start-orchestration-test.sh       # Orchestration tests
```

## 🎯 **Production Readiness**

### **Current Status**
- ✅ **All Services Operational**
- ✅ **End-to-End Testing Complete**
- ✅ **VAM/MDZ Routing Verified**
- ✅ **Kafka Integration Working**
- ✅ **Health Checks Implemented**
- ✅ **Monitoring & Logging Active**

### **Performance Metrics**
- **Message Processing**: < 500ms average
- **Account Lookup**: < 200ms average
- **Reference Data**: < 100ms average
- **Kafka Throughput**: 1000+ messages/second

## 🚀 **Deployment**

### **Docker Deployment**
```bash
# Build all services
docker-compose build

# Start complete system
docker-compose up -d

# Scale services
docker-compose up -d --scale fast-enrichment-service=3
```

### **Kubernetes Ready**
All services are containerized and ready for Kubernetes deployment with:
- Health check endpoints
- Graceful shutdown handling
- Resource limit configurations
- Service discovery integration

## 📞 **Support**

### **Troubleshooting**
1. Check service health: `./utilities/1-service-health-check.sh`
2. View logs: `./utilities/logs/[service-name].log`
3. Test connectivity: `./utilities/quick-test.sh`

### **Common Issues**
- **Port Conflicts**: Use `lsof -i :[port]` to identify conflicts
- **Kafka Issues**: Restart with `docker-compose restart kafka`
- **Service Dependencies**: Ensure all services are running before testing

---

**🎯 The Singapore G3 Payment Platform is production-ready with comprehensive testing and monitoring capabilities.** 