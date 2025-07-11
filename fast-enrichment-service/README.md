# Fast Enrichment Service

## Overview
The Fast Enrichment Service is the **central hub** of the Singapore G3 Payment Platform. It orchestrates account lookup, reference data retrieval, and message enrichment for payment processing.

## Architecture
- **Type**: gRPC Service
- **Port**: 50052
- **Role**: Central orchestration hub for message enrichment

## Features
- ✅ **Account Lookup Integration**: Retrieves account information from lookup service
- ✅ **Reference Data Integration**: Fetches authentication methods and rules
- ✅ **Message Enrichment**: Adds account details and processing metadata
- ✅ **Validation Integration**: Forwards enriched messages for validation
- ✅ **Multi-system Support**: Handles VAM, MDZ, and MEPS account systems
- ✅ **Error Handling**: Comprehensive fallback and retry mechanisms

## Message Flow
```
fast-requesthandler-service
    ↓ (gRPC)
fast-enrichment-service (Central Hub)
    ├─ (gRPC) → fast-accountlookup-service → (Response)
    ├─ (gRPC) → fast-referencedata-service → (Response)
    └─ (gRPC) → fast-validation-service
```

## Services Integration
- **Account Lookup Service** (Port 50059): Account information retrieval
- **Reference Data Service** (Port 50060): Authentication method lookup
- **Validation Service** (Port 50053): Message validation and Kafka publishing

## Endpoints
- **gRPC Health Check**: `HealthCheck`
- **Message Enrichment**: `EnrichMessage`

## Enrichment Data Structure
```json
{
  "receivedAcctId": "123456789",
  "lookupStatusCode": 200,
  "lookupStatusDesc": "Success",
  "normalizedAcctId": "123456789",
  "matchedAcctId": "123456789",
  "isPhysical": "Y",
  "authMethod": "GROUPLIMIT",
  "physicalAcctInfo": {
    "acctSys": "MDZ",
    "acctGroup": "RETAIL",
    "country": "SG",
    "currencyCode": "SGD"
  }
}
```

## Quick Start
```bash
npm install
npm run dev
```

## Dependencies
- **Account Lookup Service** (Port 50059): Required for account information
- **Reference Data Service** (Port 50060): Required for authentication methods
- **Validation Service** (Port 50053): Required for downstream processing

## Documentation
For detailed implementation details, see: `docs/services/fast-enrichment-service/IMPLEMENTATION_PLAN.md`

## Status
✅ **Production Ready** - Central hub successfully orchestrating all enrichment operations 