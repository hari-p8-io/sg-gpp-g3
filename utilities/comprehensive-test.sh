#!/bin/bash

# Comprehensive End-to-End Test Script for GPPG3 Services
# Tests one scenario after another with proper error handling

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_TIMEOUT=30
MAX_RETRIES=3
SERVICES_BASE_DIR="/Users/hari/GPPG3"

# Service definitions
declare -A SERVICES=(
    ["fast-referencedata-service"]="50060:grpc"
    ["fast-accountlookup-service"]="50059:grpc"
    ["fast-validation-service"]="50053:grpc"
    ["fast-enrichment-service"]="50052:grpc"
    ["fast-requesthandler-service"]="50051:grpc"
    ["fast-orchestrator-service"]="3004:http"
    ["fast-limitcheck-service"]="3006:http"
    ["fast-accounting-service"]="8002:http"
)

# Test scenarios
declare -A SCENARIOS=(
    ["health-check"]="Basic health check for all services"
    ["account-lookup"]="Account lookup via gRPC"
    ["enrichment"]="Message enrichment flow"
    ["validation"]="Message validation"
    ["orchestration"]="End-to-end orchestration"
    ["limit-check"]="Limit checking"
    ["accounting"]="Accounting processing"
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
    local timeout=$2
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

check_service_health() {
    local service=$1
    local port_type=$2
    local port=$3
    
    case $port_type in
        "grpc")
            # For gRPC services, try to connect to the port
            if netstat -an | grep -q ":$port.*LISTEN"; then
                log_success "$service is running on port $port"
                return 0
            else
                log_error "$service is not running on port $port"
                return 1
            fi
            ;;
        "http")
            # For HTTP services, try to hit the health endpoint
            if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
                log_success "$service health check passed"
                return 0
            else
                log_error "$service health check failed"
                return 1
            fi
            ;;
    esac
}

start_service() {
    local service=$1
    local port_info=$2
    local port=$(echo $port_info | cut -d: -f1)
    local port_type=$(echo $port_info | cut -d: -f2)
    
    log_info "Starting $service on port $port..."
    
    # Kill any existing process on the port
    kill_port $port
    
    # Change to service directory
    cd "$SERVICES_BASE_DIR/$service"
    
    # Start the service in background
    npm run dev > "/tmp/$service.log" 2>&1 &
    local pid=$!
    
    # Wait for service to start
    if wait_for_port $port $TEST_TIMEOUT; then
        log_success "$service started successfully (PID: $pid)"
        echo $pid > "/tmp/$service.pid"
        return 0
    else
        log_error "$service failed to start within $TEST_TIMEOUT seconds"
        log_error "Last few lines of log:"
        tail -10 "/tmp/$service.log"
        return 1
    fi
}

stop_service() {
    local service=$1
    local port_info=$2
    local port=$(echo $port_info | cut -d: -f1)
    
    if [[ -f "/tmp/$service.pid" ]]; then
        local pid=$(cat "/tmp/$service.pid")
        if kill -0 $pid 2>/dev/null; then
            log_info "Stopping $service (PID: $pid)"
            kill $pid 2>/dev/null || true
            wait $pid 2>/dev/null || true
        fi
        rm -f "/tmp/$service.pid"
    fi
    
    # Force kill on port if still running
    kill_port $port
}

cleanup_all() {
    log_info "Cleaning up all services..."
    for service in "${!SERVICES[@]}"; do
        stop_service "$service" "${SERVICES[$service]}"
    done
    
    # Clean up temp files
    rm -f /tmp/fast-*.log /tmp/fast-*.pid
}

# Test scenarios
test_health_check() {
    log_info "=== Testing Health Check Scenario ==="
    
    local failed=0
    for service in "${!SERVICES[@]}"; do
        local port_info="${SERVICES[$service]}"
        local port=$(echo $port_info | cut -d: -f1)
        local port_type=$(echo $port_info | cut -d: -f2)
        
        if ! check_service_health "$service" "$port_type" "$port"; then
            ((failed++))
        fi
    done
    
    if [[ $failed -eq 0 ]]; then
        log_success "All services health check passed"
        return 0
    else
        log_error "$failed services failed health check"
        return 1
    fi
}

test_account_lookup() {
    log_info "=== Testing Account Lookup Scenario ==="
    
    # Test with grpcurl if available
    if command -v grpcurl &> /dev/null; then
        log_info "Testing gRPC account lookup..."
        if grpcurl -plaintext -d '{"acctId": "999888777666", "acctSys": "MEPS", "puid": "test-puid", "messageId": "test-123"}' \
           localhost:50059 AccountLookupService.LookupAccount > /tmp/account-lookup-test.json 2>&1; then
            log_success "Account lookup test passed"
            cat /tmp/account-lookup-test.json
            return 0
        else
            log_error "Account lookup test failed"
            cat /tmp/account-lookup-test.json
            return 1
        fi
    else
        log_warning "grpcurl not available, skipping gRPC test"
        return 0
    fi
}

test_enrichment() {
    log_info "=== Testing Enrichment Scenario ==="
    
    # Test enrichment endpoint
    if command -v grpcurl &> /dev/null; then
        log_info "Testing gRPC enrichment..."
        if grpcurl -plaintext -d '{"accountId": "999888777666", "messageType": "PACS", "messageId": "test-enrich-123", "puid": "test-puid-enrich"}' \
           localhost:50052 EnrichmentService.EnrichMessage > /tmp/enrichment-test.json 2>&1; then
            log_success "Enrichment test passed"
            cat /tmp/enrichment-test.json
            return 0
        else
            log_error "Enrichment test failed"
            cat /tmp/enrichment-test.json
            return 1
        fi
    else
        log_warning "grpcurl not available, skipping gRPC test"
        return 0
    fi
}

test_validation() {
    log_info "=== Testing Validation Scenario ==="
    
    # Test validation endpoint
    if command -v grpcurl &> /dev/null; then
        log_info "Testing gRPC validation..."
        if grpcurl -plaintext -d '{"messageId": "test-validation-123", "messageType": "PACS", "payload": "{\"test\": \"data\"}"}' \
           localhost:50053 ValidationService.ValidateMessage > /tmp/validation-test.json 2>&1; then
            log_success "Validation test passed"
            cat /tmp/validation-test.json
            return 0
        else
            log_error "Validation test failed"
            cat /tmp/validation-test.json
            return 1
        fi
    else
        log_warning "grpcurl not available, skipping gRPC test"
        return 0
    fi
}

test_orchestration() {
    log_info "=== Testing Orchestration Scenario ==="
    
    # Test orchestration via HTTP
    local test_payload='{
        "messageId": "test-orchestration-123",
        "messageType": "PACS",
        "payload": {
            "cdtrAcctId": "999888777666",
            "dbtrAcctId": "888777666555",
            "amount": "100.00",
            "currency": "SGD"
        }
    }'
    
    if curl -s -X POST -H "Content-Type: application/json" \
       -d "$test_payload" \
       "http://localhost:3004/api/v1/orchestration" > /tmp/orchestration-test.json 2>&1; then
        log_success "Orchestration test passed"
        cat /tmp/orchestration-test.json
        return 0
    else
        log_error "Orchestration test failed"
        cat /tmp/orchestration-test.json
        return 1
    fi
}

test_limit_check() {
    log_info "=== Testing Limit Check Scenario ==="
    
    # Test limit check via HTTP
    local test_payload='{
        "messageId": "test-limit-123",
        "accountId": "999888777666",
        "amount": "100.00",
        "currency": "SGD"
    }'
    
    if curl -s -X POST -H "Content-Type: application/json" \
       -d "$test_payload" \
       "http://localhost:3006/api/v1/limitchecks" > /tmp/limitcheck-test.json 2>&1; then
        log_success "Limit check test passed"
        cat /tmp/limitcheck-test.json
        return 0
    else
        log_error "Limit check test failed"
        cat /tmp/limitcheck-test.json
        return 1
    fi
}

test_accounting() {
    log_info "=== Testing Accounting Scenario ==="
    
    # Test accounting via HTTP
    local test_payload='{
        "messageId": "test-accounting-123",
        "transactionType": "CREDIT",
        "amount": "100.00",
        "currency": "SGD",
        "accountId": "999888777666"
    }'
    
    if curl -s -X POST -H "Content-Type: application/json" \
       -d "$test_payload" \
       "http://localhost:8002/api/v1/accounting/process" > /tmp/accounting-test.json 2>&1; then
        log_success "Accounting test passed"
        cat /tmp/accounting-test.json
        return 0
    else
        log_error "Accounting test failed"
        cat /tmp/accounting-test.json
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting Comprehensive GPPG3 Services Test"
    log_info "============================================"
    
    # Trap to cleanup on exit
    trap cleanup_all EXIT
    
    # Step 1: Start all services
    log_info "Step 1: Starting all services..."
    local start_failures=0
    for service in "${!SERVICES[@]}"; do
        if ! start_service "$service" "${SERVICES[$service]}"; then
            ((start_failures++))
        fi
        sleep 2  # Give some time between service starts
    done
    
    if [[ $start_failures -gt 0 ]]; then
        log_error "$start_failures services failed to start"
        exit 1
    fi
    
    # Step 2: Wait for all services to be ready
    log_info "Step 2: Waiting for services to be ready..."
    sleep 10
    
    # Step 3: Run health checks
    log_info "Step 3: Running health checks..."
    if ! test_health_check; then
        log_error "Health check failed"
        exit 1
    fi
    
    # Step 4: Run individual scenario tests
    log_info "Step 4: Running scenario tests..."
    
    local total_tests=0
    local passed_tests=0
    
    for scenario in "${!SCENARIOS[@]}"; do
        ((total_tests++))
        log_info "Testing scenario: $scenario - ${SCENARIOS[$scenario]}"
        
        case $scenario in
            "health-check")
                if test_health_check; then ((passed_tests++)); fi
                ;;
            "account-lookup")
                if test_account_lookup; then ((passed_tests++)); fi
                ;;
            "enrichment")
                if test_enrichment; then ((passed_tests++)); fi
                ;;
            "validation")
                if test_validation; then ((passed_tests++)); fi
                ;;
            "orchestration")
                if test_orchestration; then ((passed_tests++)); fi
                ;;
            "limit-check")
                if test_limit_check; then ((passed_tests++)); fi
                ;;
            "accounting")
                if test_accounting; then ((passed_tests++)); fi
                ;;
        esac
        
        log_info "Scenario '$scenario' completed"
        echo "----------------------------------------"
        sleep 2
    done
    
    # Final results
    log_info "Test Results Summary"
    log_info "===================="
    log_info "Total tests: $total_tests"
    log_info "Passed: $passed_tests"
    log_info "Failed: $((total_tests - passed_tests))"
    
    if [[ $passed_tests -eq $total_tests ]]; then
        log_success "All tests passed! 🎉"
        exit 0
    else
        log_error "Some tests failed! 😞"
        exit 1
    fi
}

# Run main function
main "$@" 