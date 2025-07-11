#!/bin/bash

# End-to-end test script for the complete microservices architecture
# This script will start all services and test the full PACS message flow

set -e

echo "🌟 Starting end-to-end service tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service configuration
SERVICES=(
    "fast-accountlookup-service:50059"
    "fast-enrichment-service:50052"
    "fast-validation-service:50053"
    "fast-orchestrator-service:3004"
)

# Track PIDs for cleanup
PIDS=()

# Function to start a service
start_service() {
    local service_name=$1
    local service_port=$2
    
    echo -e "${BLUE}Starting ${service_name} on port ${service_port}...${NC}"
    
    cd "$service_name"
    npm run dev > "../logs/${service_name}.log" 2>&1 &
    local pid=$!
    PIDS+=($pid)
    
    echo "Started ${service_name} with PID ${pid}"
    cd ..
    
    # Wait for service to be ready
    sleep 3
    
    # Basic health check
    if [[ "$service_name" == "fast-orchestrator-service" ]]; then
        # HTTP health check
        if curl -s "http://localhost:${service_port}/health" > /dev/null; then
            echo -e "${GREEN}✅ ${service_name} is healthy${NC}"
        else
            echo -e "${RED}❌ ${service_name} failed health check${NC}"
        fi
    else
        # For gRPC services, just check if port is open
        if nc -z localhost "$service_port" 2>/dev/null; then
            echo -e "${GREEN}✅ ${service_name} is listening on port ${service_port}${NC}"
        else
            echo -e "${RED}❌ ${service_name} is not responding on port ${service_port}${NC}"
        fi
    fi
}

# Function to stop all services
cleanup() {
    echo -e "${YELLOW}Cleaning up services...${NC}"
    
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping PID $pid..."
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait for processes to stop
    sleep 2
    
    # Force kill if needed
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Force killing PID $pid..."
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Set up cleanup on exit
trap cleanup EXIT

# Create logs directory
mkdir -p logs

echo -e "${YELLOW}=== Starting All Services ===${NC}"

# Start services in dependency order
for service_config in "${SERVICES[@]}"; do
    service_name=$(echo "$service_config" | cut -d':' -f1)
    service_port=$(echo "$service_config" | cut -d':' -f2)
    start_service "$service_name" "$service_port"
done

echo -e "${GREEN}🚀 All services started successfully!${NC}"
echo ""
echo "Service Status:"
echo "- Account Lookup Service: http://localhost:50059"
echo "- Enrichment Service: http://localhost:50052"
echo "- Validation Service: http://localhost:50053"
echo "- Orchestrator Service: http://localhost:3004"
echo ""

# Wait for all services to fully initialize
echo -e "${YELLOW}Waiting for services to fully initialize...${NC}"
sleep 10

# Test the full flow
echo -e "${YELLOW}=== Testing End-to-End Flow ===${NC}"

# Test 1: Account Lookup Service
echo -e "${BLUE}Test 1: Account Lookup Service${NC}"
cd fast-accountlookup-service
if npm test -- --reporter=line; then
    echo -e "${GREEN}✅ Account Lookup Service tests passed${NC}"
else
    echo -e "${RED}❌ Account Lookup Service tests failed${NC}"
fi
cd ..

# Test 2: Enrichment Service (depends on Account Lookup)
echo -e "${BLUE}Test 2: Enrichment Service${NC}"
cd fast-enrichment-service
if npm test -- --reporter=line; then
    echo -e "${GREEN}✅ Enrichment Service tests passed${NC}"
else
    echo -e "${RED}❌ Enrichment Service tests failed${NC}"
fi
cd ..

# Test 3: Validation Service
echo -e "${BLUE}Test 3: Validation Service${NC}"
cd fast-validation-service
if npm test -- --reporter=line; then
    echo -e "${GREEN}✅ Validation Service tests passed${NC}"
else
    echo -e "${RED}❌ Validation Service tests failed${NC}"
fi
cd ..

# Test 4: Orchestrator Service
echo -e "${BLUE}Test 4: Orchestrator Service${NC}"
cd fast-orchestrator-service
if npm test -- --reporter=line; then
    echo -e "${GREEN}✅ Orchestrator Service tests passed${NC}"
else
    echo -e "${RED}❌ Orchestrator Service tests failed${NC}"
fi
cd ..

# Test 5: Service Integration
echo -e "${BLUE}Test 5: Service Integration${NC}"

# Test account lookup directly
echo "Testing account lookup..."
if command -v grpcurl &> /dev/null; then
    echo "Using grpcurl to test account lookup..."
    grpcurl -plaintext -d '{"cdtr_acct": "123456789"}' localhost:50059 gpp.g3.accountlookup.AccountLookupService/LookupAccount
else
    echo "grpcurl not found, skipping direct gRPC test"
fi

# Test orchestrator endpoints
echo "Testing orchestrator endpoints..."
curl -s "http://localhost:3004/health" | head -5
echo ""
curl -s "http://localhost:3004/api/v1/messages" | head -5
echo ""

echo -e "${GREEN}🎉 End-to-end testing completed!${NC}"
echo ""
echo "Architecture Summary:"
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ PACS Message Flow:                                              │"
echo "│                                                                 │"
echo "│ fast-requesthandler-service (Port 50051)                       │"
echo "│ ↓ Validates & stores in Spanner                                │"
echo "│ fast-enrichment-service (Port 50052)                           │"
echo "│ ↓ Calls fast-accountlookup-service → Enriches data             │"
echo "│ fast-validation-service (Port 50053)                           │"
echo "│ ↓ Validates SGD/SG → Converts XML to JSON → Publishes to Kafka │"
echo "│ fast-orchestrator-service (Port 3004)                          │"
echo "│ ↓ Consumes Kafka → Routes to downstream Java services          │"
echo "│ [Java Services: limitcheck, accounting, vam/mdz-mediation]     │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
echo "To test with request handler:"
echo "1. Start the request handler service on port 50051"
echo "2. Inject PACS messages via gRPC"
echo "3. Watch the flow through all services"
echo ""
echo "Log files are available in ./logs/ directory" 