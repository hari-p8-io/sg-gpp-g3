#!/bin/bash

# Simple Service Startup Script for GPPG3
# Starts services one by one with proper error handling

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICES_BASE_DIR="/Users/hari/GPPG3"
STARTUP_DELAY=3

# Service definitions (in startup order) - using arrays instead of associative arrays
SERVICE_ORDER=(
    "fast-referencedata-service"
    "fast-accountlookup-service"
    "fast-validation-service"
    "fast-enrichment-service"
    "fast-requesthandler-service"
    "fast-orchestrator-service"
    "fast-limitcheck-service"
    "fast-accounting-service"
)

SERVICE_PORTS=(
    "50060"  # fast-referencedata-service
    "50059"  # fast-accountlookup-service
    "50053"  # fast-validation-service
    "50052"  # fast-enrichment-service
    "50051"  # fast-requesthandler-service
    "3004"   # fast-orchestrator-service
    "3006"   # fast-limitcheck-service
    "8002"   # fast-accounting-service
)

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to get port for service
get_service_port() {
    local service=$1
    for i in "${!SERVICE_ORDER[@]}"; do
        if [[ "${SERVICE_ORDER[$i]}" == "$service" ]]; then
            echo "${SERVICE_PORTS[$i]}"
            return
        fi
    done
    echo ""
}

# Utility functions
kill_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        log_warning "Killing processes on port $port: $pids"
        kill -9 $pids 2>/dev/null || true
        sleep 2
    fi
}

wait_for_port() {
    local port=$1
    local timeout=${2:-30}
    local count=0
    
    while [[ $count -lt $timeout ]]; do
        if netstat -an | grep -q ":$port.*LISTEN"; then
            return 0
        fi
        sleep 1
        ((count++))
    done
    return 1
}

cleanup_all() {
    log_info "Cleaning up all services..."
    
    # Kill all npm processes
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "ts-node" 2>/dev/null || true
    pkill -f "node.*service" 2>/dev/null || true
    
    # Kill processes on specific ports
    for port in "${SERVICE_PORTS[@]}"; do
        kill_port "$port"
    done
    
    # Clean up temp files
    rm -f /tmp/fast-*.log /tmp/fast-*.pid
    
    log_success "Cleanup completed"
}

start_service() {
    local service=$1
    local port=$(get_service_port "$service")
    
    if [[ -z "$port" ]]; then
        log_error "Port not found for service: $service"
        return 1
    fi
    
    log_info "Starting $service on port $port..."
    
    # Kill any existing process on the port
    kill_port $port
    
    # Check if service directory exists
    if [[ ! -d "$SERVICES_BASE_DIR/$service" ]]; then
        log_error "Service directory not found: $SERVICES_BASE_DIR/$service"
        return 1
    fi
    
    # Change to service directory
    cd "$SERVICES_BASE_DIR/$service"
    
    # Start the service in background
    log_info "Running: npm run dev (in $service)"
    npm run dev > "/tmp/$service.log" 2>&1 &
    local pid=$!
    
    # Store PID for cleanup
    echo $pid > "/tmp/$service.pid"
    
    # Wait for service to start
    if wait_for_port $port 30; then
        log_success "$service started successfully (PID: $pid) on port $port"
        log_info "Waiting $STARTUP_DELAY seconds before next service..."
        sleep $STARTUP_DELAY
        return 0
    else
        log_error "$service failed to start within 30 seconds"
        log_error "Last 10 lines of log:"
        tail -10 "/tmp/$service.log" 2>/dev/null || echo "No log file found"
        return 1
    fi
}

show_service_status() {
    log_info "Service Status:"
    log_info "==============="
    
    for i in "${!SERVICE_ORDER[@]}"; do
        local service="${SERVICE_ORDER[$i]}"
        local port="${SERVICE_PORTS[$i]}"
        
        if netstat -an | grep -q ":$port.*LISTEN"; then
            log_success "$service: Running on port $port"
        else
            log_error "$service: Not running (port $port)"
        fi
    done
}

# Main execution
main() {
    log_info "Starting GPPG3 Services"
    log_info "======================="
    
    # Trap to cleanup on exit
    trap cleanup_all EXIT
    
    # Cleanup any existing services
    log_info "Cleaning up existing services..."
    cleanup_all
    sleep 2
    
    # Start services in order
    local failed_services=0
    for service in "${SERVICE_ORDER[@]}"; do
        if ! start_service "$service"; then
            ((failed_services++))
            log_error "Failed to start $service"
            
            # Show recent log entries
            if [[ -f "/tmp/$service.log" ]]; then
                log_error "Recent log entries for $service:"
                tail -20 "/tmp/$service.log"
            fi
        fi
    done
    
    # Show final status
    echo ""
    show_service_status
    
    if [[ $failed_services -eq 0 ]]; then
        log_success "All services started successfully! 🎉"
        log_info "Services are running in the background"
        log_info "Use 'pkill -f \"npm run dev\"' to stop all services"
        log_info "Or press Ctrl+C to stop this script and cleanup"
        
        # Keep script running
        log_info "Press Ctrl+C to stop all services..."
        while true; do
            sleep 10
            # Check if any service died
            local dead_services=0
            for i in "${!SERVICE_ORDER[@]}"; do
                local service="${SERVICE_ORDER[$i]}"
                local port="${SERVICE_PORTS[$i]}"
                if ! netstat -an | grep -q ":$port.*LISTEN"; then
                    log_warning "$service appears to have stopped"
                    ((dead_services++))
                fi
            done
            
            if [[ $dead_services -gt 0 ]]; then
                log_error "$dead_services services have stopped"
                show_service_status
            fi
        done
    else
        log_error "$failed_services services failed to start"
        exit 1
    fi
}

# Handle command line arguments
case "${1:-start}" in
    "start")
        main
        ;;
    "stop")
        cleanup_all
        ;;
    "status")
        show_service_status
        ;;
    *)
        echo "Usage: $0 [start|stop|status]"
        echo "  start  - Start all services (default)"
        echo "  stop   - Stop all services"
        echo "  status - Show service status"
        exit 1
        ;;
esac 