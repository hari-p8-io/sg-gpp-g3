# GPP G3 Utilities

This directory contains utilities for testing and monitoring the GPP G3 platform.

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ installed
- All GPP G3 services running
- Kafka running on localhost:9092
- Docker (for Kafka if not already running)

### Installation

```bash
# Install dependencies
cd utilities
npm install

# Or use the script
./run-e2e-test.sh --install-deps
```

### Running the End-to-End Test

```bash
# Run the full E2E test (checks services first)
./run-e2e-test.sh

# Skip service health checks
./run-e2e-test.sh --skip-checks

# Just start Kafka monitoring
./run-e2e-test.sh --monitor-only
```

## 📋 Available Tools

### 1. End-to-End Test Runner (`end-to-end-test-with-kafka-monitoring.js`)

Comprehensive test that sends a PACS008 message through the entire GPP G3 pipeline and monitors all Kafka topics.

**Features:**
- ✅ Real-time message tracking
- ✅ Service health checks
- ✅ Kafka topic monitoring
- ✅ Visual logging with colors
- ✅ Detailed test reporting
- ✅ Message flow assertions

**Usage:**
```bash
# Direct execution
node end-to-end-test-with-kafka-monitoring.js

# Via package script
npm run e2e-test
```

### 2. Kafka Topic Monitor (`kafka-topic-monitor.js`)

Real-time monitoring of all Kafka topics with message counting and detailed logging.

**Features:**
- 📨 Real-time message monitoring
- 📊 Periodic summaries
- 🔍 Message content inspection
- 📈 Message count tracking
- 🎯 Topic-specific monitoring

**Usage:**
```bash
# Direct execution
node kafka-topic-monitor.js

# Via package script
npm run kafka-monitor
```

### 3. Test Runner Script (`run-e2e-test.sh`)

Comprehensive shell script that orchestrates the entire testing process.

**Features:**
- 🔧 Service health checks
- 📦 Dependency installation
- 🎯 Test orchestration
- 📊 Background monitoring
- 🧹 Automatic cleanup

**Usage:**
```bash
# Make executable
chmod +x run-e2e-test.sh

# Run full test
./run-e2e-test.sh

# Options
./run-e2e-test.sh --help
```

## 🎯 End-to-End Test Flow

The E2E test follows this flow:

1. **Service Health Checks** - Verify all services are running
2. **Kafka Setup** - Start monitoring all relevant topics
3. **Message Injection** - Send PACS008 message to Request Handler
4. **Message Tracking** - Follow message through each service
5. **Orchestrator Monitoring** - Check message processing status
6. **Kafka Assertions** - Verify messages on expected topics
7. **Report Generation** - Comprehensive test results

### Test Message

The test uses a Singapore-based PACS008 message with:
- **Amount**: SGD 5000.00
- **Debtor Account**: 999888777666 (VAM system)
- **Creditor Account**: 888777666555
- **Authentication**: GROUPLIMIT (triggers limit check)

### Expected Kafka Topics

- `validated-messages` - Message after validation
- `vam-messages` - Message routed to VAM system
- `limitcheck-messages` - Message sent for limit checking

## 📊 Monitoring Dashboard

### Visual Logging

The tools use color-coded logging:
- 🟢 **Green**: Success messages
- 🔴 **Red**: Error messages  
- 🔵 **Blue**: Information messages
- 🟡 **Yellow**: Kafka messages
- 🟣 **Cyan**: Service-specific messages

### Message Tracking

Each message is tracked with:
- **Message ID**: Unique identifier
- **PUID**: Processing unique ID
- **Timestamps**: Processing times
- **Service Chain**: Which services processed it
- **Kafka Events**: Topic publications

## 🔧 Configuration

### Service Endpoints

```javascript
const SERVICES = {
  requestHandler: { port: 50051 },    // gRPC
  enrichment: { port: 50052 },        // gRPC
  validation: { port: 50053 },        // gRPC
  orchestrator: { port: 3004 },       // HTTP
  accounting: { port: 8002 },         // HTTP
  vamMediation: { port: 3005 },       // HTTP
  limitCheck: { port: 3006 }          // HTTP
};
```

### Kafka Configuration

```javascript
const KAFKA_CONFIG = {
  brokers: ['localhost:9092'],
  topics: {
    validatedMessages: 'validated-messages',
    vamMessages: 'vam-messages',
    vamResponses: 'vam-responses',
    limitCheckMessages: 'limitcheck-messages'
  }
};
```

## 🚀 Running Services

### Start All Services

```bash
# 1. Start Kafka
cd /path/to/GPPG3
docker-compose up -d kafka zookeeper

# 2. Start Request Handler
cd fast-requesthandler-service
npm run dev

# 3. Start Enrichment Service (test mode)
cd fast-enrichment-service
NODE_ENV=test npm run dev

# 4. Start Validation Service
cd fast-validation-service
npm run dev

# 5. Start Orchestrator Service
cd fast-orchestrator-service
npm run dev
```

### Verify Services

```bash
# Check service status
./run-e2e-test.sh --skip-checks

# Or manually check ports
netstat -an | grep -E ":(50051|50052|50053|3004|9092)"
```

## 📈 Test Reports

### Sample Output

```
🎯 END-TO-END TEST REPORT
================================================================================
📝 Message ID: E2E-TEST-1704821234567
📝 PUID: PUID-ABC123-XYZ789
⏱️  Total Processing Time: 2847ms

📊 KAFKA TOPIC SUMMARY:
  📨 validated-messages: 1 messages
    1. 2024-01-09T15:30:45.123Z - MessageID: E2E-TEST-1704821234567
  📨 vam-messages: 1 messages
    1. 2024-01-09T15:30:47.456Z - MessageID: E2E-TEST-1704821234567
  📨 limitcheck-messages: 1 messages
    1. 2024-01-09T15:30:49.789Z - MessageID: E2E-TEST-1704821234567

🔍 MESSAGE FLOW ANALYSIS:
  1. 2024-01-09T15:30:45.123Z - Topic: validated-messages
  2. 2024-01-09T15:30:47.456Z - Topic: vam-messages
  3. 2024-01-09T15:30:49.789Z - Topic: limitcheck-messages

✅ ASSERTIONS:
  ✅ Topic 'validated-messages': Message received
  ✅ Topic 'vam-messages': Message received
  ✅ Topic 'limitcheck-messages': Message received

🎉 END-TO-END TEST PASSED! All assertions successful.
```

## 🐛 Troubleshooting

### Common Issues

1. **Service Not Running**
   ```bash
   # Check if service is running
   nc -z localhost 50051
   
   # Start missing service
   cd fast-requesthandler-service && npm run dev
   ```

2. **Kafka Connection Issues**
   ```bash
   # Check Kafka
   docker-compose ps kafka
   
   # Restart Kafka
   docker-compose restart kafka
   ```

3. **Port Conflicts**
   ```bash
   # Find what's using a port
   lsof -i :50051
   
   # Kill process if needed
   kill -9 <PID>
   ```

### Debug Mode

```bash
# Run with debug logging
DEBUG=* npm run e2e-test

# Or with verbose output
./run-e2e-test.sh --verbose
```

## 🤝 Contributing

When adding new utilities:

1. Update `package.json` with new scripts
2. Add documentation to this README
3. Include proper error handling
4. Add colored logging for consistency
5. Include cleanup procedures

## 📚 Related Documentation

- [Main Project README](../README.md)
- [Request Handler Service](../fast-requesthandler-service/README.md)
- [Enrichment Service](../fast-enrichment-service/README.md)
- [Validation Service](../fast-validation-service/README.md)
- [Orchestrator Service](../fast-orchestrator-service/README.md) 