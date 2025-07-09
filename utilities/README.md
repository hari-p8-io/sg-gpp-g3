# Utilities Directory

This directory contains all testing and utility scripts used for development and testing of the GPP G3 Fast services.

## Testing Scripts

### End-to-End Tests
- `test-orchestration.js` - Main orchestration test for VAM, MDZ, and Standard flows
- `start-orchestration-test.sh` - Script to start all services and run orchestration tests
- `comprehensive-e2e-test.js` - Comprehensive end-to-end testing
- `run-comprehensive-e2e-test.sh` - Runner for comprehensive tests
- `simplified-e2e-test.js` - Simplified version of end-to-end tests
- `end-to-end-test.js` - Basic end-to-end test
- `test-end-to-end.sh` - Shell script for end-to-end testing

### VAM-Specific Tests
- `test-vam-mdz-flows.js` - Test VAM and MDZ flows specifically
- `run-vam-mdz-test.sh` - Runner for VAM/MDZ tests
- `simple-vam-mdz-e2e-test.js` - Simple VAM/MDZ end-to-end test
- `complete-e2e-vam-mdz-test.js` - Complete VAM/MDZ testing
- `run-complete-e2e-test.sh` - Runner for complete VAM/MDZ tests
- `end-to-end-vam-test.js` - VAM-specific end-to-end test
- `start-vam-e2e-test.sh` - Start VAM end-to-end test environment
- `simple-vam-e2e-test.js` - Simple VAM end-to-end test
- `start-vam-test.sh` - Start VAM test environment
- `test-vam-account.js` - Test VAM account handling
- `test-vam-kafka.js` - Test VAM Kafka integration
- `test-multiple-vam.js` - Test multiple VAM messages
- `vam-routing-test.js` - Test VAM routing logic

### Service-Specific Tests
- `test-services.sh` - Test individual services
- `test-grpc-flow.js` - Test gRPC flow between services
- `test-enhanced-flow.js` - Test enhanced service flow
- `run-enhanced-services.sh` - Runner for enhanced services
- `flow-test.js` - Basic flow testing
- `kafka-flow-test.js` - Kafka flow testing
- `verify-flows-test.js` - Verify service flows

### Validation and Debugging
- `validate-implementation-plan.js` - Validate implementation against plan
- `debug-validation.js` - Debug validation issues
- `debug-xml.js` - Debug XML processing
- `test-all-scenarios.js` - Test all possible scenarios
- `final-e2e-report.js` - Generate final test reports

## Documentation

### Test Reports
- `FINAL_E2E_TEST_REPORT.md` - Comprehensive end-to-end test results
- `VAM_MDZ_FLOW_RESULTS.md` - VAM and MDZ flow test results
- `ORCHESTRATION_README.md` - Orchestration implementation documentation

### Usage Documentation
- `README.md` - This file with complete utilities documentation

## Usage

Most scripts can be run directly with Node.js:
```bash
node utilities/test-orchestration.js
```

Shell scripts should be made executable first:
```bash
chmod +x utilities/start-orchestration-test.sh
./utilities/start-orchestration-test.sh
```

## Main Test Entry Points

For comprehensive testing, use:
- `utilities/start-orchestration-test.sh` - Full orchestration test with all services
- `utilities/test-orchestration.js` - Direct orchestration testing
- `utilities/comprehensive-e2e-test.js` - Complete end-to-end testing

## Prerequisites

- Kafka running on localhost:9092
- All services built and available
- Node.js dependencies installed in root and service directories 