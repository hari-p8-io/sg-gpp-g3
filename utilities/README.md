# Utilities Directory

This directory contains all utility files, scripts, and supporting resources for the G3 Payment Platform (GPPG3).

## 📁 Directory Structure

### 🔧 **Build & Configuration**
- `pom.xml` - Maven build configuration
- `playwright.config.ts` - Playwright test configuration
- `src/` - Utility source code and configurations
- `tests/` - Test specifications and test cases

### 🚀 **Service Management Scripts**
- `start-services.sh` - Script to start all G3 services
- `comprehensive-test.sh` - Comprehensive testing script
- `quick-test.sh` - Quick validation script
- `test-full-flow.sh` - Full end-to-end flow testing
- `1-service-health-check.sh` - Health check for all services

### 🧪 **Test Files**
- `test-grpc-vam-limit-check.js` - gRPC VAM limit check testing
- `test-vam-limit-check.js` - VAM limit check validation
- `test-reference-data.js` - Reference data service testing
- `test-end-to-end-flow.js` - End-to-end flow validation
- `test-orchestration-flow.js` - Orchestration flow testing
- `test-message-structure.js` - Message structure validation

### 📊 **Logs & Results**
- `logs/` - Service execution logs
- `test-results/` - Test execution results and reports
- `TEST_RESULTS.md` - Test results documentation

## 🎯 **Core Testing Framework**

**Note**: The main Playwright testing framework is located at the root level in `pw-core/` directory, not in utilities. This utilities directory contains supplementary testing scripts and configurations.

## 🚀 **Usage**

### Running Service Management Scripts
```bash
# Start all services
./start-services.sh

# Run comprehensive tests
./comprehensive-test.sh

# Quick health check
./1-service-health-check.sh

# Test full flow
./test-full-flow.sh
```

### Test Execution
```bash
# Run specific test files
node test-grpc-vam-limit-check.js
node test-end-to-end-flow.js

# Run with npm (if configured)
npm test
```

## 📋 **Important Notes**

1. **Service Dependencies**: Most scripts require all G3 services to be running
2. **Kafka Dependency**: Some tests require Kafka to be running locally
3. **Environment**: Scripts are configured for development environment
4. **Logging**: All test executions are logged to the `logs/` directory
5. **Core Framework**: Main testing framework is in root-level `pw-core/` directory

## 🔧 **Configuration**

Configuration files in this directory are supplementary to the main service configurations. Main service configurations are located in their respective service directories. 