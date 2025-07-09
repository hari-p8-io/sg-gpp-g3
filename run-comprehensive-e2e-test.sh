#!/bin/bash

# Comprehensive End-to-End Test Runner
# This script starts all services and runs comprehensive end-to-end tests

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

# Function to check if a service is healthy
check_service_health() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    print_status "Checking $service_name health..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            print_success "$service_name is healthy"
            return 0
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            print_info "Still waiting for $service_name... (attempt $attempt/$max_attempts)"
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name is not healthy after $((max_attempts * 2)) seconds"
    return 1
}

# Function to cleanup
cleanup() {
    print_status "Cleaning up test environment..."
    
    # Stop all services
    print_info "Stopping all services..."
    pkill -f "fast-requesthandler-service" || true
    pkill -f "fast-enrichment-service" || true
    pkill -f "fast-referencedata-service" || true
    pkill -f "fast-validation-service" || true
    pkill -f "fast-orchestrator-service" || true
    pkill -f "fast-limitcheck-service" || true
    pkill -f "fast-vammediation-service" || true
    pkill -f "fast-accounting-service" || true
    pkill -f "fast-accountlookup-service" || true
    
    # Remove PID files
    rm -f logs/*.pid || true
    
    print_success "Cleanup completed"
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    print_status "🚀 Starting Comprehensive End-to-End Test"
    print_info "This will test all scenarios from Request Handler to Limit Check, Accounting, and VAM Mediation"
    echo
    
    # Create logs directory
    mkdir -p logs
    mkdir -p test-results
    
    # Step 1: Pre-flight checks
    print_status "Step 1: Pre-flight checks"
    
    # Check if Kafka is running
    if ! nc -z localhost 9092 2>/dev/null; then
        print_error "Kafka is not running on localhost:9092"
        print_info "Please start Kafka first: brew services start kafka"
        exit 1
    fi
    print_success "Kafka is running"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if comprehensive test file exists
    if [ ! -f "comprehensive-e2e-test.js" ]; then
        print_error "comprehensive-e2e-test.js not found"
        exit 1
    fi
    
    print_success "Pre-flight checks passed"
    echo
    
    # Step 2: Start services using the enhanced services script
    print_status "Step 2: Starting all services"
    
    # Make sure the enhanced services script is executable
    chmod +x run-enhanced-services.sh
    
    # Start services in background
    print_info "Starting services in background..."
    nohup ./run-enhanced-services.sh > logs/services-startup.log 2>&1 &
    SERVICES_PID=$!
    
    # Wait for services to start
    sleep 15
    
    # Check if services are still running
    if ! kill -0 $SERVICES_PID 2>/dev/null; then
        print_error "Services startup failed"
        cat logs/services-startup.log
        exit 1
    fi
    
    print_success "Services startup initiated"
    echo
    
    # Step 3: Wait for services to be ready
    print_status "Step 3: Waiting for services to be ready"
    
    # Wait for core services
    check_service_health "Request Handler" "http://localhost:3001/health"
    check_service_health "Enrichment Service" "http://localhost:50052/health"
    check_service_health "Reference Data Service" "http://localhost:50060/health"
    check_service_health "Validation Service" "http://localhost:50053/health"
    check_service_health "Orchestrator Service" "http://localhost:3004/health"
    check_service_health "Limit Check Service" "http://localhost:3006/health"
    check_service_health "VAM Mediation Service" "http://localhost:3005/health"
    check_service_health "Accounting Service" "http://localhost:8002/health"
    
    print_success "All services are ready"
    echo
    
    # Step 4: Install test dependencies
    print_status "Step 4: Installing test dependencies"
    
    if [ -f "package.json" ]; then
        npm install > /dev/null 2>&1
        print_success "Test dependencies installed"
    else
        print_warning "No package.json found, assuming dependencies are already installed"
    fi
    echo
    
    # Step 5: Run comprehensive end-to-end test
    print_status "Step 5: Running comprehensive end-to-end test"
    
    echo -e "${CYAN}🧪 Test Scenarios:${NC}"
    echo -e "  1. GROUPLIMIT + VAM Account (999888777)"
    echo -e "     Expected: Request Handler → Enrichment → Validation → Orchestrator → VAM Mediation → Accounting → Limit Check"
    echo -e "  2. GROUPLIMIT + MDZ Account (999123456)"
    echo -e "     Expected: Request Handler → Enrichment → Validation → Orchestrator → Accounting → Limit Check"
    echo -e "  3. AFPTHENLIMIT + MDZ Account (888123456)"
    echo -e "     Expected: Request Handler → Enrichment → Validation → Orchestrator → Accounting (No Limit Check)"
    echo -e "  4. AFPONLY + MDZ Account (777123456)"
    echo -e "     Expected: Request Handler → Enrichment → Validation → Orchestrator → Accounting (No Limit Check)"
    echo
    
    # Run the test
    print_info "Starting comprehensive test execution..."
    
    if node comprehensive-e2e-test.js 2>&1 | tee logs/comprehensive-test.log; then
        print_success "Comprehensive end-to-end test completed successfully"
        TEST_RESULT=0
    else
        print_error "Comprehensive end-to-end test failed"
        TEST_RESULT=1
    fi
    
    echo
    
    # Step 6: Display test results
    print_status "Step 6: Test Results Summary"
    
    # Show the last part of the test log
    if [ -f "logs/comprehensive-test.log" ]; then
        echo -e "${CYAN}📊 Test Output (last 20 lines):${NC}"
        tail -20 logs/comprehensive-test.log
    fi
    
    # Show any generated reports
    if [ -d "test-results" ]; then
        LATEST_REPORT=$(ls -t test-results/comprehensive-e2e-report-*.json 2>/dev/null | head -1)
        if [ -n "$LATEST_REPORT" ]; then
            print_info "Latest test report: $LATEST_REPORT"
        fi
    fi
    
    echo
    
    # Step 7: Cleanup
    print_status "Step 7: Cleanup"
    
    # Kill the services
    if kill -0 $SERVICES_PID 2>/dev/null; then
        print_info "Stopping services..."
        kill $SERVICES_PID 2>/dev/null || true
        sleep 5
        
        # Force kill if still running
        if kill -0 $SERVICES_PID 2>/dev/null; then
            kill -9 $SERVICES_PID 2>/dev/null || true
        fi
    fi
    
    # Additional cleanup
    cleanup
    
    echo
    
    # Step 8: Final summary
    print_status "Step 8: Final Summary"
    
    if [ $TEST_RESULT -eq 0 ]; then
        print_success "🎉 All comprehensive end-to-end tests passed!"
        echo -e "${GREEN}✅ The complete flow from Request Handler to Limit Check, Accounting, and VAM Mediation is working correctly${NC}"
    else
        print_error "❌ Some tests failed. Please check the logs for details."
        echo -e "${RED}❌ Test logs: logs/comprehensive-test.log${NC}"
        echo -e "${RED}❌ Services logs: logs/services-startup.log${NC}"
    fi
    
    echo
    print_info "Log files available in: logs/"
    print_info "Test reports available in: test-results/"
    
    exit $TEST_RESULT
}

# Show usage if help is requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo
    echo "This script runs comprehensive end-to-end tests for all scenarios:"
    echo "  - GROUPLIMIT + VAM Account: Tests full VAM mediation flow"
    echo "  - GROUPLIMIT + MDZ Account: Tests direct accounting with limit check"
    echo "  - AFPTHENLIMIT + MDZ Account: Tests accounting without limit check"
    echo "  - AFPONLY + MDZ Account: Tests accounting without limit check"
    echo
    echo "Requirements:"
    echo "  - Kafka running on localhost:9092"
    echo "  - Node.js installed"
    echo "  - All service dependencies installed"
    echo
    echo "The script will:"
    echo "  1. Start all required services"
    echo "  2. Wait for services to be ready"
    echo "  3. Run comprehensive end-to-end tests"
    echo "  4. Generate test reports"
    echo "  5. Clean up all services"
    echo
    exit 0
fi

# Run main function
main "$@" 