import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { Kafka, Consumer, KafkaMessage } from 'kafkajs';

// Configuration
const PORT = process.env.PORT || 3004;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'validated-messages';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fast-orchestrator-group';

// Express app setup
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.headers['x-request-id']);
  next();
});

// In-memory storage for processed messages
const processedMessages = new Map<string, any>();
const orchestrationStatus = new Map<string, any>();

// Kafka setup
const kafka = new Kafka({
  clientId: 'fast-orchestrator-service',
  brokers: KAFKA_BROKERS,
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

// Kafka consumer logic
async function startKafkaConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const messageValue = message.value?.toString();
        if (!messageValue) return;

        const validatedMessage = JSON.parse(messageValue);
        
        console.log(`📥 Received validated message: ${validatedMessage.messageId}`);
        
        // Process the validated message
        await processValidatedMessage(validatedMessage);
        
      } catch (error) {
        console.error('Error processing Kafka message:', error);
      }
    },
  });
}

// Process validated message from Kafka
async function processValidatedMessage(validatedMessage: any): Promise<void> {
  const { messageId, puid, jsonPayload, enrichmentData, validationResult } = validatedMessage;
  
  try {
    // Store the message
    processedMessages.set(messageId, {
      messageId,
      puid,
      jsonPayload,
      enrichmentData,
      validationResult,
      receivedAt: new Date().toISOString(),
      status: 'received'
    });

    // Initialize orchestration status
    orchestrationStatus.set(messageId, {
      messageId,
      puid,
      currentStep: 'orchestration_started',
      steps: [],
      startTime: Date.now(),
      status: 'processing'
    });

    // Start orchestration process
    await orchestrateMessage(messageId, validatedMessage);

  } catch (error) {
    console.error(`Error processing message ${messageId}:`, error);
    
    orchestrationStatus.set(messageId, {
      messageId,
      puid,
      currentStep: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'failed',
      completedAt: new Date().toISOString()
    });
  }
}

// Main orchestration logic
async function orchestrateMessage(messageId: string, validatedMessage: any): Promise<void> {
  const orchestration = orchestrationStatus.get(messageId);
  
  try {
    // Step 1: Route based on message type and business rules
    await addOrchestrationStep(messageId, 'routing', 'determining_route');
    const route = determineRoute(validatedMessage);
    await addOrchestrationStep(messageId, 'routing', 'completed', { route });

    // Step 2: Call downstream services based on route
    await addOrchestrationStep(messageId, 'downstream_processing', 'started');
    const downstreamResults = await processDownstreamServices(route, validatedMessage);
    await addOrchestrationStep(messageId, 'downstream_processing', 'completed', downstreamResults);

    // Step 3: Finalize orchestration
    await addOrchestrationStep(messageId, 'finalization', 'completed');
    
    // Update final status
    orchestrationStatus.set(messageId, {
      ...orchestration,
      currentStep: 'completed',
      status: 'completed',
      completedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - orchestration.startTime
    });

    console.log(`✅ Orchestration completed for message ${messageId}`);

  } catch (error) {
    console.error(`❌ Orchestration failed for message ${messageId}:`, error);
    
    orchestrationStatus.set(messageId, {
      ...orchestration,
      currentStep: 'error',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date().toISOString()
    });
  }
}

// Helper function to add orchestration steps
async function addOrchestrationStep(messageId: string, stepName: string, status: string, data?: any): Promise<void> {
  const orchestration = orchestrationStatus.get(messageId);
  if (!orchestration) return;

  orchestration.steps.push({
    stepName,
    status,
    timestamp: new Date().toISOString(),
    data
  });
  
  orchestration.currentStep = stepName;
  orchestrationStatus.set(messageId, orchestration);
}

// Route determination logic
function determineRoute(validatedMessage: any): string {
  const { enrichmentData, jsonPayload } = validatedMessage;
  
  // Route based on account type and amount
  if (enrichmentData?.physicalAcctInfo?.acctAttributes?.acctType === 'CORPORATE') {
    return 'corporate_flow';
  } else if (enrichmentData?.physicalAcctInfo?.acctAttributes?.acctType === 'GOVERNMENT') {
    return 'government_flow';
  } else {
    return 'standard_flow';
  }
}

// Process downstream services
async function processDownstreamServices(route: string, validatedMessage: any): Promise<any> {
  const results: any = {};
  
  switch (route) {
    case 'corporate_flow':
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      results.vamMediation = await callVamMediationService(validatedMessage);
      break;
      
    case 'government_flow':
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      results.mdzMediation = await callMdzMediationService(validatedMessage);
      break;
      
    default: // standard_flow
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      break;
  }
  
  return results;
}

// Mock downstream service calls
async function callLimitCheckService(message: any): Promise<any> {
  // Simulate service call
  await new Promise(resolve => setTimeout(resolve, 100));
  return { status: 'success', service: 'fast-limitcheck-service', limitStatus: 'approved' };
}

async function callAccountingService(message: any): Promise<any> {
  // Simulate service call
  await new Promise(resolve => setTimeout(resolve, 150));
  return { status: 'success', service: 'fast-accounting-service', accountingEntry: 'created' };
}

async function callVamMediationService(message: any): Promise<any> {
  // Simulate service call
  await new Promise(resolve => setTimeout(resolve, 200));
  return { status: 'success', service: 'fast-vammediation-service', vamStatus: 'processed' };
}

async function callMdzMediationService(message: any): Promise<any> {
  // Simulate service call
  await new Promise(resolve => setTimeout(resolve, 200));
  return { status: 'success', service: 'fast-mdzmediation-service', mdzStatus: 'processed' };
}

// REST API endpoints
app.get('/health', (req, res): void => {
  res.status(200).json({
    service: 'fast-orchestrator-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'],
    kafka: {
      topic: KAFKA_TOPIC,
      groupId: KAFKA_GROUP_ID
    }
  });
});

app.get('/api/v1/messages', (req, res): void => {
  const messages = Array.from(processedMessages.values());
  res.json({
    messages,
    count: messages.length,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/orchestration/:messageId', (req, res): void => {
  const { messageId } = req.params;
  const orchestration = orchestrationStatus.get(messageId);
  
  if (!orchestration) {
    res.status(404).json({
      error: 'Orchestration not found',
      messageId,
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  res.json({
    orchestration,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/orchestration', (req, res): void => {
  const orchestrations = Array.from(orchestrationStatus.values());
  res.json({
    orchestrations,
    count: orchestrations.length,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res): void => {
  res.status(404).json({
    error: 'Endpoint not found',
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Start services
async function startServices(): Promise<void> {
  try {
    // Start Kafka consumer
    await startKafkaConsumer();
    console.log(`📥 Kafka consumer started (topic: ${KAFKA_TOPIC})`);
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 fast-orchestrator-service is running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔍 API endpoints: http://localhost:${PORT}/api/v1/`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

// Start the service
startServices();

export default app; 