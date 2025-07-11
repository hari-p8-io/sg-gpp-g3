#!/bin/bash

# =============================================================================
# Private Package Authentication Verification Script
# Verifies that @gpp scoped packages can be accessed properly
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Private Package Authentication Verification ===${NC}"
echo ""

# Function to print status
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

# Check if NPM_TOKEN is set
echo "1. Checking NPM_TOKEN environment variable..."
if [ -z "$NPM_TOKEN" ]; then
    print_error "NPM_TOKEN environment variable is not set"
    echo "   Please set it with: export NPM_TOKEN=your_github_token_here"
    exit 1
else
    print_success "NPM_TOKEN is set (length: ${#NPM_TOKEN} characters)"
fi

echo ""

# Check .npmrc files exist
echo "2. Checking .npmrc files..."
services=(
    "fast-enrichment-service"
    "fast-requesthandler-service"
    "pw-core"
)

for service in "${services[@]}"; do
    if [ -f "$service/.npmrc" ]; then
        print_success ".npmrc exists in $service"
    else
        print_error ".npmrc missing in $service"
    fi
done

echo ""

# Check registry configuration in each service
echo "3. Checking registry configuration..."
for service in "${services[@]}"; do
    if [ -f "$service/.npmrc" ]; then
        if grep -q "@gpp:registry" "$service/.npmrc"; then
            registry_url=$(grep "@gpp:registry" "$service/.npmrc" | cut -d= -f2)
            print_success "$service: @gpp registry configured as $registry_url"
        else
            print_error "$service: @gpp registry not configured"
        fi
    fi
done

echo ""

# Test package access
echo "4. Testing package access..."
echo "   Attempting to view @gpp/pw-core package..."

# Test in each service directory
for service in "${services[@]}"; do
    if [ -d "$service" ]; then
        print_status "Testing in $service directory..."
        cd "$service"
        
        # Test npm view command
        if NPM_TOKEN=$NPM_TOKEN npm view @gpp/pw-core name 2>/dev/null; then
            print_success "✅ Can access @gpp/pw-core from $service"
        else
            print_warning "❌ Cannot access @gpp/pw-core from $service"
            print_status "This might be normal if the package isn't published yet"
        fi
        
        cd ..
    fi
done

echo ""

# Test workspace configuration
echo "5. Testing workspace configuration..."
if [ -f "package.json" ]; then
    if grep -q '"workspaces"' package.json; then
        print_success "Workspace configuration detected"
        print_status "In workspace mode, local packages will be used automatically"
    else
        print_warning "No workspace configuration found"
    fi
fi

echo ""

# Test local pw-core availability
echo "6. Testing local pw-core package..."
if [ -d "pw-core" ]; then
    if [ -f "pw-core/package.json" ]; then
        package_name=$(grep '"name"' pw-core/package.json | cut -d'"' -f4)
        package_version=$(grep '"version"' pw-core/package.json | cut -d'"' -f4)
        print_success "Local pw-core found: $package_name@$package_version"
    else
        print_error "pw-core directory exists but package.json missing"
    fi
else
    print_error "pw-core directory not found"
fi

echo ""

# Recommendations
echo "7. Recommendations:"

if [ -n "$NPM_TOKEN" ]; then
    print_success "✅ Authentication token is configured"
else
    print_error "❌ Set NPM_TOKEN environment variable"
fi

if [ -f "pw-core/package.json" ]; then
    print_success "✅ Local pw-core package available"
else
    print_warning "⚠️  Local pw-core package not found - registry access required"
fi

echo ""

# Final summary
echo -e "${BLUE}=== Summary ===${NC}"
echo "Registry Configuration: GitHub Package Registry"
echo "Authentication Method: NPM_TOKEN environment variable"
echo "Local Development: Uses workspace links when available"
echo "Registry Fallback: Uses private registry when local packages unavailable"

echo ""
echo "For detailed setup instructions, see: PRIVATE-PACKAGE-SETUP.md"
echo ""

# Test installation commands
echo -e "${YELLOW}=== Installation Test Commands ===${NC}"
echo "Test these commands to verify your setup:"
echo ""
echo "# Test in fast-enrichment-service"
echo "cd fast-enrichment-service && npm install --dry-run"
echo ""
echo "# Test in fast-requesthandler-service"
echo "cd fast-requesthandler-service && npm install --dry-run"
echo ""
echo "# Clean install test"
echo "cd fast-enrichment-service && rm -rf node_modules package-lock.json && npm install"

echo ""
echo -e "${GREEN}Verification complete!${NC}" 