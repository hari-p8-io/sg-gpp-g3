#!/bin/bash

# GPP G3 End-to-End Test Runner
# This script sets up and runs a comprehensive end-to-end test

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UTILITIES_DIR="$PROJECT_ROOT/utilities"
SERVICES_DIR="$PROJECT_ROOT"

# Service ports - only check essential services for the test
SERVICES=(
  "fast-requesthandler-service:50051"
  "fast-enrichment-service:50052"
  "fast-validation-service:50053"
  "fast-orchestrator-service:3004"
  "kafka:9092"
)

# Optional services (will warn if not running but won't fail the test)
OPTIONAL_SERVICES=(
  "accounting-service:8002"
  "vam-mediation-service:3005"
  "limit-check-service:3006"
)

# Function to print colored output
print_status() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if a service is running
check_service() {
  local service_name=$1
  local port=$2
  
  if [ "$service_name" == "kafka" ]; then
    # Check Kafka specifically - look for Docker process
    if lsof -i :9092 2>/dev/null | grep -q LISTEN; then
      print_success "Kafka is running on port 9092"
      return 0
    else
      print_error "Kafka is not running on port 9092"
      return 1
    fi
  elif [[ "$port" =~ ^500 ]]; then
    # gRPC service - check if port is listening
    if lsof -i :$port 2>/dev/null | grep -q LISTEN; then
      print_success "$service_name is running on port $port"
      return 0
    else
      print_error "$service_name is not running on port $port"
      return 1
    fi
      else
      # HTTP service - try to connect to port first, then health endpoint
      if lsof -i :$port 2>/dev/null | grep -q LISTEN; then
        # Port is open, try health endpoint
        local health_response=$(curl -s -w "%{http_code}" -m 5 "http://localhost:$port/health" 2>/dev/null)
        local http_code="${health_response: -3}"
        
        if [[ "$http_code" == "200" ]]; then
          print_success "$service_name is running on port $port (health check passed)"
          return 0
        else
          print_warning "$service_name is running on port $port but health check returned $http_code"
          # Still consider it running since the port is open
          return 0
        fi
      else
        print_error "$service_name is not running on port $port"
        return 1
      fi
  fi
}

# Function to check optional services
check_optional_services() {
  print_status "Checking optional services..."
  
  for service in "${OPTIONAL_SERVICES[@]}"; do
    IFS=':' read -r name port <<< "$service"
    if check_service "$name" "$port"; then
      print_success "Optional service $name is available"
    else
      print_warning "Optional service $name is not running - some features may be limited"
    fi
  done
}

# Function to display service status
check_all_services() {
  print_status "Checking essential services..."
  
  local all_services_running=true
  
  for service in "${SERVICES[@]}"; do
    IFS=':' read -r name port <<< "$service"
    if ! check_service "$name" "$port"; then
      all_services_running=false
    fi
  done
  
  # Check optional services but don't fail if they're not running
  check_optional_services
  
  if [ "$all_services_running" = true ]; then
    return 0
  else
    return 1
  fi
}

# Function to show service startup instructions
show_startup_instructions() {
  print_warning "Some services are not running. Please start them manually:"
  echo ""
  echo "1. Start Kafka:"
  echo "   cd $PROJECT_ROOT"
  echo "   docker-compose up -d kafka zookeeper"
  echo ""
  echo "2. Start Request Handler Service:"
  echo "   cd $PROJECT_ROOT/fast-requesthandler-service"
  echo "   npm run dev"
  echo ""
  echo "3. Start Enrichment Service:"
  echo "   cd $PROJECT_ROOT/fast-enrichment-service"
  echo "   NODE_ENV=test npm run dev"
  echo ""
  echo "4. Start Validation Service:"
  echo "   cd $PROJECT_ROOT/fast-validation-service"
  echo "   npm run dev"
  echo ""
  echo "5. Start Orchestrator Service:"
  echo "   cd $PROJECT_ROOT/fast-orchestrator-service"
  echo "   npm run dev"
  echo ""
  print_status "After starting services, run this script again with --skip-checks flag"
}

# Function to install dependencies
install_dependencies() {
  print_status "Installing test dependencies..."
  
  cd "$UTILITIES_DIR"
  if [ ! -f "package.json" ]; then
    print_error "package.json not found in utilities directory"
    exit 1
  fi
  
  npm install
  print_success "Dependencies installed successfully"
}

# Function to run Kafka monitor in background
start_kafka_monitor() {
  print_status "Starting Kafka topic monitor..."
  
  cd "$UTILITIES_DIR"
  node kafka-topic-monitor.js &
  KAFKA_MONITOR_PID=$!
  
  print_success "Kafka monitor started (PID: $KAFKA_MONITOR_PID)"
  sleep 3
}

# Function to run the E2E test
run_e2e_test() {
  print_status "Running End-to-End Test..."
  
  cd "$UTILITIES_DIR"
  
  # Set environment variables for test
  export NODE_ENV=test
  export TEST_MODE=e2e
  
  # Run the test
  if node end-to-end-test-with-kafka-monitoring.js; then
    print_success "End-to-End Test PASSED! 🎉"
    return 0
  else
    print_error "End-to-End Test FAILED! ❌"
    return 1
  fi
}

# Function to cleanup
cleanup() {
  print_status "Cleaning up..."
  
  if [ ! -z "$KAFKA_MONITOR_PID" ]; then
    kill $KAFKA_MONITOR_PID 2>/dev/null || true
    print_success "Kafka monitor stopped"
  fi
}

# Function to show help
show_help() {
  echo "GPP G3 End-to-End Test Runner"
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --skip-checks    Skip service health checks"
  echo "  --install-deps   Install test dependencies only"
  echo "  --monitor-only   Start Kafka monitor only"
  echo "  --help           Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0                    # Run full E2E test with service checks"
  echo "  $0 --skip-checks      # Run E2E test without service checks"
  echo "  $0 --install-deps     # Install dependencies only"
  echo "  $0 --monitor-only     # Start Kafka monitor only"
}

# Function to display test overview
show_test_overview() {
  echo ""
  echo "===================================================================================="
  echo "                           GPP G3 END-TO-END TEST OVERVIEW"
  echo "===================================================================================="
  echo ""
  echo "This test will:"
  echo "  🔹 Send a PACS008 message to the Request Handler Service (port 50051)"
  echo "  🔹 Track the message through Enrichment Service (port 50052)"
  echo "  🔹 Monitor Validation Service processing (port 50053)"
  echo "  🔹 Observe Orchestrator Service routing (port 3004)"
  echo "  🔹 Assert messages on Kafka topics:"
  echo "      - validated-messages"
  echo "      - vam-messages"
  echo "      - limitcheck-messages"
  echo "  🔹 Provide real-time visualization of message flow"
  echo ""
  echo "Message Flow:"
  echo "  Client → Request Handler → Enrichment → Validation → Kafka → Orchestrator"
  echo "                                                          ↓"
  echo "                                              VAM/MDZ + Limit Check"
  echo ""
  echo "===================================================================================="
  echo ""
}

# Main script execution
main() {
  local skip_checks=false
  local install_deps_only=false
  local monitor_only=false
  
  # Parse command line arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --skip-checks)
        skip_checks=true
        shift
        ;;
      --install-deps)
        install_deps_only=true
        shift
        ;;
      --monitor-only)
        monitor_only=true
        shift
        ;;
      --help)
        show_help
        exit 0
        ;;
      *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
    esac
  done
  
  # Trap for cleanup
  trap cleanup EXIT
  
  # Show test overview
  show_test_overview
  
  # Install dependencies only
  if [ "$install_deps_only" = true ]; then
    install_dependencies
    exit 0
  fi
  
  # Start Kafka monitor only
  if [ "$monitor_only" = true ]; then
    install_dependencies
    start_kafka_monitor
    print_status "Kafka monitor is running. Press Ctrl+C to stop."
    wait
    exit 0
  fi
  
  # Install dependencies
  install_dependencies
  
  # Check services unless skipped
  if [ "$skip_checks" = false ]; then
    if ! check_all_services; then
      show_startup_instructions
      exit 1
    fi
  fi
  
  # Start Kafka monitor
  start_kafka_monitor
  
  # Run the E2E test
  if run_e2e_test; then
    print_success "🎉 End-to-End Test completed successfully!"
    exit 0
  else
    print_error "❌ End-to-End Test failed!"
    exit 1
  fi
}

# Check if script is being run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi 