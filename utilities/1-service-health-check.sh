#!/bin/bash

echo "🩺 SERVICE HEALTH CHECK"
echo "======================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
    local name=$1
    local url=$2
    local expected_text=$3
    
    echo -n "Checking $name... "
    
    if curl -s -f "$url" | grep -q "$expected_text" 2>/dev/null; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        return 0
    else
        echo -e "${RED}❌ UNHEALTHY${NC}"
        return 1
    fi
}

check_grpc_service() {
    local name=$1
    local port=$2
    
    echo -n "Checking $name (gRPC)... "
    
    if lsof -i :$port | grep -q LISTEN 2>/dev/null; then
        echo -e "${GREEN}✅ LISTENING${NC}"
        return 0
    else
        echo -e "${RED}❌ NOT LISTENING${NC}"
        return 1
    fi
}

echo "📊 HTTP Services:"
check_service "Request Handler" "http://localhost:50051/health" "healthy"
check_service "Orchestrator" "http://localhost:3004/health" "healthy"
check_service "Accounting" "http://localhost:8002/health" "healthy"
check_service "VAM Mediation" "http://localhost:3005/health" "healthy"
check_service "Limit Check" "http://localhost:3006/health" "healthy"

echo ""
echo "📡 gRPC Services:"
check_grpc_service "Request Handler" "50051"
check_grpc_service "Enrichment" "50052"
check_grpc_service "Validation" "50053"
check_grpc_service "Account Lookup" "50059"
check_grpc_service "Reference Data" "50060"

echo ""
echo "🔍 Process Check:"
if ps aux | grep -v grep | grep -q "fast-"; then
    echo -e "${GREEN}✅ Fast services are running${NC}"
    echo "Running services:"
    ps aux | grep -v grep | grep "fast-" | awk '{print "   " $11}'
else
    echo -e "${RED}❌ No fast services found${NC}"
fi

echo ""
echo "📋 Summary:"
echo "If all services show ✅, you're ready to run end-to-end tests!"
echo "If any show ❌, start the missing services first." 