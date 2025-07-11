# Fast Request Handler Service - CI/CD Setup

This document describes the CI/CD pipeline setup for the Fast Request Handler Service using GitHub Actions.

## Overview

Each service has its own independent CI/CD pipeline located in its service directory under `.github/workflows/`. This provides:

- **Service Isolation**: Each service has its own build and deployment pipeline
- **Independent Testing**: Services can be tested and deployed independently  
- **Optimized Triggers**: Only runs when the specific service changes
- **Clear Ownership**: Each team owns their service's pipeline

The CI/CD pipeline automatically builds, tests, and deploys the Fast Request Handler Service. It includes:

- **Automated Testing**: Unit tests and end-to-end tests using Playwright
- **Infrastructure Setup**: Spanner emulator, Kafka, and mock services
- **Docker Containerization**: Multi-stage Docker builds with optimization
- **Deployment**: Staging and production deployments

## Pipeline Structure

### 1. Test Job
- **Runs on**: `ubuntu-latest`
- **Triggers**: Push to `main`/`develop` branches, PRs
- **Duration**: ~10-15 minutes
- **Services**: Spanner emulator, Kafka, Zookeeper, Mock servers

#### Test Steps:
1. ✅ Checkout code
2. ✅ Setup Node.js 18
3. ✅ Install dependencies
4. ✅ Generate Protocol Buffers
5. ✅ Run linting
6. ✅ Build TypeScript
7. ✅ Run unit tests
8. ✅ Setup infrastructure (Spanner, Kafka)
9. ✅ Start service
10. ✅ Run Playwright E2E tests
11. ✅ Upload test artifacts

### 2. Build Job
- **Runs on**: `ubuntu-latest`
- **Depends on**: Test job success
- **Triggers**: Push to `main`/`develop` branches
- **Duration**: ~5-10 minutes

#### Build Steps:
1. ✅ Build Docker image
2. ✅ Push to GitHub Container Registry
3. ✅ Generate deployment artifacts
4. ✅ Upload deployment artifacts

### 3. Integration Test Job
- **Runs on**: `ubuntu-latest`
- **Depends on**: Build job success
- **Duration**: ~3-5 minutes

#### Integration Steps:
1. ✅ Pull built Docker image
2. ✅ Run integration tests
3. ✅ Verify health checks
4. ✅ Clean up resources

### 4. Deploy Jobs
- **Staging**: Deploys on `develop` branch
- **Production**: Deploys on `main` branch
- **Environments**: Uses GitHub environments for approvals

## Infrastructure Components

### Required Services
- **Spanner Emulator**: Database (ports 9010, 9020)
- **Kafka**: Message broker (port 9092)
- **Zookeeper**: Kafka dependency (port 2181)
- **Mock Account Lookup**: Test service (port 8080)
- **Mock Reference Data**: Test service (port 8081)

### Mock Services
Mock servers are automatically configured with realistic test data:

#### Account Lookup Service
- `GET /account/{id}`: Returns account details
- `POST /account/validate`: Validates account information
- `GET /health`: Health check endpoint

#### Reference Data Service
- `GET /banks/{code}`: Returns bank information
- `GET /currencies/{code}`: Returns currency details
- `POST /validate/bic`: Validates BIC codes
- `GET /health`: Health check endpoint

## Service Structure

```
fast-requesthandler-service/
├── .github/
│   └── workflows/
│       └── fast-requesthandler-service.yml    # CI/CD Pipeline
├── src/                                       # Service source code
├── tests/                                     # Test files
├── docker-compose.ci.yml                     # CI infrastructure setup
├── Dockerfile                                 # Production container
├── Dockerfile.test                           # Test container
├── playwright.config.ci.ts                   # CI test configuration
├── config/
│   └── ci.json                               # CI configuration
├── scripts/
│   └── setup-mock-servers.js                # Mock service setup
└── README.ci.md                              # CI/CD documentation
```

## Configuration Files

### GitHub Actions Workflow
- **File**: `.github/workflows/fast-requesthandler-service.yml` (in service directory)
- **Location**: Each service has its own .github/workflows directory
- **Triggers**: Push/PR to main/develop branches with changes to service files
- **Environment Variables**: Configured per job

### Docker Compose (CI)
- **File**: `docker-compose.ci.yml`
- **Purpose**: Complete test environment setup
- **Services**: All required infrastructure + service

### Playwright Configuration
- **File**: `playwright.config.ci.ts`
- **Optimizations**: CI-specific settings
- **Browsers**: Headless Chrome with performance optimizations

### Mock Server Setup
- **File**: `scripts/setup-mock-servers.js`
- **Purpose**: Configure mock expectations
- **Endpoints**: Account lookup and reference data

## Usage

### Local Development
```bash
# Install dependencies
npm ci

# Generate protocol buffers
npm run proto:generate

# Build the service
npm run build

# Run tests locally
npm run test:ci

# Setup mock servers
npm run mock:setup

# Run with Docker
npm run docker:test
```

### CI/CD Pipeline
The pipeline automatically triggers on:
- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop`
- Changes to service files or workflow configuration

### Manual Trigger
```bash
# Force run all tests
npm run ci:test

# Clean up Docker resources
npm run ci:cleanup
```

## Environment Variables

### Required for CI
```bash
# Service Configuration
NODE_ENV=test
PORT=3001
GRPC_PORT=50051

# Database (Spanner Emulator)
SPANNER_EMULATOR_HOST=localhost:9010
SPANNER_PROJECT_ID=test-project
SPANNER_INSTANCE_ID=test-instance
SPANNER_DATABASE_ID=test-database

# Messaging (Kafka)
KAFKA_BROKERS=localhost:9092

# Mock Services
MOCK_ACCOUNTLOOKUP_URL=http://localhost:8080
MOCK_REFERENCEDATA_URL=http://localhost:8081

# Test Configuration
CI=true
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

## Test Scenarios

### PACS002 End-to-End Tests
1. **VAM High Value Transactions** (SGD 50,000+)
2. **Regular Transactions** (SGD 1,500)
3. **Corporate Fast Transfers** (SGD 25,000)
4. **Payment Reversals** (PACS007)
5. **Error Handling** (Invalid accounts)

### Performance Tests
- **Message Processing**: < 1 second per message
- **Concurrent Processing**: 10+ messages simultaneously
- **Health Checks**: < 5 second response time

## Artifacts

### Generated Artifacts
- **Playwright Report**: HTML test report with screenshots
- **Test Results**: JUnit XML and JSON reports
- **Docker Images**: Tagged and pushed to registry
- **Deployment Manifests**: Docker compose files for deployment

### Artifact Retention
- **Test Reports**: 30 days
- **Docker Images**: Based on registry settings
- **Deployment Artifacts**: 30 days

## Monitoring & Alerts

### Health Checks
- Service health endpoint: `/health`
- Database connectivity checks
- Kafka connectivity verification
- Mock service availability

### Failure Notifications
- GitHub Actions status checks
- PR status updates
- Email notifications (if configured)

## Troubleshooting

### Common Issues

#### 1. Spanner Emulator Connection
```bash
# Check if emulator is running
curl -f http://localhost:9020

# Restart emulator
docker restart spanner-emulator
```

#### 2. Kafka Connection Issues
```bash
# Check Kafka topics
docker exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Recreate topics
docker exec kafka kafka-topics --create --topic pacs-messages --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
```

#### 3. Mock Server Issues
```bash
# Check mock server status
curl http://localhost:8080/mockserver/status
curl http://localhost:8081/mockserver/status

# Reset mock servers
npm run mock:setup
```

#### 4. Test Timeouts
- Increase timeout values in `playwright.config.ci.ts`
- Check service startup logs
- Verify all dependencies are ready

### Debug Commands
```bash
# Run tests with debug info
DEBUG=* npm run test:e2e:ci

# Check service logs
docker logs fast-requesthandler-service

# View mock expectations
curl http://localhost:8080/mockserver/expectation
```

## Security Considerations

### GitHub Actions Security
- Uses GitHub's built-in GITHUB_TOKEN
- Secrets are properly masked in logs
- Limited permissions for workflow runs

### Container Security
- Non-root user in Docker containers
- Minimal base images (Alpine Linux)
- No sensitive data in container layers

### Network Security
- Services communicate over internal Docker network
- Exposed ports are limited to test requirements
- Mock servers use localhost binding

## Performance Optimization

### Docker Builds
- Multi-stage builds for smaller images
- Layer caching for faster builds
- Dependency caching between runs

### Test Execution
- Parallel test execution (limited for CI stability)
- Efficient browser launching
- Resource cleanup after tests

### Infrastructure
- Health checks prevent premature test execution
- Service readiness verification
- Graceful shutdown handling

## Future Enhancements

### Planned Improvements
1. **Parallel Service Testing**: Run multiple services in parallel
2. **Integration Testing**: Cross-service communication tests
3. **Performance Testing**: Load testing with realistic data
4. **Security Scanning**: Vulnerability scanning in pipeline
5. **Deployment Automation**: Automated deployment to staging/production

### Monitoring Additions
1. **Metrics Collection**: Test execution metrics
2. **Performance Tracking**: Response time monitoring
3. **Error Tracking**: Detailed error reporting
4. **Coverage Reports**: Code coverage integration

---

## Quick Start

1. **Fork/Clone the repository**
2. **Enable GitHub Actions** in your repository settings
3. **Configure secrets** if needed for deployment
4. **Push changes** to trigger the pipeline
5. **Monitor the pipeline** in the Actions tab

The pipeline will automatically run and provide feedback on the success or failure of your changes.

For questions or issues, please refer to the troubleshooting section or create an issue in the repository. 