#!/bin/bash

# =============================================================================
# Multi-Stage Build Script for FAST Services
# Builds all services with optimized Docker images for deployment
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"
TAG="${BUILD_TAG:-latest}"
PLATFORM="${BUILD_PLATFORM:-linux/amd64}"
PARALLEL_BUILDS="${PARALLEL_BUILDS:-3}"

# Service configurations (compatible with all shells)
SERVICES_LIST="
fast-requesthandler-service:grpc:50051:gpp.g3.requesthandler.MessageHandler
fast-orchestrator-service:http:3004:health
fast-validation-service:grpc:50052:gpp.g3.validation.ValidationService
fast-enrichment-service:grpc:50053:gpp.g3.enrichment.EnrichmentService
fast-limitcheck-service:grpc:50054:gpp.g3.limitcheck.LimitCheckService
fast-accounting-service:grpc:50055:gpp.g3.accounting.AccountingService
fast-accountlookup-service:grpc:50056:gpp.g3.accountlookup.AccountLookupService
fast-referencedata-service:grpc:50057:gpp.g3.referencedata.ReferenceDataService
fast-vammediation-service:grpc:50058:gpp.g3.vammediation.VamMediationService
fast-mdzmediation-service:grpc:50059:gpp.g3.mdzmediation.MdzMediationService
"

# Function to get service config
get_service_config() {
    local service=$1
    echo "$SERVICES_LIST" | grep "^$service:" | cut -d: -f2-
}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if service directory exists
check_service_exists() {
    local service=$1
    if [ ! -d "$service" ]; then
        print_warning "Service directory $service does not exist, skipping..."
        return 1
    fi
    return 0
}

# Function to create optimized Dockerfile from template
create_dockerfile() {
    local service=$1
    local config=$2
    
    IFS=':' read -ra CONFIG_PARTS <<< "$config"
    local health_type=${CONFIG_PARTS[0]}
    local port=${CONFIG_PARTS[1]}
    local health_endpoint=${CONFIG_PARTS[2]}
    
    local dockerfile_content="# =============================================================================
# Multi-Stage Build for $service
# Auto-generated optimized Dockerfile
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies - Install and cache dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install security updates and required packages
RUN apk add --no-cache \\
    dumb-init \\
    && apk upgrade

# Copy package files for dependency installation
COPY package*.json ./
# Copy .npmrc for private package authentication (if exists)
COPY .npmrc* ./

# Pass NPM_TOKEN as build argument for private packages
ARG NPM_TOKEN
ENV NPM_TOKEN=\${NPM_TOKEN}

# Install ALL dependencies (including devDependencies for building)
RUN npm ci --ignore-scripts && npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Builder - Build the application
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy installed dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package*.json ./

# Copy source code and configuration
COPY . .

# Generate protocol buffers (if service uses gRPC)
RUN if [ -f \"package.json\" ] && grep -q \"proto:generate\" package.json; then \\
        npm run proto:generate; \\
    fi

# Build the TypeScript application
RUN npm run build

# Prune to production dependencies only
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 3: Runtime Tools - Prepare runtime utilities
# -----------------------------------------------------------------------------
FROM alpine:3.19 AS tools

# Install tools needed for runtime
RUN apk add --no-cache wget ca-certificates curl

# Download grpc_health_probe
RUN wget -qO /tmp/grpc_health_probe \\
    https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.22/grpc_health_probe-linux-amd64 && \\
    chmod +x /tmp/grpc_health_probe

# -----------------------------------------------------------------------------
# Stage 4: Production - Minimal runtime image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Metadata
LABEL maintainer=\"GPP G3 Team\"
LABEL service=\"$service\"
LABEL version=\"1.0.0\"
LABEL description=\"FAST microservice for GPP G3 platform\"

WORKDIR /app

# Install only essential runtime packages
RUN apk add --no-cache \\
    dumb-init \\
    ca-certificates \\
    curl \\
    && apk upgrade \\
    && rm -rf /var/cache/apk/*

# Create non-root user with specific UID/GID for security
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001 -G nodejs

# Copy runtime tools
COPY --from=tools /tmp/grpc_health_probe /usr/local/bin/grpc_health_probe

# Copy production dependencies and built application
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Create necessary directories with proper ownership
RUN mkdir -p /app/logs /app/tmp && \\
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE $port"

    if [ "$health_type" = "grpc" ]; then
        dockerfile_content="$dockerfile_content

# Health check using gRPC
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \\
    CMD grpc_health_probe -addr=localhost:$port -service=$health_endpoint || exit 1"
    else
        dockerfile_content="$dockerfile_content

# Health check using HTTP
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \\
    CMD curl -f http://localhost:$port/$health_endpoint || exit 1"
    fi

    dockerfile_content="$dockerfile_content

# Set production environment
ENV NODE_ENV=production
ENV NODE_OPTIONS=\"--max-old-space-size=512\"

# Use dumb-init for proper signal handling
ENTRYPOINT [\"dumb-init\", \"--\"]
CMD [\"node\", \"dist/index.js\"]"

    echo "$dockerfile_content" > "$service/Dockerfile.optimized"
    print_status "Created optimized Dockerfile for $service"
}

# Function to build a single service
build_service() {
    local service=$1
    local config=$(get_service_config "$service")
    
    if [ -z "$config" ]; then
        print_error "Service $service not found in configuration"
        return 1
    fi
    
    print_status "Building $service..."
    
    if ! check_service_exists "$service"; then
        return 1
    fi
    
    # Create optimized Dockerfile
    create_dockerfile "$service" "$config"
    
    # Build the image
    local image_name="$REGISTRY/gpp-g3/$service:$TAG"
    
    if docker build \
        --platform "$PLATFORM" \
        --file "$service/Dockerfile.optimized" \
        --tag "$image_name" \
        --tag "$REGISTRY/gpp-g3/$service:latest" \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VCS_REF="$(git rev-parse --short HEAD)" \
        "$service/"; then
        print_success "Successfully built $service"
        return 0
    else
        print_error "Failed to build $service"
        return 1
    fi
}

# Function to show build stats
show_build_stats() {
    local service=$1
    local image_name="$REGISTRY/gpp-g3/$service:$TAG"
    
    if docker image inspect "$image_name" >/dev/null 2>&1; then
        local size=$(docker image inspect "$image_name" --format='{{.Size}}' | numfmt --to=iec)
        local layers=$(docker image inspect "$image_name" --format='{{len .RootFS.Layers}}')
        print_status "$service: Size=$size, Layers=$layers"
    fi
}

# Function to get all services
get_all_services() {
    echo "$SERVICES_LIST" | grep -v "^$" | cut -d: -f1
}

# Function to push images to registry
push_images() {
    if [ "$PUSH_IMAGES" = "true" ]; then
        print_status "Pushing images to registry..."
        for service in $(get_all_services); do
            if check_service_exists "$service"; then
                local image_name="$REGISTRY/gpp-g3/$service:$TAG"
                docker push "$image_name"
                docker push "$REGISTRY/gpp-g3/$service:latest"
            fi
        done
    fi
}

# Function to clean up build artifacts
cleanup() {
    print_status "Cleaning up build artifacts..."
    for service in $(get_all_services); do
        if [ -f "$service/Dockerfile.optimized" ]; then
            rm "$service/Dockerfile.optimized"
        fi
    done
    
    # Remove dangling images
    docker image prune -f
}

# Main execution
main() {
    print_status "Starting multi-stage build for FAST services..."
    print_status "Registry: $REGISTRY"
    print_status "Tag: $TAG"
    print_status "Platform: $PLATFORM"
    
    local failed_builds=()
    local successful_builds=()
    
    # Build services
    for service in $(get_all_services); do
        if build_service "$service"; then
            successful_builds+=("$service")
        else
            failed_builds+=("$service")
        fi
    done
    
    # Show build statistics
    print_status "\n=== Build Statistics ==="
    for service in "${successful_builds[@]}"; do
        show_build_stats "$service"
    done
    
    # Push images if requested
    push_images
    
    # Cleanup
    cleanup
    
    # Summary
    print_status "\n=== Build Summary ==="
    print_success "Successfully built: ${#successful_builds[@]} services"
    if [ ${#failed_builds[@]} -gt 0 ]; then
        print_error "Failed builds: ${failed_builds[*]}"
        exit 1
    else
        print_success "All services built successfully!"
    fi
}

# Help function
show_help() {
    cat << EOF
Multi-Stage Build Script for FAST Services

Usage: $0 [OPTIONS] [SERVICE_NAME]

Options:
    -h, --help          Show this help message
    -r, --registry      Docker registry (default: localhost:5000)
    -t, --tag           Image tag (default: latest)
    -p, --platform      Target platform (default: linux/amd64)
    --push              Push images to registry after build
    --parallel N        Number of parallel builds (default: 3)

Examples:
    $0                                          # Build all services
    $0 fast-requesthandler-service             # Build specific service
    $0 --registry gcr.io/my-project --push     # Build and push to GCR
    $0 --tag v1.2.3 --platform linux/arm64    # Build with specific tag and platform

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        --push)
            PUSH_IMAGES="true"
            shift
            ;;
        --parallel)
            PARALLEL_BUILDS="$2"
            shift 2
            ;;
        *)
            # Assume it's a service name
            if echo "$SERVICES_LIST" | grep -q "^$1:"; then
                # Build only the specified service
                SERVICES_LIST="$(echo "$SERVICES_LIST" | grep "^$1:")"
            else
                print_error "Unknown service: $1"
                print_error "Available services: $(get_all_services | tr '\n' ' ')"
                exit 1
            fi
            shift
            ;;
    esac
done

# Run main function
main 