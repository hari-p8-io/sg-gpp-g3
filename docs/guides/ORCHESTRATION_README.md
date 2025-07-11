# VAM/MDZ Orchestration Implementation

## Overview

This implementation provides basic orchestration logic in the `fast-orchestrator-service` that handles different routing flows based on the account system type:

- **VAM Flow**: Send to VAM mediation service, wait for response, then send to accounting service
- **MDZ Flow**: Skip VAM mediation, send directly to accounting service
- **Standard Flow**: Default routing for other account types

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ Validation      │───▶│ Orchestrator     │───▶│ Accounting Service  │
│ Service         │    │ Service          │    │ (All Flows)         │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ VAM Mediation   │
                       │ Service         │
                       │ (VAM Flow Only) │
                       └─────────────────┘
```

## Services

### 1. Fast Orchestrator Service (`fast-orchestrator-service`)
- **Port**: 3004
- **Function**: Main orchestration logic
- **Features**:
  - Consumes from `validated-messages` Kafka topic
  - Routes based on `acctSys` field in enrichment data
  - Handles VAM response correlation
  - Calls accounting service after VAM completion

### 2. VAM Mediation Service (`fast-vammediation-service`)
- **Port**: 3005
- **Function**: Processes VAM-specific messages
- **Features**:
  - Consumes from `vam-messages` Kafka topic
  - Sends responses to `vam-responses` Kafka topic
  - HTTP API for status and message retrieval

### 3. Accounting Service (`fast-accounting-service`)
- **Port**: 8002
- **Function**: Final accounting processing
- **Features**:
  - HTTP API for transaction processing
  - Generates accounting entries
  - Compatible with both VAM and MDZ flows

## Orchestration Flows

### VAM Flow (acctSys = "VAM")
1. Orchestrator receives validated message
2. Sends message to VAM mediation service via Kafka
3. Waits for VAM response on `vam-responses` topic
4. Upon successful VAM response, calls accounting service
5. Marks orchestration as completed

### MDZ Flow (acctSys = "MDZ")
1. Orchestrator receives validated message
2. Skips VAM mediation entirely
3. Calls accounting service directly
4. Marks orchestration as completed

### Standard Flow (other account systems)
1. Orchestrator receives validated message
2. Calls accounting service directly
3. Marks orchestration as completed

## Quick Start

### Prerequisites
- Node.js (v16+)
- Kafka running on localhost:9092
- npm installed

### Option 1: Automated Startup (Recommended)
```bash
# Install dependencies and start all services
./start-orchestration-test.sh --install-deps

# Start services without installing dependencies
./start-orchestration-test.sh

# Start services without running tests
./start-orchestration-test.sh --no-test

# Show help
./start-orchestration-test.sh --help
```

### Option 2: Manual Startup
```bash
# 1. Install dependencies
cd fast-orchestrator-service && npm install && cd ..
cd fast-vammediation-service && npm install && cd ..
cd fast-accounting-service && npm install && cd ..
npm install

# 2. Start services in separate terminals
cd fast-accounting-service && npm run dev
cd fast-vammediation-service && npm run dev
cd fast-orchestrator-service && npm run build && npm run start

# 3. Run tests
node test-orchestration.js
```

## Testing

### Automated Testing
The `test-orchestration.js` script provides comprehensive testing:

```bash
# Run all tests
node test-orchestration.js

# Or use npm script
npm test
```

### Test Scenarios
1. **VAM Flow Test**: Account `999888777` → VAM mediation → Accounting
2. **MDZ Flow Test**: Account `MDZ123456` → Accounting (skip VAM)
3. **Standard Flow Test**: Account `STANDARD123` → Accounting
4. **Multiple Messages Test**: Mixed account types

### Manual Testing
Send test messages to orchestrator:

```bash
# VAM account
curl -X POST http://localhost:3004/test/vam-message

# MDZ account  
curl -X POST http://localhost:3004/test/mdz-message
```

## API Endpoints

### Orchestrator Service (Port 3004)
- `GET /health` - Service health check
- `GET /api/v1/messages` - Get processed messages
- `GET /api/v1/orchestration` - Get all orchestration statuses
- `GET /api/v1/orchestration/:messageId` - Get specific orchestration status
- `GET /api/v1/pending-vam` - Get pending VAM responses

### VAM Mediation Service (Port 3005)
- `GET /health` - Service health check
- `GET /api/v1/messages` - Get processed VAM messages
- `DELETE /api/v1/messages` - Clear processed messages

### Accounting Service (Port 8002)
- `GET /health` - Service health check
- `GET /actuator/health` - Actuator health check
- `POST /api/v1/accounting/process` - Process accounting transaction
- `GET /api/v1/accounting/transactions` - Get all transactions
- `GET /api/v1/accounting/transactions/:id` - Get specific transaction

## Configuration

### Environment Variables

#### Orchestrator Service
- `PORT` - Service port (default: 3004)
- `KAFKA_BROKERS` - Kafka brokers (default: localhost:9092)
- `KAFKA_TOPIC` - Input topic (default: validated-messages)
- `VAM_KAFKA_TOPIC` - VAM output topic (default: vam-messages)
- `VAM_RESPONSE_TOPIC` - VAM response topic (default: vam-responses)
- `ACCOUNTING_SERVICE_URL` - Accounting service URL (default: http://localhost:8002)

#### VAM Mediation Service
- `PORT` - Service port (default: 3005)
- `KAFKA_BROKERS` - Kafka brokers (default: localhost:9092)
- `VAM_KAFKA_TOPIC` - VAM input topic (default: vam-messages)

#### Accounting Service
- `PORT` - Service port (default: 8002)

## Account System Routing

The orchestrator determines routing based on the `acctSys` field in the enrichment data:

```javascript
// VAM accounts
acctSys === 'VAM' 
// Examples: 999888777, VAMTEST123, VAM12345

// MDZ accounts  
acctSys === 'MDZ'
// Examples: MDZ123456, accounts containing "MDZ"

// Standard accounts
// All other account types
```

## Message Flow

### Example VAM Message Flow
```json
{
  "messageId": "uuid-123",
  "puid": "G3ITEST123",
  "enrichmentData": {
    "physicalAcctInfo": {
      "acctSys": "VAM",
      "acctId": "999888777"
    }
  }
}
```

### Orchestration Status Tracking
```json
{
  "messageId": "uuid-123",
  "status": "completed",
  "steps": [
    {"stepName": "routing", "status": "completed"},
    {"stepName": "vam_mediation", "status": "completed"},
    {"stepName": "accounting_service", "status": "completed"},
    {"stepName": "finalization", "status": "completed"}
  ]
}
```

## Monitoring

### Health Checks
All services expose health check endpoints for monitoring:
- Orchestrator: http://localhost:3004/health
- VAM Mediation: http://localhost:3005/health  
- Accounting: http://localhost:8002/health

### Logs
Service logs are written to the `logs/` directory when using the startup script:
- `logs/orchestrator-service.log`
- `logs/vam-mediation-service.log`
- `logs/accounting-service.log`

## Troubleshooting

### Common Issues

1. **Services not starting**
   - Check if ports are already in use
   - Ensure Kafka is running on port 9092
   - Check logs for specific error messages

2. **VAM responses not received**
   - Verify VAM mediation service is consuming from `vam-messages` topic
   - Check if `vam-responses` topic exists
   - Ensure orchestrator is subscribed to response topic

3. **Accounting service calls failing**
   - Verify accounting service is running on port 8002
   - Check network connectivity
   - Review accounting service logs for errors

### Debug Commands
```bash
# Check if services are running
curl http://localhost:3004/health
curl http://localhost:3005/health  
curl http://localhost:8002/health

# Check Kafka topics
kafka-topics.sh --list --bootstrap-server localhost:9092

# View service logs
tail -f logs/orchestrator-service.log
tail -f logs/vam-mediation-service.log
tail -f logs/accounting-service.log
```

## Implementation Details

### Key Components

1. **Orchestration Engine**: Manages the flow based on account system
2. **VAM Response Correlation**: Tracks pending VAM responses using message IDs  
3. **Error Handling**: Comprehensive error handling and retry logic
4. **Status Tracking**: Detailed orchestration step tracking
5. **Service Integration**: HTTP calls to accounting service with proper error handling

### Technology Stack
- **Node.js** with TypeScript (Orchestrator)
- **Express.js** for HTTP APIs
- **KafkaJS** for Kafka integration
- **Axios** for HTTP client calls

This implementation provides a robust foundation for payment orchestration with proper VAM/MDZ routing and can be extended for additional business requirements. 