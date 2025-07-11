# CI/CD Setup for GPP G3 Services

This document explains the CI/CD structure and setup for all microservices in the GPP G3 project.

## Architecture Overview

Each service has its own independent CI/CD pipeline located within the service directory. This provides better isolation, clearer ownership, and optimized build triggers.

## Directory Structure

```
gpp-g3-project/
├── fast-requesthandler-service/
│   ├── .github/
│   │   └── workflows/
│   │       └── fast-requesthandler-service.yml
│   ├── src/
│   ├── tests/
│   ├── docker-compose.ci.yml
│   ├── Dockerfile
│   ├── Dockerfile.test
│   └── README.ci.md
├── fast-enrichment-service/
│   ├── .github/
│   │   └── workflows/
│   │       └── fast-enrichment-service.yml
│   └── ...
└── fast-validation-service/
    ├── .github/
    │   └── workflows/
    │       └── fast-validation-service.yml
    └── ...
```

## Benefits of This Structure

### 🔒 **Service Isolation**
- Each service has its own build pipeline
- Changes to one service don't trigger builds for others
- Independent deployment schedules
- Clear service ownership

### ⚡ **Performance Optimization**
- Only builds when service files change
- Faster feedback loops
- Reduced CI/CD resource usage
- Parallel service development

### 🛠️ **Maintenance**
- Service teams own their CI/CD configuration
- Easier to customize per service needs
- Clear responsibility boundaries
- Independent versioning and releases

## Implementation Status

### ✅ Completed Services
- **fast-requesthandler-service**: Full CI/CD pipeline with PACS002 testing

### 🚧 Planned Services
- **fast-enrichment-service**: Account lookup and reference data integration
- **fast-validation-service**: Message validation and compliance checks
- **fast-orchestrator-service**: Workflow orchestration and routing
- **fast-limitcheck-service**: Transaction limit verification
- **fast-accounting-service**: Accounting and settlement processing
- **fast-vammediation-service**: VAM system integration
- **fast-mdzmediation-service**: MDZ system integration
- **fast-accountlookup-service**: Account resolution service
- **fast-referencedata-service**: Reference data management

## Quick Start Guide

1. **Choose your service** from the planned list
2. **Copy CI/CD files** from fast-requesthandler-service:
   ```bash
   cp -r fast-requesthandler-service/.github your-service/
   cp fast-requesthandler-service/docker-compose.ci.yml your-service/
   cp fast-requesthandler-service/Dockerfile.test your-service/
   cp fast-requesthandler-service/playwright.config.ci.ts your-service/
   ```
3. **Update service-specific configuration**
4. **Test locally** with docker-compose
5. **Commit and push** to trigger pipeline
6. **Monitor pipeline** in GitHub Actions

For detailed information, see the full documentation in each service's `README.ci.md` file. 