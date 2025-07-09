#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting Orchestration Test Environment${NC}"
echo "=============================================="

# Create logs directory
mkdir -p logs

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  Port $1 is already in use${NC}"
        return 1
    else
        return 0
    fi
}

# Function to check if Kafka is running
check_kafka() {
    echo -e "${BLUE}🔍 Checking Kafka...${NC}"
    if nc -z localhost 9092; then
        echo -e "${GREEN}✅ Kafka is running on port 9092${NC}"
        return 0
    else
        echo -e "${RED}❌ Kafka is not running on port 9092${NC}"
        echo "Please start Kafka before running this script"
        return 1
    fi
}

# Function to install dependencies
install_dependencies() {
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    
    # Install orchestrator dependencies
    if [ -d "fast-orchestrator-service" ]; then
        echo "Installing orchestrator dependencies..."
        cd fast-orchestrator-service && npm install && cd ..
    fi
    
    # Install accounting service dependencies
    if [ -d "fast-accounting-service" ]; then
        echo "Installing accounting service dependencies..."
        cd fast-accounting-service && npm install && cd ..
    fi
    
    # Install VAM mediation service dependencies
    if [ -d "fast-vammediation-service" ]; then
        echo "Installing VAM mediation dependencies..."
        cd fast-vammediation-service && npm install && cd ..
    fi
    
    # Install test dependencies
    echo "Installing test dependencies..."
    npm install kafkajs axios uuid 2>/dev/null || echo "Installing test dependencies in current directory..."
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# Function to start a service
start_service() {
    local service_name=$1
    local service_dir=$2
    local command=$3
    local port=$4
    local log_file="logs/${service_name}.log"
    
    echo -e "${BLUE}🚀 Starting ${service_name}...${NC}"
    
    if check_port $port; then
        cd $service_dir
        nohup $command > "../${log_file}" 2>&1 &
        local pid=$!
        echo $pid > "../logs/${service_name}.pid"
        cd ..
        
        # Wait a moment and check if the process is still running
        sleep 2
        if kill -0 $pid 2>/dev/null; then
            echo -e "${GREEN}✅ ${service_name} started successfully (PID: $pid)${NC}"
            return 0
        else
            echo -e "${RED}❌ ${service_name} failed to start${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  ${service_name} may already be running${NC}"
        return 1
    fi
}

# Function to check service health
check_service_health() {
    local service_name=$1
    local health_url=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${BLUE}🔍 Checking ${service_name} health...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$health_url" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ ${service_name} is healthy${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Waiting for ${service_name} to be ready (attempt $attempt/$max_attempts)${NC}"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ ${service_name} health check failed${NC}"
    return 1
}

# Function to stop all services
stop_services() {
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    
    for pid_file in logs/*.pid; do
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            local service_name=$(basename "$pid_file" .pid)
            
            if kill -0 $pid 2>/dev/null; then
                echo "Stopping $service_name (PID: $pid)"
                kill $pid
                sleep 2
                
                # Force kill if still running
                if kill -0 $pid 2>/dev/null; then
                    echo "Force stopping $service_name"
                    kill -9 $pid
                fi
            fi
            
            rm "$pid_file"
        fi
    done
    
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Function to run tests
run_tests() {
    echo -e "${CYAN}🎯 Running Orchestration Tests...${NC}"
    echo "=============================================="
    
    # Give services a moment to settle
    sleep 3
    
    # Run the test script
    node test-orchestration.js
    
    echo -e "${CYAN}📊 Test execution completed${NC}"
}

# Function to show logs
show_logs() {
    echo -e "${CYAN}📋 Service Logs${NC}"
    echo "=============================================="
    
    for log_file in logs/*.log; do
        if [ -f "$log_file" ]; then
            local service_name=$(basename "$log_file" .log)
            echo -e "${BLUE}--- ${service_name} ---${NC}"
            tail -n 10 "$log_file"
            echo ""
        fi
    done
}

# Trap to stop services on script exit
trap stop_services EXIT

# Main execution
main() {
    # Check prerequisites
    if ! check_kafka; then
        exit 1
    fi
    
    # Install dependencies if needed
    if [ "$1" = "--install-deps" ] || [ ! -d "node_modules" ]; then
        install_dependencies
    fi
    
    # Start services
    echo -e "${CYAN}🚀 Starting Services...${NC}"
    echo "=============================================="
    
    # Start Accounting Service
    if ! start_service "accounting-service" "fast-accounting-service" "npm run dev" 8002; then
        echo -e "${RED}❌ Failed to start accounting service${NC}"
        exit 1
    fi
    
    # Start VAM Mediation Service
    if ! start_service "vam-mediation-service" "fast-vammediation-service" "npm run dev" 3005; then
        echo -e "${RED}❌ Failed to start VAM mediation service${NC}"
        exit 1
    fi
    
    # Build and start Orchestrator Service
    if [ -d "fast-orchestrator-service" ]; then
        echo -e "${BLUE}🔨 Building orchestrator service...${NC}"
        cd fast-orchestrator-service && npm run build && cd ..
        
        if ! start_service "orchestrator-service" "fast-orchestrator-service" "npm run start" 3004; then
            echo -e "${RED}❌ Failed to start orchestrator service${NC}"
            exit 1
        fi
    fi
    
    # Wait for services to be ready
    echo -e "${CYAN}⏳ Waiting for services to be ready...${NC}"
    
    if ! check_service_health "Accounting Service" "http://localhost:8002/health"; then
        exit 1
    fi
    
    if ! check_service_health "VAM Mediation Service" "http://localhost:3005/health"; then
        exit 1
    fi
    
    if ! check_service_health "Orchestrator Service" "http://localhost:3004/health"; then
        exit 1
    fi
    
    echo -e "${GREEN}✅ All services are running and healthy${NC}"
    echo ""
    
    # Show service endpoints
    echo -e "${CYAN}🌐 Service Endpoints${NC}"
    echo "=============================================="
    echo "Orchestrator Service: http://localhost:3004/health"
    echo "VAM Mediation Service: http://localhost:3005/health"
    echo "Accounting Service: http://localhost:8002/health"
    echo ""
    
    # Run tests
    if [ "$1" != "--no-test" ]; then
        run_tests
    fi
    
    # Show logs if requested
    if [ "$1" = "--show-logs" ]; then
        show_logs
    fi
    
    echo -e "${CYAN}🎉 Orchestration test environment is ready!${NC}"
    echo "Press Ctrl+C to stop all services"
    
    # Keep script running
    while true; do
        sleep 10
    done
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --install-deps    Install dependencies before starting"
    echo "  --no-test         Skip running tests"
    echo "  --show-logs       Show service logs after startup"
    echo "  --help            Show this help message"
    echo ""
    echo "This script will:"
    echo "1. Check if Kafka is running"
    echo "2. Install dependencies (if needed)"
    echo "3. Start all required services"
    echo "4. Run orchestration tests"
    echo "5. Keep services running until Ctrl+C"
}

# Parse command line arguments
case "$1" in
    --help)
        show_help
        exit 0
        ;;
    *)
        main "$1"
        ;;
esac 