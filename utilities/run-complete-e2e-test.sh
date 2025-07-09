#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs"
TEST_TIMEOUT=300 # 5 minutes
PIDS=()

# Service configuration as arrays
SERVICES=(
    "fast-accountlookup-service:50059"
    "fast-requesthandler-service:50051"
    "fast-enrichment-service:50052"
    "fast-validation-service:50053"
    "fast-orchestrator-service:3004"
    "fast-vammediation-service:3005"
    "fast-accounting-service:8002"
)

# Function to print colored output
print_status() {
    echo -e "${CYAN}[INFO]${NC} $1"
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

print_header() {
    echo -e "${MAGENTA}$1${NC}"
}

# Function to check if a service is running
check_service_health() {
    local service_name=$1
    local port=$2
    local timeout=5
    
    if [[ $port -lt 8000 ]]; then
        # gRPC services - check if port is listening
        if nc -z localhost "$port" 2>/dev/null; then
            return 0
        else
            return 1
        fi
    else
        # HTTP services - check health endpoint
        if curl -s -f "http://localhost:$port/health" >/dev/null 2>&1; then
            return 0
        else
            return 1
        fi
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local timeout=60
    local count=0
    
    print_status "Waiting for $service_name to be ready on port $port..."
    
    while [ $count -lt $timeout ]; do
        if check_service_health "$service_name" "$port"; then
            print_success "$service_name is ready"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    print_error "$service_name failed to start within $timeout seconds"
    return 1
}

# Function to start a service
start_service() {
    local service_name=$1
    local port=$2
    
    if check_service_health "$service_name" "$port"; then
        print_warning "$service_name is already running on port $port"
        return 0
    fi
    
    print_status "Starting $service_name on port $port..."
    
    # Create logs directory if it doesn't exist
    mkdir -p "$LOGS_DIR"
    
    # Start service based on type
    local log_file="$LOGS_DIR/${service_name}.log"
    
    cd "$SCRIPT_DIR"
    
    # Handle different service types
    case "$service_name" in
        "fast-accountlookup-service")
            cd "$service_name" && npm run dev > "../$log_file" 2>&1 &
            ;;
        "fast-requesthandler-service")
            cd "$service_name" && npm run dev > "../$log_file" 2>&1 &
            ;;
        "fast-enrichment-service")
            cd "$service_name" && npm run dev > "../$log_file" 2>&1 &
            ;;
        "fast-validation-service")
            cd "$service_name" && npm run dev > "../$log_file" 2>&1 &
            ;;
        "fast-orchestrator-service")
            cd "$service_name" && npm run dev > "../$log_file" 2>&1 &
            ;;
        "fast-vammediation-service")
            cd "$service_name" && npm run dev > "../$log_file" 2>&1 &
            ;;
        "fast-accounting-service")
            cd "$service_name" && node accounting-service.js > "../$log_file" 2>&1 &
            ;;
    esac
    
    local pid=$!
    PIDS+=($pid)
    
    cd "$SCRIPT_DIR"
    
    # Wait for service to be ready
    if wait_for_service "$service_name" "$port"; then
        print_success "$service_name started successfully (PID: $pid)"
        return 0
    else
        print_error "$service_name failed to start"
        return 1
    fi
}

# Function to stop all services
stop_services() {
    print_status "Stopping all services..."
    
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping PID $pid..."
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait for processes to stop
    sleep 3
    
    # Force kill if needed
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            print_warning "Force killing PID $pid..."
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    
    # Kill any remaining processes
    pkill -f "fast-" 2>/dev/null || true
    
    print_success "All services stopped"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        return 1
    fi
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        return 1
    fi
    
    # Check if Kafka is running
    if ! nc -z localhost 9092 2>/dev/null; then
        print_error "Kafka is not running on localhost:9092"
        print_error "Please start Kafka before running this test"
        return 1
    fi
    
    print_success "Prerequisites check passed"
    return 0
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing test dependencies..."
    
    # Install root dependencies
    if [ ! -f "package.json" ]; then
        print_status "Creating package.json for test dependencies..."
        cat > package.json << EOF
{
  "name": "complete-e2e-test",
  "version": "1.0.0",
  "description": "Complete End-to-End Test for VAM/MDZ flows",
  "main": "complete-e2e-vam-mdz-test.js",
  "dependencies": {
    "@grpc/grpc-js": "^1.8.0",
    "@grpc/proto-loader": "^0.7.0",
    "kafkajs": "^2.2.4",
    "axios": "^1.6.0",
    "uuid": "^9.0.0"
  }
}
EOF
    fi
    
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    print_success "Dependencies installed"
}

# Function to run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    local all_healthy=true
    
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo "$service_config" | cut -d':' -f1)
        local port=$(echo "$service_config" | cut -d':' -f2)
        
        if check_service_health "$service_name" "$port"; then
            print_success "$service_name (port $port): healthy"
        else
            print_error "$service_name (port $port): unhealthy"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        print_success "All services are healthy"
        return 0
    else
        print_error "Some services are unhealthy"
        return 1
    fi
}

# Function to run the complete test
run_complete_test() {
    print_header "🧪 Running Complete End-to-End Test"
    
    if ! node complete-e2e-vam-mdz-test.js; then
        print_error "Complete end-to-end test failed"
        return 1
    fi
    
    print_success "Complete end-to-end test passed"
    return 0
}

# Function to show service logs
show_service_logs() {
    print_header "📋 Service Logs Summary"
    
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo "$service_config" | cut -d':' -f1)
        local log_file="$LOGS_DIR/${service_name}.log"
        
        if [ -f "$log_file" ]; then
            echo
            print_status "Last 10 lines of $service_name:"
            tail -10 "$log_file"
        fi
    done
}

# Cleanup function
cleanup() {
    print_header "🧹 Cleaning up..."
    stop_services
    
    if [ "$1" != "keep-logs" ]; then
        rm -rf "$LOGS_DIR"
    fi
    
    print_success "Cleanup completed"
}

# Main execution
main() {
    print_header "🚀 Complete End-to-End Test for VAM/MDZ Flows"
    print_header "============================================="
    
    # Set up cleanup trap
    trap cleanup EXIT INT TERM
    
    # Check prerequisites
    if ! check_prerequisites; then
        print_error "Prerequisites check failed"
        exit 1
    fi
    
    # Install dependencies
    install_dependencies
    
    # Stop any existing services
    stop_services
    
    # Create logs directory
    mkdir -p "$LOGS_DIR"
    
    # Start services in order
    print_header "🏗️  Starting Services"
    
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo "$service_config" | cut -d':' -f1)
        local port=$(echo "$service_config" | cut -d':' -f2)
        
        if ! start_service "$service_name" "$port"; then
            print_error "Failed to start $service_name"
            show_service_logs
            exit 1
        fi
    done
    
    # Wait for all services to stabilize
    print_status "Waiting for services to stabilize..."
    sleep 5
    
    # Run health checks
    if ! run_health_checks; then
        print_error "Health checks failed"
        show_service_logs
        exit 1
    fi
    
    # Run the complete test
    if ! run_complete_test; then
        print_error "Complete test failed"
        show_service_logs
        exit 1
    fi
    
    print_success "🎉 All tests completed successfully!"
    
    # Show summary
    print_header "📊 Test Summary"
    echo "✅ VAM Flow: Request Handler → Enrichment → Validation → Orchestrator → VAM Mediation → Accounting"
    echo "✅ MDZ Flow: Request Handler → Enrichment → Validation → Orchestrator → Accounting (direct)"
    echo "✅ Both flows reached the accounting service successfully"
    
    print_header "📋 Log Files"
    echo "Log files are available in: $LOGS_DIR"
    echo "Use 'tail -f $LOGS_DIR/SERVICE_NAME.log' to monitor individual services"
    
    # Keep cleanup trap but don't remove logs
    trap 'cleanup keep-logs' EXIT
}

# Handle command line arguments
case "${1:-}" in
    "help"|"--help"|"-h")
        echo "Usage: $0 [help|clean]"
        echo "  help  - Show this help message"
        echo "  clean - Clean up services and logs"
        exit 0
        ;;
    "clean"|"--clean")
        cleanup
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac 