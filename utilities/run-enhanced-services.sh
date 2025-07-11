#!/bin/bash

# Enhanced Services Startup Script
# This script starts all services including the new reference data service and limit check service

set -e

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
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ✅ $1"
}

print_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ❌ $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ⚠️  $1"
}

print_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ℹ️  $1"
}

# Function to check if a port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 1
    else
        return 0
    fi
}

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        print_warning "Killing processes on port $port: $pids"
        echo $pids | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url/health" > /dev/null 2>&1; then
            print_success "$service_name is ready!"
            return 0
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            print_info "Still waiting for $service_name... (attempt $attempt/$max_attempts)"
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within $((max_attempts * 2)) seconds"
    return 1
}

# Function to check if Kafka is running
check_kafka() {
    if nc -z localhost 9092 2>/dev/null; then
        print_success "Kafka is running"
        return 0
    else
        print_error "Kafka is not running on localhost:9092"
        print_info "Please start Kafka first: brew services start kafka"
        return 1
    fi
}

# Function to install dependencies for a service
install_dependencies() {
    local service_dir=$1
    local service_name=$2
    
    if [ -d "$service_dir" ]; then
        print_status "Installing dependencies for $service_name..."
        cd "$service_dir"
        
        if [ -f "package.json" ]; then
            npm install > /dev/null 2>&1
            print_success "$service_name dependencies installed"
        else
            print_warning "No package.json found for $service_name"
        fi
        
        cd - > /dev/null
    else
        print_error "Service directory $service_dir does not exist"
        return 1
    fi
}

# Function to start a Node.js service
start_nodejs_service() {
    local service_dir=$1
    local service_name=$2
    local port=$3
    
    print_status "Starting $service_name on port $port..."
    
    # Kill any existing process on the port
    kill_port $port
    
    # Check if service directory exists
    if [ ! -d "$service_dir" ]; then
        print_error "Service directory $service_dir does not exist"
        return 1
    fi
    
    # Start the service
    cd "$service_dir"
    nohup npm run dev > "../logs/${service_name}.log" 2>&1 &
    local pid=$!
    
    # Store PID for later cleanup
    echo $pid > "../logs/${service_name}.pid"
    
    print_success "$service_name started with PID $pid"
    cd - > /dev/null
    
    return 0
}

# Function to start a Java service
start_java_service() {
    local service_dir=$1
    local service_name=$2
    local port=$3
    
    print_status "Starting $service_name on port $port..."
    
    # Kill any existing process on the port
    kill_port $port
    
    # Check if service directory exists
    if [ ! -d "$service_dir" ]; then
        print_error "Service directory $service_dir does not exist"
        return 1
    fi
    
    # Start the service
    cd "$service_dir"
    nohup mvn spring-boot:run > "../logs/${service_name}.log" 2>&1 &
    local pid=$!
    
    # Store PID for later cleanup
    echo $pid > "../logs/${service_name}.pid"
    
    print_success "$service_name started with PID $pid"
    cd - > /dev/null
    
    return 0
}

# Function to cleanup and exit
cleanup() {
    print_status "Cleaning up..."
    
    # Kill all started services
    for pidfile in logs/*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            service_name=$(basename "$pidfile" .pid)
            print_info "Stopping $service_name (PID: $pid)"
            kill -9 "$pid" 2>/dev/null || true
            rm -f "$pidfile"
        fi
    done
    
    print_success "Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    print_status "🚀 Starting Enhanced GPP G3 Services with Reference Data and Limit Check"
    print_info "This includes: Reference Data Service, Limit Check Service, and enhanced orchestration"
    echo
    
    # Create logs directory
    mkdir -p logs
    
    # Step 1: Pre-flight checks
    print_status "Step 1: Pre-flight checks"
    
    # Check if Kafka is running
    if ! check_kafka; then
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check Java
    if ! command -v java &> /dev/null; then
        print_error "Java is not installed"
        exit 1
    fi
    
    # Check Maven
    if ! command -v mvn &> /dev/null; then
        print_error "Maven is not installed"
        exit 1
    fi
    
    print_success "Pre-flight checks passed"
    echo
    
    # Step 2: Install dependencies
    print_status "Step 2: Installing dependencies"
    
    # Install dependencies for all Node.js services
    install_dependencies "fast-requesthandler-service" "Request Handler Service"
    install_dependencies "fast-enrichment-service" "Enrichment Service"
    install_dependencies "fast-referencedata-service" "Reference Data Service"
    install_dependencies "fast-validation-service" "Validation Service"
    install_dependencies "fast-orchestrator-service" "Orchestrator Service"
    install_dependencies "fast-limitcheck-service" "Limit Check Service"
    install_dependencies "fast-vammediation-service" "VAM Mediation Service"
    
    print_success "Dependencies installed"
    echo
    
    # Step 3: Start services in order
    print_status "Step 3: Starting services"
    
    # Start Reference Data Service first (new service)
    start_nodejs_service "fast-referencedata-service" "reference-data-service" 50060
    
    # Start core services
    start_nodejs_service "fast-requesthandler-service" "request-handler-service" 3001
    start_nodejs_service "fast-enrichment-service" "enrichment-service" 50052
    start_nodejs_service "fast-validation-service" "validation-service" 50053
    start_nodejs_service "fast-orchestrator-service" "orchestrator-service" 3004
    
    # Start Limit Check Service (new service)
    start_nodejs_service "fast-limitcheck-service" "limit-check-service" 3006
    
    # Start mediation services
    start_nodejs_service "fast-vammediation-service" "vam-mediation-service" 3005
    
    # Start Java services
    start_java_service "services/java/fast-accounting-service" "accounting-service" 8002
    
    print_success "All services started"
    echo
    
    # Step 4: Wait for services to be ready
    print_status "Step 4: Waiting for services to be ready"
    
    # Wait for all services to be ready
    wait_for_service "Request Handler Service" "http://localhost:3001"
    wait_for_service "Enrichment Service" "http://localhost:50052"
    wait_for_service "Reference Data Service" "http://localhost:50060"
    wait_for_service "Validation Service" "http://localhost:50053"
    wait_for_service "Orchestrator Service" "http://localhost:3004"
    wait_for_service "Limit Check Service" "http://localhost:3006"
    wait_for_service "VAM Mediation Service" "http://localhost:3005"
    wait_for_service "Accounting Service" "http://localhost:8002"
    
    print_success "All services are ready!"
    echo
    
    # Step 5: Display service information
    print_status "Step 5: Service Information"
    
    echo -e "${CYAN}📊 Service URLs:${NC}"
    echo -e "  🔗 Request Handler:    http://localhost:3001/health"
    echo -e "  🔗 Enrichment:         http://localhost:50052/health"
    echo -e "  🔗 Reference Data:     http://localhost:50060/health"
    echo -e "  🔗 Validation:         http://localhost:50053/health"
    echo -e "  🔗 Orchestrator:       http://localhost:3004/health"
    echo -e "  🔗 Limit Check:        http://localhost:3006/health"
    echo -e "  🔗 VAM Mediation:      http://localhost:3005/health"
    echo -e "  🔗 Accounting:         http://localhost:8002/health"
    echo
    
    echo -e "${CYAN}📊 API Endpoints:${NC}"
    echo -e "  📤 Send Message:       POST http://localhost:3001/api/v1/messages"
    echo -e "  📋 Orchestration:      GET  http://localhost:3004/api/v1/orchestration"
    echo -e "  🔍 Limit Checks:       GET  http://localhost:3006/api/v1/limitchecks"
    echo -e "  💰 Accounting:         GET  http://localhost:8002/api/v1/accounting"
    echo
    
    echo -e "${CYAN}🧪 Testing:${NC}"
    echo -e "  🔬 Enhanced Flow Test: node test-enhanced-flow.js"
    echo -e "  📝 Test Specific Flow: curl -X POST http://localhost:3001/api/v1/messages -d '...'"
    echo
    
    echo -e "${CYAN}🔍 New Features:${NC}"
    echo -e "  📊 Reference Data Service: Provides auth method lookup (AFPONLY, AFPTHENLIMIT, GROUPLIMIT)"
    echo -e "  🔒 Limit Check Service: Processes GROUPLIMIT transactions via Kafka"
    echo -e "  🔄 Enhanced Orchestration: Routes GROUPLIMIT to limit check service"
    echo -e "  💡 Auth Method Routing: Different flows based on authentication method"
    echo
    
    # Step 6: Monitor services
    print_status "Step 6: Monitoring services (press Ctrl+C to stop all services)"
    
    # Monitor loop
    while true; do
        sleep 10
        
        # Check if any service has died
        for pidfile in logs/*.pid; do
            if [ -f "$pidfile" ]; then
                pid=$(cat "$pidfile")
                service_name=$(basename "$pidfile" .pid)
                
                if ! kill -0 "$pid" 2>/dev/null; then
                    print_error "$service_name (PID: $pid) has died"
                    rm -f "$pidfile"
                fi
            fi
        done
    done
}

# Run main function
main "$@" 