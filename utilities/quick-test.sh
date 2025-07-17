#!/bin/bash

# Quick Test Script for GPPG3 Services
# Tests specific functionality once services are running

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Test functions
test_service_health() {
    local service=$1
    local port=$2
    local type=${3:-http}
    
    log_info "Testing $service on port $port..."
    
    if [[ "$type" == "http" ]]; then
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "$service health check passed"
            return 0
        else
            log_error "$service health check failed"
            return 1
        fi
    else
        # For gRPC, just check if port is listening
        if netstat -an | grep -q ":$port.*LISTEN"; then
            log_success "$service is listening on port $port"
            return 0
        else
            log_error "$service is not listening on port $port"
            return 1
        fi
    fi
}

test_account_lookup() {
    log_info "Testing Account Lookup Service..."
    
    if grpcurl -plaintext -d '{
        "acctId": "999888777666",
        "acctSys": "MEPS",
        "puid": "test-puid",
        "messageId": "test-123"
    }' localhost:50059 AccountLookupService.LookupAccount > /tmp/account-test.json 2>&1; then
        log_success "Account lookup test passed"
        echo "Response:"
        cat /tmp/account-test.json | jq . 2>/dev/null || cat /tmp/account-test.json
        return 0
    else
        log_error "Account lookup test failed"
        echo "Error:"
        cat /tmp/account-test.json
        return 1
    fi
}

test_reference_data() {
    log_info "Testing Reference Data Service..."
    
    if grpcurl -plaintext -d '{
        "acctId": "999888777666",
        "acctSys": "VAM",
        "puid": "test-puid",
        "messageId": "test-123"
    }' localhost:50060 ReferenceDataService.LookupAuthMethod > /tmp/refdata-test.json 2>&1; then
        log_success "Reference data test passed"
        echo "Response:"
        cat /tmp/refdata-test.json | jq . 2>/dev/null || cat /tmp/refdata-test.json
        return 0
    else
        log_error "Reference data test failed"
        echo "Error:"
        cat /tmp/refdata-test.json
        return 1
    fi
}

test_enrichment() {
    log_info "Testing Enrichment Service..."
    
    if grpcurl -plaintext -d '{
        "accountId": "999888777666",
        "messageType": "PACS",
        "messageId": "test-enrich-123",
        "puid": "test-puid-enrich"
    }' localhost:50052 EnrichmentService.EnrichMessage > /tmp/enrich-test.json 2>&1; then
        log_success "Enrichment test passed"
        echo "Response:"
        cat /tmp/enrich-test.json | jq . 2>/dev/null || cat /tmp/enrich-test.json
        return 0
    else
        log_error "Enrichment test failed"
        echo "Error:"
        cat /tmp/enrich-test.json
        return 1
    fi
}

test_validation() {
    log_info "Testing Validation Service..."
    
    if grpcurl -plaintext -d '{
        "messageId": "test-validation-123",
        "messageType": "PACS",
        "payload": "{\"cdtrAcctId\": \"999888777666\", \"dbtrAcctId\": \"888777666555\", \"amount\": \"100.00\", \"currency\": \"SGD\"}"
    }' localhost:50053 ValidationService.ValidateMessage > /tmp/validation-test.json 2>&1; then
        log_success "Validation test passed"
        echo "Response:"
        cat /tmp/validation-test.json | jq . 2>/dev/null || cat /tmp/validation-test.json
        return 0
    else
        log_error "Validation test failed"
        echo "Error:"
        cat /tmp/validation-test.json
        return 1
    fi
}

test_orchestration() {
    log_info "Testing Orchestration Service..."
    
    local payload='{
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
       -d "$payload" \
       "http://localhost:3004/api/v1/orchestration" > /tmp/orchestration-test.json 2>&1; then
        log_success "Orchestration test passed"
        echo "Response:"
        cat /tmp/orchestration-test.json | jq . 2>/dev/null || cat /tmp/orchestration-test.json
        return 0
    else
        log_error "Orchestration test failed"
        echo "Error:"
        cat /tmp/orchestration-test.json
        return 1
    fi
}

test_end_to_end() {
    log_info "Testing End-to-End Flow..."
    
    # Test with request handler service
    local payload='{
        "messageId": "test-e2e-123",
        "messageType": "PACS",
        "payload": {
            "cdtrAcctId": "999888777666",
            "dbtrAcctId": "888777666555",
            "amount": "100.00",
            "currency": "SGD"
        }
    }'
    
    if grpcurl -plaintext -d '{
        "messageId": "test-e2e-123",
        "messageType": "PACS",
        "payload": "'"$(echo "$payload" | jq -c . | sed 's/"/\\"/g')"'"
    }' localhost:50051 MessageHandlerService.ProcessMessage > /tmp/e2e-test.json 2>&1; then
        log_success "End-to-end test passed"
        echo "Response:"
        cat /tmp/e2e-test.json | jq . 2>/dev/null || cat /tmp/e2e-test.json
        return 0
    else
        log_error "End-to-end test failed"
        echo "Error:"
        cat /tmp/e2e-test.json
        return 1
    fi
}

# Check service status
check_all_services() {
    log_info "Checking all services status..."
    
    declare -A services=(
        ["Reference Data"]="50060:grpc"
        ["Account Lookup"]="50059:grpc"
        ["Validation"]="50053:grpc"
        ["Enrichment"]="50052:grpc"
        ["Request Handler"]="50051:grpc"
        ["Orchestrator"]="3004:http"
        ["Limit Check"]="3006:http"
        ["Accounting"]="8002:http"
    )
    
    local all_running=true
    for service in "${!services[@]}"; do
        local port_info="${services[$service]}"
        local port=$(echo $port_info | cut -d: -f1)
        local type=$(echo $port_info | cut -d: -f2)
        
        if [[ "$type" == "http" ]]; then
            if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
                log_success "$service: Running"
            else
                log_error "$service: Not running"
                all_running=false
            fi
        else
            if netstat -an | grep -q ":$port.*LISTEN"; then
                log_success "$service: Running"
            else
                log_error "$service: Not running"
                all_running=false
            fi
        fi
    done
    
    if [[ "$all_running" == true ]]; then
        log_success "All services are running!"
        return 0
    else
        log_error "Some services are not running"
        return 1
    fi
}

# Main execution
main() {
    log_info "Quick Test for GPPG3 Services"
    log_info "=============================="
    
    # First check if all services are running
    if ! check_all_services; then
        log_error "Not all services are running. Please start services first."
        log_info "Run: ./start-services.sh"
        exit 1
    fi
    
    echo ""
    log_info "Running individual service tests..."
    
    local total_tests=0
    local passed_tests=0
    
    # Test each service
    tests=(
        "test_reference_data"
        "test_account_lookup"
        "test_enrichment"
        "test_validation"
        "test_orchestration"
        "test_end_to_end"
    )
    
    for test in "${tests[@]}"; do
        ((total_tests++))
        echo ""
        if $test; then
            ((passed_tests++))
        fi
        echo "----------------------------------------"
    done
    
    # Summary
    echo ""
    log_info "Test Summary"
    log_info "============"
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

# Handle command line arguments
case "${1:-all}" in
    "all")
        main
        ;;
    "status")
        check_all_services
        ;;
    "account")
        test_account_lookup
        ;;
    "enrichment")
        test_enrichment
        ;;
    "validation")
        test_validation
        ;;
    "orchestration")
        test_orchestration
        ;;
    "e2e")
        test_end_to_end
        ;;
    *)
        echo "Usage: $0 [all|status|account|enrichment|validation|orchestration|e2e]"
        echo "  all          - Run all tests (default)"
        echo "  status       - Check service status"
        echo "  account      - Test account lookup"
        echo "  enrichment   - Test enrichment"
        echo "  validation   - Test validation"
        echo "  orchestration - Test orchestration"
        echo "  e2e          - Test end-to-end flow"
        exit 1
        ;;
esac 