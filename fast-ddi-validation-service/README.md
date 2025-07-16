# Fast Validation Service

## Overview
The Fast Validation Service validates enriched payment messages and publishes them to Kafka for orchestration. It serves as the bridge between synchronous gRPC processing and asynchronous Kafka-based orchestration.

## Architecture
- **Type**: gRPC Service
- **Port**: 50053
- **Role**: Message validation and Kafka publishing gateway

## Features
- ✅ **Message Validation**: Comprehensive enriched message validation
- ✅ **XSD Validation**: Schema validation for PACS messages
- ✅ **Kafka Publishing**: Publishes validated messages to orchestration
- ✅ **Currency Validation**: SGD-specific validation rules
- ✅ **Country Validation**: Singapore market compliance
- ✅ **Error Handling**: Detailed validation error reporting

## Message Flow
```
fast-enrichment-service
    ↓ (gRPC)
fast-validation-service
    ↓ (Kafka: validated-messages)
fast-orchestrator-service
```

## Endpoints
- **gRPC Health Check**: `HealthCheck`
- **Message Validation**: `ValidateEnrichedMessage`

## Kafka Integration
- **Topic**: `validated-messages`
- **Producer**: Publishes validated messages for orchestration
- **Message Format**: JSON with enrichment data and validation results

## Validation Rules
- **Currency**: Must be SGD for Singapore market
- **Country**: Must be SG for local processing
- **Account Format**: Validates account ID formats
- **Amount**: Validates transaction amounts and limits
- **Enrichment Data**: Validates completeness of enrichment

## Quick Start
```bash
npm install
npm run dev
```

## Dependencies
- **Kafka**: Required for message publishing
- **Enrichment Service**: Upstream gRPC service
- **Orchestrator Service**: Downstream Kafka consumer

## Environment Variables
```bash
GRPC_PORT=50053
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=validated-messages
EXPECTED_CURRENCY=SGD
EXPECTED_COUNTRY=SG
```

## Documentation
For detailed implementation details, see: `docs/services/fast-validation-service/IMPLEMENTATION_PLAN.md`

## Status
✅ **Production Ready** - Successfully validating and publishing messages to orchestration 