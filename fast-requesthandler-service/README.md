# Fast Request Handler Service

## Overview
The Fast Request Handler Service is the **entry point** for the Singapore G3 Payment Platform. It receives PACS payment messages via gRPC and initiates the complete payment processing pipeline.

## Architecture
- **Type**: gRPC Service
- **Port**: 50051
- **Role**: Payment message entry point and orchestration initiator

## Features
- ✅ **PACS Message Processing**: Handles PACS.008, PACS.002, and CAMT messages
- ✅ **Multi-market Support**: Singapore and international payment processing
- ✅ **gRPC Integration**: High-performance message handling
- ✅ **Message Status Tracking**: Complete transaction lifecycle management
- ✅ **Response Generation**: Automated PACS.002 response creation
- ✅ **Kafka Integration**: Asynchronous completion message handling

## Message Flow
```
Client → fast-requesthandler-service (gRPC)
    ↓
fast-enrichment-service (Central Hub)
    ↓
[Account Lookup + Reference Data + Validation]
    ↓  
fast-orchestrator-service (Kafka)
    ↓
[Accounting + VAM Mediation + Limit Check]
```

## Endpoints
- **gRPC Health Check**: `HealthCheck`
- **Message Processing**: `ProcessMessage`
- **Status Inquiry**: `GetMessageStatus`

## Quick Start
```bash
npm install
npm run dev
```

## Dependencies
- **Enrichment Service** (Port 50052): Primary downstream service
- **Kafka**: Message completion handling
- **PostgreSQL**: Message status persistence

## Documentation
For detailed implementation details, see: `docs/services/fast-requesthandler-service/IMPLEMENTATION_PLAN.md`

## Status
✅ **Production Ready** - Full end-to-end payment processing pipeline implemented 