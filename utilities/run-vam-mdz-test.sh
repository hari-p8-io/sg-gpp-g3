#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

# Function to check if a service is running
check_service() {
    local service_name=$1
    local service_url=$2
    
    curl -s -f "$service_url" > /dev/null 2>&1
    return $?
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local service_url=$2
    local timeout=30
    local count=0
    
    print_status "Waiting for $service_name to be ready..."
    
    while [ $count -lt $timeout ]; do
        if check_service "$service_name" "$service_url"; then
            print_success "$service_name is ready"
            return 0
        fi
        
        echo -n "."
        sleep 1
        ((count++))
    done
    
    print_error "$service_name failed to start within $timeout seconds"
    return 1
}

# Function to start a service
start_service() {
    local service_name=$1
    local service_dir=$2
    local service_command=$3
    local log_file=$4
    
    print_status "Starting $service_name..."
    
    cd "$service_dir" || {
        print_error "Failed to change to directory $service_dir"
        return 1
    }
    
    # Start the service in background
    eval "$service_command" > "$log_file" 2>&1 &
    
    # Store the PID
    local pid=$!
    echo $pid > "${service_name}.pid"
    
    print_success "$service_name started (PID: $pid)"
    cd - > /dev/null
}

# Function to stop services
stop_services() {
    print_status "Stopping services..."
    
    # Kill services by PID files
    for pid_file in *.pid; do
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                print_status "Stopping service (PID: $pid)"
                kill -TERM "$pid" 2>/dev/null
                sleep 2
                if kill -0 "$pid" 2>/dev/null; then
                    kill -KILL "$pid" 2>/dev/null
                fi
            fi
            rm -f "$pid_file"
        fi
    done
    
    # Also kill any remaining processes
    pkill -f "fast-accounting-service"
    pkill -f "fast-vammediation-service"
    pkill -f "fast-orchestrator-service"
    
    print_success "Services stopped"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install main test dependencies
    npm install > /dev/null 2>&1
    
    # Install service dependencies
    for service_dir in fast-accounting-service fast-vammediation-service fast-orchestrator-service; do
        if [ -d "$service_dir" ]; then
            print_status "Installing dependencies for $service_dir..."
            cd "$service_dir" && npm install > /dev/null 2>&1
            cd - > /dev/null
        fi
    done
    
    print_success "Dependencies installed"
}

# Function to create logs directory
create_logs_dir() {
    if [ ! -d "logs" ]; then
        mkdir logs
        print_status "Created logs directory"
    fi
}

# Trap to cleanup on exit
trap 'stop_services' EXIT

# Main execution
main() {
    print_status "🚀 Starting VAM/MDZ Flow Test Suite"
    echo "======================================"
    
    # Create logs directory
    create_logs_dir
    
    # Install dependencies if requested
    if [ "$1" = "--install-deps" ]; then
        install_dependencies
    fi
    
    # Stop any existing services
    stop_services
    
    # Start services
    print_status "Starting required services..."
    
    # Start accounting service
    start_service "accounting-service" "fast-accounting-service" "npm run dev" "../logs/accounting-service.log"
    
    # Start VAM mediation service
    start_service "vam-mediation-service" "fast-vammediation-service" "npm run dev" "../logs/vam-mediation-service.log"
    
    # Start orchestrator service (build first)
    print_status "Building orchestrator service..."
    cd fast-orchestrator-service && npm run build > /dev/null 2>&1 && cd - > /dev/null
    start_service "orchestrator-service" "fast-orchestrator-service" "npm run start" "../logs/orchestrator-service.log"
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 5
    
    # Check service health
    if wait_for_service "Accounting Service" "http://localhost:8002/health"; then
        print_success "✅ Accounting Service is ready"
    else
        print_error "❌ Accounting Service failed to start"
        exit 1
    fi
    
    if wait_for_service "VAM Mediation Service" "http://localhost:3005/health"; then
        print_success "✅ VAM Mediation Service is ready"
    else
        print_error "❌ VAM Mediation Service failed to start"
        exit 1
    fi
    
    if wait_for_service "Orchestrator Service" "http://localhost:3004/health"; then
        print_success "✅ Orchestrator Service is ready"
    else
        print_error "❌ Orchestrator Service failed to start"
        exit 1
    fi
    
    print_success "🎉 All services are ready!"
    
    # Run the test
    print_status "Running VAM/MDZ Flow Test..."
    echo ""
    
    node test-vam-mdz-flows.js
    
    local test_result=$?
    
    if [ $test_result -eq 0 ]; then
        print_success "🎉 Tests completed successfully!"
    else
        print_error "❌ Tests failed with exit code $test_result"
    fi
    
    # Show service logs if tests failed
    if [ $test_result -ne 0 ]; then
        print_status "Service logs:"
        echo ""
        echo "=== Accounting Service Log ==="
        tail -20 logs/accounting-service.log
        echo ""
        echo "=== VAM Mediation Service Log ==="
        tail -20 logs/vam-mediation-service.log
        echo ""
        echo "=== Orchestrator Service Log ==="
        tail -20 logs/orchestrator-service.log
    fi
}

# Show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --install-deps    Install npm dependencies before starting services"
    echo "  --help           Show this help message"
    echo ""
    echo "This script will:"
    echo "  1. Start the accounting service (port 8002)"
    echo "  2. Start the VAM mediation service (port 3005)"
    echo "  3. Start the orchestrator service (port 3004)"
    echo "  4. Run the VAM/MDZ flow test"
    echo "  5. Show test results"
    echo ""
    echo "Expected flow verification:"
    echo "  - VAM accounts (999888777) → VAM mediation → Accounting service"
    echo "  - MDZ accounts (MDZ123456) → Accounting service (direct)"
}

# Parse command line arguments
if [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main function
main "$@" 