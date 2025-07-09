#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

# Function to check if a service is running on a specific port
check_port() {
    local port=$1
    local service_name=$2
    
    if lsof -i :$port > /dev/null 2>&1; then
        print_success "$service_name is running on port $port"
        return 0
    else
        print_warning "$service_name is not running on port $port"
        return 1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for $service_name to be ready on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if check_port $port "$service_name"; then
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts - $service_name not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within timeout"
    return 1
}

# Function to start a service
start_service() {
    local service_dir=$1
    local service_name=$2
    local port=$3
    local log_file=$4
    
    print_status "Starting $service_name..."
    
    # Check if service is already running
    if check_port $port "$service_name"; then
        print_warning "$service_name is already running"
        return 0
    fi
    
    # Start the service
    cd "$service_dir" || {
        print_error "Failed to change to $service_dir"
        return 1
    }
    
    # Kill any existing process
    pkill -f "$service_name" 2>/dev/null || true
    
    # Start the service in background
    npm run dev > "../logs/$log_file" 2>&1 &
    local pid=$!
    
    print_status "$service_name started with PID $pid"
    
    # Wait for service to be ready
    if wait_for_service $port "$service_name"; then
        print_success "$service_name is ready"
        return 0
    else
        print_error "$service_name failed to start"
        return 1
    fi
}

# Function to cleanup processes
cleanup() {
    print_status "Cleaning up processes..."
    
    # Kill all fast services
    pkill -f "fast-accountlookup-service" 2>/dev/null || true
    pkill -f "fast-requesthandler-service" 2>/dev/null || true
    pkill -f "fast-enrichment-service" 2>/dev/null || true
    pkill -f "fast-validation-service" 2>/dev/null || true
    pkill -f "fast-orchestrator-service" 2>/dev/null || true
    pkill -f "fast-vammediation-service" 2>/dev/null || true
    
    sleep 2
    print_success "Cleanup complete"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        return 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        return 1
    fi
    
    # Check if Kafka is running
    if ! check_port 9092 "Kafka"; then
        print_error "Kafka is not running on port 9092"
        return 1
    fi
    
    # Create logs directory
    mkdir -p logs
    
    print_success "Prerequisites check passed"
    return 0
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install test dependencies
    if [ ! -d "node_modules" ]; then
        print_status "Installing root dependencies..."
        npm install
    fi
    
    local services=(
        "fast-accountlookup-service"
        "fast-requesthandler-service"
        "fast-enrichment-service"
        "fast-validation-service"
        "fast-orchestrator-service"
        "fast-vammediation-service"
    )
    
    for service in "${services[@]}"; do
        if [ -d "$service" ]; then
            print_status "Installing dependencies for $service..."
            cd "$service" || continue
            
            if [ ! -d "node_modules" ]; then
                npm install
            fi
            
            # Build TypeScript services
            if [ -f "tsconfig.json" ]; then
                npm run build 2>/dev/null || true
            fi
            
            cd ..
        fi
    done
    
    print_success "Dependencies installed"
}

# Main function
main() {
    print_status "🚀 Starting VAM End-to-End Test Environment"
    
    # Handle script termination
    trap cleanup EXIT INT TERM
    
    # Check prerequisites
    if ! check_prerequisites; then
        print_error "Prerequisites check failed"
        exit 1
    fi
    
    # Install dependencies
    install_dependencies
    
    # Start services in order
    print_status "Starting services..."
    
    # 1. Account Lookup Service (port 50059)
    start_service "fast-accountlookup-service" "fast-accountlookup-service" 50059 "account-lookup.log"
    
    # 2. Request Handler Service (port 50051)
    start_service "fast-requesthandler-service" "fast-requesthandler-service" 50051 "request-handler.log"
    
    # 3. Enrichment Service (port 50052)
    start_service "fast-enrichment-service" "fast-enrichment-service" 50052 "enrichment.log"
    
    # 4. Validation Service (port 50053)
    start_service "fast-validation-service" "fast-validation-service" 50053 "validation.log"
    
    # 5. Orchestrator Service (port 3004)
    start_service "fast-orchestrator-service" "fast-orchestrator-service" 3004 "orchestrator.log"
    
    # 6. VAM Mediation Service (port 3005)
    start_service "fast-vammediation-service" "fast-vammediation-service" 3005 "vam-mediation.log"
    
    # Wait a bit for all services to stabilize
    print_status "Waiting for services to stabilize..."
    sleep 5
    
    # Run the end-to-end test
    print_status "🧪 Running VAM End-to-End Tests..."
    
    # Install test dependencies if needed
    if [ ! -f "node_modules/@grpc/grpc-js/package.json" ]; then
        print_status "Installing test dependencies..."
        npm install @grpc/grpc-js @grpc/proto-loader kafkajs axios uuid
    fi
    
    # Run the test
    cd /Users/hari/GPPG3
    node end-to-end-vam-test.js
    local test_result=$?
    
    if [ $test_result -eq 0 ]; then
        print_success "🎉 VAM End-to-End Tests completed successfully!"
    else
        print_error "❌ VAM End-to-End Tests failed!"
    fi
    
    # Show service logs if tests failed
    if [ $test_result -ne 0 ]; then
        print_status "📋 Service logs (last 20 lines each):"
        
        for log_file in logs/*.log; do
            if [ -f "$log_file" ]; then
                echo -e "\n${CYAN}=== $(basename "$log_file") ===${NC}"
                tail -n 20 "$log_file"
            fi
        done
    fi
    
    # Keep services running if requested
    if [ "$1" = "--keep-running" ]; then
        print_status "Services are still running. Press Ctrl+C to stop."
        while true; do
            sleep 10
        done
    fi
    
    return $test_result
}

# Script execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi 