#!/bin/bash

echo "🎯 Starting VAM Routing Test Environment"
echo "======================================="

# Function to check if a port is open
check_port() {
  local port=$1
  local service=$2
  if lsof -i :$port > /dev/null 2>&1; then
    echo "✅ $service is running on port $port"
    return 0
  else
    echo "❌ $service is not running on port $port"
    return 1
  fi
}

# Function to wait for service to start
wait_for_service() {
  local port=$1
  local service=$2
  local max_attempts=30
  local attempt=0
  
  echo "⏳ Waiting for $service on port $port..."
  
  while [ $attempt -lt $max_attempts ]; do
    if lsof -i :$port > /dev/null 2>&1; then
      echo "✅ $service is ready on port $port"
      return 0
    fi
    
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
  done
  
  echo "❌ $service failed to start on port $port after $max_attempts attempts"
  return 1
}

# Create logs directory
mkdir -p logs

# Kill any existing services
echo "🔄 Stopping existing services..."
pkill -f "fast-accountlookup-service" 2>/dev/null || true
pkill -f "fast-requesthandler-service" 2>/dev/null || true
pkill -f "fast-enrichment-service" 2>/dev/null || true
pkill -f "fast-validation-service" 2>/dev/null || true
pkill -f "fast-orchestrator-service" 2>/dev/null || true
pkill -f "fast-vammediation-service" 2>/dev/null || true

# Wait a moment for processes to stop
sleep 3

# Start services in order
echo "🚀 Starting services..."

# 1. Account Lookup Service
echo "   Starting Account Lookup Service..."
cd fast-accountlookup-service
npm run dev > ../logs/account-lookup.log 2>&1 &
cd ..

# 2. Request Handler Service
echo "   Starting Request Handler Service..."
cd fast-requesthandler-service
npm run dev > ../logs/request-handler.log 2>&1 &
cd ..

# 3. Enrichment Service
echo "   Starting Enrichment Service..."
cd fast-enrichment-service
npm run dev > ../logs/enrichment.log 2>&1 &
cd ..

# 4. Validation Service
echo "   Starting Validation Service..."
cd fast-validation-service
npm run dev > ../logs/validation.log 2>&1 &
cd ..

# 5. Orchestrator Service
echo "   Starting Orchestrator Service..."
cd fast-orchestrator-service
npm run dev > ../logs/orchestrator.log 2>&1 &
cd ..

# 6. VAM Mediation Service
echo "   Starting VAM Mediation Service..."
cd fast-vammediation-service
npm install > ../logs/vam-install.log 2>&1
npm run dev > ../logs/vam-mediation.log 2>&1 &
cd ..

echo "⏳ Waiting for all services to start..."

# Wait for services to start
wait_for_service 50059 "Account Lookup Service" || exit 1
wait_for_service 50051 "Request Handler Service" || exit 1
wait_for_service 50052 "Enrichment Service" || exit 1
wait_for_service 50053 "Validation Service" || exit 1
wait_for_service 3004 "Orchestrator Service" || exit 1

echo "✅ All services are running!"

# Check service health
echo "🏥 Checking service health..."
check_port 50059 "Account Lookup Service"
check_port 50051 "Request Handler Service"
check_port 50052 "Enrichment Service"
check_port 50053 "Validation Service"
check_port 3004 "Orchestrator Service"

# Check Kafka is running
echo "🔍 Checking Kafka..."
if check_port 9092 "Kafka"; then
  echo "✅ Kafka is running"
else
  echo "❌ Kafka is not running. Please start Kafka first."
  exit 1
fi

echo "📝 Service logs are available in the logs/ directory"
echo "   - Account Lookup: logs/account-lookup.log"
echo "   - Request Handler: logs/request-handler.log"
echo "   - Enrichment: logs/enrichment.log"
echo "   - Validation: logs/validation.log"
echo "   - Orchestrator: logs/orchestrator.log"
echo "   - VAM Mediation: logs/vam-mediation.log"

echo ""
echo "🎯 Running VAM Routing Test..."
echo "=============================="

# Run the VAM routing test
node vam-routing-test.js

# Capture test result
test_result=$?

echo ""
echo "📋 Test Results Summary"
echo "======================"

if [ $test_result -eq 0 ]; then
  echo "🎉 VAM Routing Test: SUCCESS"
  echo "   ✅ Account lookup returns VAM for account 999888777"
  echo "   ✅ Message flows through all services"
  echo "   ✅ Orchestrator detects VAM account system"
  echo "   ✅ Message is routed to vam-messages Kafka topic"
  echo "   ✅ VAM mediation service can consume the message"
else
  echo "❌ VAM Routing Test: FAILED"
  echo "   Check the test output above for details"
fi

echo ""
echo "🔧 Manual Testing:"
echo "   - Account Lookup: grpcurl -plaintext -d '{\"cdtr_acct\":\"999888777\"}' localhost:50059 gpp.g3.accountlookup.AccountLookupService/LookupAccount"
echo "   - Orchestrator API: curl http://localhost:3004/api/v1/messages"
echo "   - Service Health: curl http://localhost:3004/health"

echo ""
echo "🛑 To stop all services, run:"
echo "   pkill -f 'fast-.*-service'"

exit $test_result 