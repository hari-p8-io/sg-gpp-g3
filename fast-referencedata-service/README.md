# Fast Reference Data Service

## Overview
The Fast Reference Data Service provides authentication method lookup for the Singapore G3 Payment Platform. It determines the appropriate authentication method (GROUPLIMIT, AFPTHENLIMIT, AFPONLY) based on account information.

## Architecture
- **Type**: gRPC Service
- **Port**: 50060
- **Role**: Authentication method determination and reference data lookup

## Features
- ✅ **Authentication Method Lookup**: Determines auth methods based on account data
- ✅ **GROUPLIMIT Detection**: Identifies accounts requiring limit checking
- ✅ **AFPTHENLIMIT Detection**: Identifies accounts requiring additional validation
- ✅ **AFPONLY Detection**: Standard processing accounts
- ✅ **Mock Data Support**: Stubbed data for development and testing
- ✅ **Multi-system Support**: Handles VAM, MDZ, and MEPS account systems

## Authentication Methods
- **GROUPLIMIT**: Government/corporate accounts requiring limit checks
- **AFPTHENLIMIT**: Enhanced validation accounts
- **AFPONLY**: Standard processing accounts

## Message Flow
```
fast-enrichment-service
    ↓ (gRPC)
fast-referencedata-service
    ↓ (Response: auth method)
fast-enrichment-service
```

## Endpoints
- **gRPC Health Check**: `HealthCheck`
- **Authentication Lookup**: `LookupAuthMethod`

## Quick Start
```bash
npm install
npm run dev
```

## Dependencies
- **Enrichment Service**: Primary consumer of authentication methods

## Environment Variables
```bash
GRPC_PORT=50060
COUNTRY=SG
DEFAULT_CURRENCY=SGD
USE_MOCK_DATA=false
```

## Documentation
For detailed implementation details, see: `docs/services/fast-referencedata-service/`

## Status
✅ **Production Ready** - Successfully providing authentication method lookup for all account types 