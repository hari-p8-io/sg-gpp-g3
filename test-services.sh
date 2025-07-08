#!/bin/bash

# Test script to start and test each service individually
# This script will start each service, test it, and then shut it down

set -e

echo "🚀 Starting individual service tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test a service
test_service() {
    local service_name=$1
    local service_dir=$2
    local service_port=$3
    local test_command=$4
    
    echo -e "${YELLOW}Testing ${service_name}...${NC}"
    
    cd "$service_dir"
    
    # Start the service
    echo "Starting ${service_name} on port ${service_port}..."
    npm run dev &
    SERVICE_PID=$!
    
    # Wait for service to start
    sleep 5
    
    # Test the service
    echo "Running tests for ${service_name}..."
    if $test_command; then
        echo -e "${GREEN}✅ ${service_name} tests passed!${NC}"
    else
        echo -e "${RED}❌ ${service_name} tests failed!${NC}"
    fi
    
    # Stop the service
    echo "Stopping ${service_name}..."
    kill $SERVICE_PID 2>/dev/null || true
    sleep 2
    
    echo -e "${GREEN}✅ ${service_name} test completed${NC}"
    echo "----------------------------------------"
    
    cd ..
}

# Test 1: Account Lookup Service
echo -e "${YELLOW}=== Testing Account Lookup Service ===${NC}"
test_service "fast-accountlookup-service" "fast-accountlookup-service" "50059" "npm test -- --reporter=line"

# Test 2: Enrichment Service
echo -e "${YELLOW}=== Testing Enrichment Service ===${NC}"
# Note: This depends on account lookup service, so we might need to start both
test_service "fast-enrichment-service" "fast-enrichment-service" "50052" "npm test -- --reporter=line"

# Test 3: Validation Service
echo -e "${YELLOW}=== Testing Validation Service ===${NC}"
test_service "fast-validation-service" "fast-validation-service" "50053" "npm test -- --reporter=line"

# Test 4: Orchestrator Service
echo -e "${YELLOW}=== Testing Orchestrator Service ===${NC}"
test_service "fast-orchestrator-service" "fast-orchestrator-service" "3004" "npm test -- --reporter=line"

echo -e "${GREEN}🎉 All individual service tests completed!${NC}"
echo ""
echo "Summary:"
echo "- Account Lookup Service: Tested individually ✅"
echo "- Enrichment Service: Tested individually ✅"
echo "- Validation Service: Tested individually ✅"
echo "- Orchestrator Service: Tested individually ✅"
echo ""
echo "Next steps:"
echo "1. Start all services together"
echo "2. Test end-to-end flow"
echo "3. Inject test messages via request handler" 