# Fast Orchestrator Service

## Overview
The Fast Orchestrator Service is the **routing and orchestration hub** for validated payment messages. It determines the processing flow based on account system types and authentication methods, routing messages to appropriate downstream services.

## Architecture
- **Type**: HTTP Service (Express.js) + Kafka Consumer/Producer
- **Port**: 3004
- **Role**: Message routing and orchestration based on business rules

## Features
- ✅ **Intelligent Routing**: Routes based on account system (VAM/MDZ/MEPS) and auth method
- ✅ **Authentication Method Logic**: GROUPLIMIT, AFPTHENLIMIT, AFPONLY handling
- ✅ **VAM Integration**: Routes VAM accounts to mediation service
- ✅ **Limit Check Integration**: Fire & forget limit checking for GROUPLIMIT
- ✅ **Accounting Integration**: Direct routing to accounting service
- ✅ **Message Tracking**: Complete transaction lifecycle management

## Message Flow
```
fast-validation-service
    ↓ (Kafka: validated-messages)
fast-orchestrator-service (Routing Hub)
    ├─ (Kafka: vam-messages) → VAM Mediation (when acctSys = VAM)
    ├─ (Kafka: accounting-messages) → Accounting Service
    └─ (Kafka: limitcheck-messages) → Limit Check (Fire & Forget when authMethod = GROUPLIMIT)
```

## Routing Logic
- **VAM Accounts**: `acctSys = "VAM"` → VAM Mediation Service → Accounting
- **MDZ/MEPS Accounts**: Direct to Accounting Service
- **GROUPLIMIT Auth**: Additional fire & forget limit check after accounting
- **AFPTHENLIMIT/AFPONLY**: Standard accounting flow

## Endpoints
- **Health Check**: `GET /health`
- **Messages API**: `GET /api/v1/messages`
- **Orchestration API**: `GET /api/v1/orchestration`

## Kafka Integration
### Consumers
- **Topic**: `validated-messages` (from validation service)
- **Topic**: `vam-responses` (from VAM mediation service)

### Producers
- **Topic**: `vam-messages` (to VAM mediation service)
- **Topic**: `accounting-messages` (to accounting service)
- **Topic**: `limitcheck-messages` (to limit check service)

## Quick Start
```bash
npm install
npm run dev
```

## Dependencies
- **Kafka**: Required for message processing
- **Validation Service**: Upstream message source
- **Accounting Service**: Downstream transaction processing
- **VAM Mediation Service**: Conditional routing for VAM accounts
- **Limit Check Service**: Conditional routing for GROUPLIMIT

## Environment Variables
```bash
PORT=3004
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=fast-orchestrator-group
VALIDATED_MESSAGES_TOPIC=validated-messages
ACCOUNTING_TOPIC=accounting-messages
VAM_MESSAGES_TOPIC=vam-messages
LIMITCHECK_TOPIC=limitcheck-messages
```

## Documentation
For detailed implementation details, see: `docs/services/fast-orchestrator-service/IMPLEMENTATION_PLAN.md`

## Status
✅ **Production Ready** - Successfully orchestrating all payment flows with intelligent routing 