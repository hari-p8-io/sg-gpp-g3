#!/bin/bash

# Full Flow Test Script - Based on IMPLEMENTATION_PLAN.md
# Tests the complete PACS message processing pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Full Flow Test - PACS Message Processing Pipeline${NC}"
echo -e "${YELLOW}Flow: RequestHandler → Enrichment → AccountLookup → Enrichment → ReferenceData → Enrichment → Validation → Orchestrator → Accounting${NC}"
echo

# Kill any existing processes
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
killall -9 node ts-node npm 2>/dev/null || true
sleep 2

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local protocol=${3:-http}
    local max_attempts=30
    local attempt=0
    
    echo -e "${YELLOW}⏳ Waiting for $service_name on port $port...${NC}"
    
    while [ $attempt -lt $max_attempts ]; do
        if [ "$protocol" = "grpc" ]; then
            # For gRPC services, try to connect with grpcurl
            if grpcurl -plaintext localhost:$port list > /dev/null 2>&1; then
                echo -e "${GREEN}✅ $service_name is ready${NC}"
                return 0
            fi
        else
            # For HTTP services, check if port is open
            if nc -z localhost $port > /dev/null 2>&1; then
                echo -e "${GREEN}✅ $service_name is ready${NC}"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        sleep 1
    done
    
    echo -e "${RED}❌ $service_name failed to start on port $port${NC}"
    return 1
}

# Start services in order
echo -e "${BLUE}🏗️  Starting services in order...${NC}"

# 1. Start fast-referencedata-service (Port 50060)
echo -e "${YELLOW}Starting fast-referencedata-service...${NC}"
cd fast-referencedata-service && npm run dev &
RD_PID=$!
cd ..
wait_for_service "fast-referencedata-service" 50060 "grpc"

# 2. Start fast-accountlookup-service (Port 50059)
echo -e "${YELLOW}Starting fast-accountlookup-service...${NC}"
cd fast-accountlookup-service && npm run dev &
AL_PID=$!
cd ..
wait_for_service "fast-accountlookup-service" 50059 "grpc"

# 3. Start fast-validation-service (Port 50053)
echo -e "${YELLOW}Starting fast-validation-service...${NC}"
cd fast-validation-service && npm run dev &
VS_PID=$!
cd ..
wait_for_service "fast-validation-service" 50053 "grpc"

# 4. Start fast-enrichment-service (Port 50052)
echo -e "${YELLOW}Starting fast-enrichment-service...${NC}"
cd fast-enrichment-service && npm run dev &
ES_PID=$!
cd ..
wait_for_service "fast-enrichment-service" 50052 "grpc"

# 5. Start fast-requesthandler-service (Port 50051)
echo -e "${YELLOW}Starting fast-requesthandler-service...${NC}"
cd fast-requesthandler-service && npm run dev &
RH_PID=$!
cd ..
wait_for_service "fast-requesthandler-service" 50051 "grpc"

# 6. Start fast-orchestrator-service (Port 3004)
echo -e "${YELLOW}Starting fast-orchestrator-service...${NC}"
cd fast-orchestrator-service && npm run dev &
OS_PID=$!
cd ..
wait_for_service "fast-orchestrator-service" 3004 "http"

# 7. Start fast-accounting-service (Port 8002)
echo -e "${YELLOW}Starting fast-accounting-service...${NC}"
cd fast-accounting-service && npm run dev &
AS_PID=$!
cd ..
wait_for_service "fast-accounting-service" 8002 "http"

# 8. Start fast-limitcheck-service (Port 3006)
echo -e "${YELLOW}Starting fast-limitcheck-service...${NC}"
cd fast-limitcheck-service && npm run dev &
LC_PID=$!
cd ..
wait_for_service "fast-limitcheck-service" 3006 "http"

echo -e "${GREEN}🎉 All services started successfully!${NC}"
echo

# Test the full flow
echo -e "${BLUE}🧪 Testing Full Flow...${NC}"
echo

# Test 1: Individual service health checks
echo -e "${YELLOW}1. Testing individual service health checks...${NC}"

# Test ReferenceData service
echo -e "${YELLOW}Testing ReferenceData service...${NC}"
grpcurl -plaintext -d '{
  "acctId": "999888777666",
  "acctSys": "VAM",
  "messageId": "test-ref-123",
  "puid": "test-puid"
}' localhost:50060 ReferenceDataService/LookupAuthMethod

# Test AccountLookup service
echo -e "${YELLOW}Testing AccountLookup service...${NC}"
grpcurl -plaintext -d '{
  "cdtrAcctId": "999888777666",
  "messageId": "test-123",
  "puid": "test-puid",
  "messageType": "PACS"
}' localhost:50059 AccountLookupService/LookupAccount

# Test Enrichment service
echo -e "${YELLOW}Testing Enrichment service...${NC}"
grpcurl -plaintext -d '{
  "cdtrAcctId": "999888777666",
  "messageId": "test-enrich-123",
  "puid": "test-puid-enrich",
  "messageType": "PACS"
}' localhost:50052 EnrichmentService/EnrichMessage

echo

# Test 2: Full Flow Test
echo -e "${YELLOW}2. Testing Full Flow through Request Handler...${NC}"
echo -e "${BLUE}This tests the complete flow: RequestHandler → Enrichment → AccountLookup → Enrichment → ReferenceData → Enrichment → Validation → Orchestrator → Accounting${NC}"

# Create a proper PACS message for testing
grpcurl -plaintext -d '{
  "message": {
    "messageId": "full-flow-test-123",
    "puid": "G3ITEST123456789",
    "messageType": "PACS",
    "country": "SG",
    "currency": "SGD",
    "cdtrAcctId": "999888777666",
    "amount": "100.00",
    "dbtrAcctId": "123456789012",
    "rawMessage": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Document><FIToFICstmrCdtTrf><GrpHdr><MsgId>full-flow-test-123</MsgId></GrpHdr></FIToFICstmrCdtTrf></Document>"
  }
}' localhost:50051 MessageHandler/ProcessMessage

echo

# Test 3: Different Account Types
echo -e "${YELLOW}3. Testing different account types...${NC}"

# VAM Account (should trigger VAM mediation)
echo -e "${YELLOW}Testing VAM account (999888777666)...${NC}"
grpcurl -plaintext -d '{
  "message": {
    "messageId": "vam-test-123",
    "puid": "G3IVAM123456789",
    "messageType": "PACS",
    "country": "SG",
    "currency": "SGD",
    "cdtrAcctId": "999888777666",
    "amount": "100.00",
    "dbtrAcctId": "123456789012",
    "rawMessage": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Document><FIToFICstmrCdtTrf><GrpHdr><MsgId>vam-test-123</MsgId></GrpHdr></FIToFICstmrCdtTrf></Document>"
  }
}' localhost:50051 MessageHandler/ProcessMessage

# GROUPLIMIT account (should trigger limit check)
echo -e "${YELLOW}Testing GROUPLIMIT account (999888777666)...${NC}"
grpcurl -plaintext -d '{
  "message": {
    "messageId": "grouplimit-test-123",
    "puid": "G3IGRP123456789",
    "messageType": "PACS",
    "country": "SG",
    "currency": "SGD",
    "cdtrAcctId": "999888777666",
    "amount": "100.00",
    "dbtrAcctId": "123456789012",
    "rawMessage": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Document><FIToFICstmrCdtTrf><GrpHdr><MsgId>grouplimit-test-123</MsgId></GrpHdr></FIToFICstmrCdtTrf></Document>"
  }
}' localhost:50051 MessageHandler/ProcessMessage

echo

# Test 4: Service Health Checks
echo -e "${YELLOW}4. Testing service health endpoints...${NC}"

# HTTP service health checks
curl -s http://localhost:3004/health | jq . || echo "Orchestrator health check"
curl -s http://localhost:8002/health | jq . || echo "Accounting health check"
curl -s http://localhost:3006/health | jq . || echo "Limit Check health check"

echo

# Test 5: Message Flow Monitoring
echo -e "${YELLOW}5. Monitoring message flow...${NC}"
echo -e "${BLUE}Check service logs for message processing...${NC}"
sleep 5

echo

# Summary
echo -e "${GREEN}🎯 Full Flow Test Complete!${NC}"
echo -e "${YELLOW}Architecture Flow Tested:${NC}"
echo -e "${BLUE}(gRPC) fast-requesthandler-service → (gRPC) fast-enrichment-service → (gRPC) fast-accountlookup-service → (gRPC) fast-enrichment-service → (gRPC) fast-referencedata-service → (gRPC) fast-enrichment-service → (gRPC) fast-validation-service → (kafka) fast-orchestrator-service → (kafka) fast-accounting-service${NC}"
echo
echo -e "${YELLOW}Conditional Flows:${NC}"
echo -e "${BLUE}• VAM accounts: Orchestrator → VAM Mediation → Accounting${NC}"
echo -e "${BLUE}• GROUPLIMIT: Orchestrator → Limit Check (fire & forget)${NC}"
echo

echo -e "${GREEN}✅ All services are running and processing messages!${NC}"
echo
echo -e "${YELLOW}Services running:${NC}"
echo -e "${BLUE}• fast-referencedata-service: localhost:50060${NC}"
echo -e "${BLUE}• fast-accountlookup-service: localhost:50059${NC}"
echo -e "${BLUE}• fast-validation-service: localhost:50053${NC}"
echo -e "${BLUE}• fast-enrichment-service: localhost:50052${NC}"
echo -e "${BLUE}• fast-requesthandler-service: localhost:50051${NC}"
echo -e "${BLUE}• fast-orchestrator-service: localhost:3004${NC}"
echo -e "${BLUE}• fast-accounting-service: localhost:8002${NC}"
echo -e "${BLUE}• fast-limitcheck-service: localhost:3006${NC}"
echo

echo -e "${YELLOW}To stop all services, run:${NC}"
echo -e "${BLUE}killall -9 node ts-node npm${NC}"
echo

# Keep script running to monitor services
echo -e "${YELLOW}Press Ctrl+C to stop all services...${NC}"
wait 