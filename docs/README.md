# GPPG3 Documentation

## Overview
This is the centralized documentation for the Singapore G3 Payment Platform (GPPG3) project. All service documentation, implementation guides, and project reports are organized here.

## 📁 Documentation Structure

### 🏗️ Architecture & Guides (`guides/`)
- **[CI/CD Setup](guides/CI-CD-SETUP.md)** - Continuous integration and deployment configuration
- **[Docker Health Check Fix](guides/DOCKERFILE-HEALTHCHECK-FIX.md)** - Docker health check implementation
- **[Multi-Stage Build Guide](guides/MULTI-STAGE-BUILD-GUIDE.md)** - Docker multi-stage build optimization
- **[Private Package Setup](guides/PRIVATE-PACKAGE-SETUP.md)** - NPM private package authentication
- **[TypeScript Standardization](guides/TYPESCRIPT-STANDARDIZATION.md)** - TypeScript configuration across services
- **[Orchestration README](guides/ORCHESTRATION_README.md)** - Complete orchestration flow documentation

### 📊 Reports & Analysis (`reports/`)
- **[Current Implementation Status](reports/CURRENT_IMPLEMENTATION_STATUS.md)** - Overall project status
- **[Logger Refactoring Success](reports/LOGGER-REFACTORING-SUCCESS.md)** - Logger standardization results
- **[Logger Refactoring Summary](reports/LOGGER-REFACTORING-SUMMARY.md)** - Detailed refactoring process
- **[PACS.002 Enhancement Summary](reports/PACS_002_ENHANCEMENT_SUMMARY.md)** - Response generation implementation
- **[Private Package Fix Summary](reports/PRIVATE-PACKAGE-FIX-SUMMARY.md)** - Package authentication resolution
- **[Service Implementation Summary](reports/SERVICE_IMPLEMENTATION_SUMMARY.md)** - Complete implementation overview
- **[Final E2E Test Report](reports/FINAL_E2E_TEST_REPORT.md)** - End-to-end testing results
- **[Test Results](reports/TEST_RESULTS.md)** - Comprehensive test results
- **[VAM MDZ Flow Results](reports/VAM_MDZ_FLOW_RESULTS.md)** - Flow validation results

### 🛠️ Service Documentation (`services/`)

#### Core Payment Processing Services
- **[Request Handler Service](services/fast-requesthandler-service/)** - Payment entry point (Port 50051)
- **[Enrichment Service](services/fast-enrichment-service/)** - Central orchestration hub (Port 50052)
- **[Validation Service](services/fast-validation-service/)** - Message validation (Port 50053)
- **[Orchestrator Service](services/fast-orchestrator-service/)** - Flow orchestration (Port 3004)

#### Supporting Services
- **[Account Lookup Service](services/fast-accountlookup-service/)** - Account information (Port 50059)
- **[Reference Data Service](services/fast-referencedata-service/)** - Authentication methods (Port 50060)
- **[Accounting Service](services/fast-accounting-service/)** - Transaction processing (Port 8002)
- **[Limit Check Service](services/fast-limitcheck-service/)** - Limit validation (Port 3006)

#### Mediation Services
- **[VAM Mediation Service](services/fast-vammediation-service/)** - VAM account processing
- **[MDZ Mediation Service](services/fast-mdzmediation-service/)** - MDZ account processing

## 🏗️ System Architecture

### Message Flow
```
Client → Request Handler (gRPC) → Enrichment Service (Central Hub) → Account Lookup + Reference Data → Validation → Orchestrator (Kafka) → Accounting/VAM/Limit Check
```

### Core Technologies
- **gRPC Services**: Synchronous processing (Request Handler, Enrichment, Validation, Account Lookup)
- **Kafka Integration**: Asynchronous orchestration (Validation → Orchestrator → Downstream services)
- **Express.js Services**: HTTP APIs (Orchestrator, Accounting, Limit Check, Mediation services)

### Service Ports
- **50051**: Request Handler Service (gRPC entry point)
- **50052**: Enrichment Service (central hub)
- **50053**: Validation Service
- **50059**: Account Lookup Service
- **50060**: Reference Data Service
- **3004**: Orchestrator Service
- **8002**: Accounting Service
- **3006**: Limit Check Service

## 🎯 Payment Flows

### Flow 1: Standard MDZ Account
```
Request → Enrichment → Validation → Orchestrator → Accounting
```

### Flow 2: VAM Account Processing
```
Request → Enrichment → Validation → Orchestrator → VAM Mediation → Accounting
```

### Flow 3: GROUPLIMIT Authentication
```
Request → Enrichment → Validation → Orchestrator → Accounting + Limit Check (Fire & Forget)
```

## 📚 Quick Links

### For Developers
- [Service Implementation Summary](reports/SERVICE_IMPLEMENTATION_SUMMARY.md)
- [TypeScript Standardization](guides/TYPESCRIPT-STANDARDIZATION.md)
- [CI/CD Setup](guides/CI-CD-SETUP.md)

### For Operations
- [Final E2E Test Report](reports/FINAL_E2E_TEST_REPORT.md)
- [Current Implementation Status](reports/CURRENT_IMPLEMENTATION_STATUS.md)
- [Multi-Stage Build Guide](guides/MULTI-STAGE-BUILD-GUIDE.md)

### For Architecture
- [Orchestration README](guides/ORCHESTRATION_README.md)
- [VAM MDZ Flow Results](reports/VAM_MDZ_FLOW_RESULTS.md)
- [PACS.002 Enhancement Summary](reports/PACS_002_ENHANCEMENT_SUMMARY.md)

## 🚀 Status
✅ **Production Ready** - All core services implemented and tested  
✅ **End-to-End Validated** - Complete payment flows working  
✅ **Documentation Complete** - Comprehensive documentation available 