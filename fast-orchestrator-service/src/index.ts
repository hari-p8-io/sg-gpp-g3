import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { Kafka, Consumer, Producer, KafkaMessage } from 'kafkajs';
import axios from 'axios';

// Configuration
const PORT = process.env.PORT || 3004;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'validated-messages';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fast-orchestrator-group';

// VAM-specific Kafka topics
const VAM_KAFKA_TOPIC = process.env.VAM_KAFKA_TOPIC || 'vam-messages';
const VAM_RESPONSE_TOPIC = process.env.VAM_RESPONSE_TOPIC || 'vam-responses';
const MDZ_KAFKA_TOPIC = process.env.MDZ_KAFKA_TOPIC || 'mdz-messages';

// **NEW: Limit Check Kafka topic**
const LIMITCHECK_KAFKA_TOPIC = process.env.LIMITCHECK_KAFKA_TOPIC || 'limitcheck-messages';

// Service URLs
const VAM_MEDIATION_SERVICE_URL = process.env.VAM_MEDIATION_SERVICE_URL || 'http://localhost:3005';
const ACCOUNTING_SERVICE_URL = process.env.ACCOUNTING_SERVICE_URL || 'http://localhost:8002';

// Express app setup
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request tracking middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  next();
});

// In-memory storage for processed messages
const processedMessages = new Map<string, any>();
const orchestrationStatus = new Map<string, any>();
const pendingVAMResponses = new Map<string, any>();

// Kafka setup
const kafka = new Kafka({
  clientId: 'fast-orchestrator-service',
  brokers: KAFKA_BROKERS,
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });
const vamResponseConsumer = kafka.consumer({ groupId: 'fast-orchestrator-vam-response-group' });
const producer = kafka.producer();

// Initialize Kafka producer
async function initializeKafkaProducer(): Promise<void> {
  await producer.connect();
  console.log('📤 Kafka producer connected');
}

// Initialize VAM response consumer
async function initializeVAMResponseConsumer(): Promise<void> {
  await vamResponseConsumer.connect();
  await vamResponseConsumer.subscribe({ topic: VAM_RESPONSE_TOPIC, fromBeginning: false });

  await vamResponseConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const messageValue = message.value?.toString();
        if (!messageValue) return;

        const vamResponse = JSON.parse(messageValue);
        console.log(`📥 Received VAM response: ${vamResponse.messageId}`);
        
        // Process VAM response and continue orchestration
        await processVAMResponse(vamResponse);
        
      } catch (error) {
        console.error('Error processing VAM response:', error);
      }
    },
  });
  
  console.log('📥 VAM response consumer initialized');
}

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

// **UPDATED: Main orchestration logic with auth method handling**
async function orchestrateMessage(messageId: string, validatedMessage: any): Promise<void> {
  const orchestration = orchestrationStatus.get(messageId);
  
  try {
    // Step 1: Route based on message type and business rules
    await addOrchestrationStep(messageId, 'routing', 'determining_route');
    const route = determineRoute(validatedMessage);
    await addOrchestrationStep(messageId, 'routing', 'completed', { route });

    // Step 2: Determine account system and handle orchestration accordingly
    const acctSys = validatedMessage.enrichmentData?.physicalAcctInfo?.acctSys;
    const authMethod = validatedMessage.enrichmentData?.authMethod;
    console.log(`🔄 Processing message ${messageId} with account system: ${acctSys}, auth method: ${authMethod}`);

    if (acctSys === 'VAM') {
      await handleVAMFlow(messageId, validatedMessage);
    } else if (acctSys === 'MDZ') {
      await handleMDZFlow(messageId, validatedMessage);
    } else {
      // Default flow - direct to accounting
      await handleDefaultFlow(messageId, validatedMessage);
    }

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

// **UPDATED: Fire-and-forget limit check service call (post-accounting)**
async function sendToLimitCheckServiceFireAndForget(messageId: string, validatedMessage: any): Promise<void> {
  // Fire and forget - don't await or throw errors
  setImmediate(async () => {
    try {
      console.log(`🔍 [Fire & Forget] Sending message ${messageId} to limit check service after accounting`);
      
      const limitCheckMessage = {
        messageId: validatedMessage.messageId,
        puid: validatedMessage.puid,
        messageType: validatedMessage.messageType,
        authMethod: validatedMessage.enrichmentData?.authMethod,
        accountInfo: {
          acctId: validatedMessage.enrichmentData?.physicalAcctInfo?.acctId,
          acctSys: validatedMessage.enrichmentData?.physicalAcctInfo?.acctSys,
          acctGrp: validatedMessage.enrichmentData?.physicalAcctInfo?.acctGroup,
          country: validatedMessage.enrichmentData?.physicalAcctInfo?.country,
          currencyCode: validatedMessage.enrichmentData?.physicalAcctInfo?.currencyCode
        },
        transactionData: {
          amount: validatedMessage.jsonPayload?.amount || validatedMessage.enrichmentData?.messageData?.amount,
          currency: validatedMessage.enrichmentData?.physicalAcctInfo?.currencyCode || 'SGD',
          debtorAccount: validatedMessage.enrichmentData?.messageData?.debtorAccount,
          creditorAccount: validatedMessage.enrichmentData?.messageData?.creditorAccount
        },
        enrichmentData: validatedMessage.enrichmentData,
        jsonPayload: validatedMessage.jsonPayload,
        routedAt: new Date().toISOString(),
        sourceService: 'fast-orchestrator-service',
        triggerPoint: 'post_accounting' // NEW: Indicate this is post-accounting
      };

      await producer.send({
        topic: LIMITCHECK_KAFKA_TOPIC,
        messages: [
          {
            key: validatedMessage.messageId,
            value: JSON.stringify(limitCheckMessage),
            headers: {
              'message-type': validatedMessage.messageType || 'PACS008',
              'auth-method': validatedMessage.enrichmentData?.authMethod || 'UNKNOWN',
              'account-system': validatedMessage.enrichmentData?.physicalAcctInfo?.acctSys || 'UNKNOWN',
              'source': 'orchestrator',
              'trigger-point': 'post-accounting'
            }
          }
        ]
      });

      // Log step but don't throw on failure
      await addOrchestrationStep(messageId, 'limit_check_post_accounting', 'completed', { 
        sentToLimitCheck: true,
        kafkaTopic: LIMITCHECK_KAFKA_TOPIC,
        authMethod: validatedMessage.enrichmentData?.authMethod,
        fireAndForget: true
      });
      
      console.log(`✅ [Fire & Forget] Limit check message ${messageId} sent successfully after accounting`);
      
    } catch (error) {
      console.warn(`⚠️ [Fire & Forget] Failed to send message ${messageId} to limit check service (non-blocking):`, error);
      // Log the step as warning but don't block the main flow
      try {
        await addOrchestrationStep(messageId, 'limit_check_post_accounting', 'failed_non_blocking', { 
          error: error instanceof Error ? error.message : String(error),
          fireAndForget: true
        });
      } catch (logError) {
        // Even logging errors should not block
        console.warn(`⚠️ Could not log limit check failure for message ${messageId}`);
      }
    }
  });
}

// Handle VAM flow: Send to VAM mediation, wait for response, then send to accounting
async function handleVAMFlow(messageId: string, validatedMessage: any): Promise<void> {
  console.log(`🏦 Starting VAM flow for message ${messageId}`);
  
  // Step 1: Send to VAM mediation service
  await addOrchestrationStep(messageId, 'vam_mediation', 'started');
  
  try {
    // Send to VAM mediation via Kafka
    await sendToVAMMediation(validatedMessage);
    
    // Mark as waiting for VAM response
    pendingVAMResponses.set(messageId, {
      messageId,
      validatedMessage,
      sentAt: new Date().toISOString(),
      status: 'waiting_for_response'
    });
    
    await addOrchestrationStep(messageId, 'vam_mediation', 'waiting_for_response', { 
      sentToVAM: true,
      kafkaTopic: VAM_KAFKA_TOPIC 
    });
    
    console.log(`📤 VAM message ${messageId} sent to mediation service, waiting for response`);
    
  } catch (error) {
    console.error(`❌ Failed to send message ${messageId} to VAM mediation:`, error);
    await addOrchestrationStep(messageId, 'vam_mediation', 'failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

// Handle MDZ flow: Skip VAM mediation, send directly to accounting
async function handleMDZFlow(messageId: string, validatedMessage: any): Promise<void> {
  console.log(`🏭 Starting MDZ flow for message ${messageId}`);
  
  // Step 1: Skip VAM mediation
  await addOrchestrationStep(messageId, 'mdz_routing', 'started');
  await addOrchestrationStep(messageId, 'mdz_routing', 'skipped_vam_mediation', { 
    reason: 'MDZ account system does not require VAM mediation' 
  });
  
  // Step 2: Send directly to accounting service
  await sendToAccountingService(messageId, validatedMessage);
}

// Handle default flow: Direct to accounting
async function handleDefaultFlow(messageId: string, validatedMessage: any): Promise<void> {
  console.log(`📝 Starting default flow for message ${messageId}`);
  
  await addOrchestrationStep(messageId, 'default_routing', 'started');
  await sendToAccountingService(messageId, validatedMessage);
}

// Process VAM response and continue orchestration
async function processVAMResponse(vamResponse: any): Promise<void> {
  const { messageId, status, error } = vamResponse;
  
  console.log(`📥 Processing VAM response for message ${messageId}, status: ${status}`);
  
  const pendingMessage = pendingVAMResponses.get(messageId);
  if (!pendingMessage) {
    console.warn(`⚠️  No pending VAM response found for message ${messageId}`);
    return;
  }
  
  // Remove from pending responses
  pendingVAMResponses.delete(messageId);
  
  if (status === 'success' || status === 'processed') {
    // VAM mediation successful, proceed to accounting
    await addOrchestrationStep(messageId, 'vam_mediation', 'completed', { 
      vamResponse,
      processingTime: vamResponse.processingTimeMs || 0
    });
    
    console.log(`✅ VAM mediation completed for message ${messageId}, proceeding to accounting`);
    
    // Send to accounting service
    await sendToAccountingService(messageId, pendingMessage.validatedMessage);
    
  } else {
    // VAM mediation failed
    await addOrchestrationStep(messageId, 'vam_mediation', 'failed', { 
      error: error || 'VAM mediation failed',
      vamResponse 
    });
    
    console.error(`❌ VAM mediation failed for message ${messageId}: ${error}`);
    
    // Mark orchestration as failed
    const orchestration = orchestrationStatus.get(messageId);
    if (orchestration) {
      orchestrationStatus.set(messageId, {
        ...orchestration,
        currentStep: 'error',
        status: 'failed',
        error: `VAM mediation failed: ${error}`,
        completedAt: new Date().toISOString()
      });
    }
  }
}

// Send message to VAM mediation service
async function sendToVAMMediation(validatedMessage: any): Promise<void> {
  const vamMessage = {
    messageId: validatedMessage.messageId,
    puid: validatedMessage.puid,
    messageType: validatedMessage.messageType,
    accountSystem: 'VAM',
    enrichmentData: validatedMessage.enrichmentData,
    jsonPayload: validatedMessage.jsonPayload,
    routedAt: new Date().toISOString(),
    sourceService: 'fast-orchestrator-service',
    responseRequired: true,
    responseTopic: VAM_RESPONSE_TOPIC
  };

  await producer.send({
    topic: VAM_KAFKA_TOPIC,
    messages: [
      {
        key: validatedMessage.messageId,
        value: JSON.stringify(vamMessage),
        headers: {
          'message-type': validatedMessage.messageType || 'PACS008',
          'account-system': 'VAM',
          'source': 'orchestrator',
          'response-required': 'true',
          'response-topic': VAM_RESPONSE_TOPIC
        }
      }
    ]
  });
}

// Send message to accounting service
async function sendToAccountingService(messageId: string, validatedMessage: any): Promise<void> {
  await addOrchestrationStep(messageId, 'accounting_service', 'started');
  
  try {
    console.log(`💰 Sending message ${messageId} to accounting service`);
    
    // Prepare accounting payload
    const accountingPayload = {
      messageId: validatedMessage.messageId,
      puid: validatedMessage.puid,
      messageType: validatedMessage.messageType,
      authMethod: validatedMessage.enrichmentData?.authMethod, // **NEW: Include auth method**
      amount: validatedMessage.enrichmentData?.messageData?.amount || validatedMessage.jsonPayload?.amount,
      currency: validatedMessage.enrichmentData?.messageData?.currency || 'SGD',
      debtorAccount: validatedMessage.enrichmentData?.messageData?.debtorAccount,
      creditorAccount: validatedMessage.enrichmentData?.messageData?.creditorAccount,
      enrichmentData: validatedMessage.enrichmentData,
      jsonPayload: validatedMessage.jsonPayload,
      processedAt: new Date().toISOString(),
      sourceService: 'fast-orchestrator-service'
    };
    
    // Call accounting service
    const response = await axios.post(`${ACCOUNTING_SERVICE_URL}/api/v1/accounting/process`, accountingPayload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': messageId
      }
    });
    
    console.log(`✅ Accounting service processed message ${messageId} successfully`);
    
    await addOrchestrationStep(messageId, 'accounting_service', 'completed', { 
      accountingResponse: response.data,
      httpStatus: response.status,
      authMethod: validatedMessage.enrichmentData?.authMethod // **NEW: Track auth method in response**
    });
    
    // **NEW: Fire-and-forget limit check for GROUPLIMIT auth method AFTER accounting**
    const authMethod = validatedMessage.enrichmentData?.authMethod;
    if (authMethod === 'GROUPLIMIT') {
      console.log(`🔍 Triggering fire-and-forget limit check for GROUPLIMIT message ${messageId} after accounting`);
      sendToLimitCheckServiceFireAndForget(messageId, validatedMessage);
    }
    
    // Mark overall orchestration as completed
    await completeOrchestration(messageId);
    
  } catch (error) {
    console.error(`❌ Failed to send message ${messageId} to accounting service:`, error);
    await addOrchestrationStep(messageId, 'accounting_service', 'failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

// Complete orchestration
async function completeOrchestration(messageId: string): Promise<void> {
  const orchestration = orchestrationStatus.get(messageId);
  if (!orchestration) return;
  
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

// **UPDATED: Determine route based on auth method and account system**
function determineRoute(validatedMessage: any): string {
  const { messageType, enrichmentData } = validatedMessage;
  const acctSys = enrichmentData?.physicalAcctInfo?.acctSys;
  const authMethod = enrichmentData?.authMethod;
  
  // Auth method takes precedence for routing decisions
  if (authMethod === 'GROUPLIMIT') {
    if (acctSys === 'VAM') {
      return 'grouplimit_vam_flow';
    } else if (acctSys === 'MDZ') {
      return 'grouplimit_mdz_flow';
    }
    return 'grouplimit_default_flow';
  }
  
  // Legacy routing based on account system
  if (acctSys === 'VAM') {
    return 'vam_flow';
  } else if (acctSys === 'MDZ') {
    return 'mdz_flow';
  }
  
  // Default routing based on message type
  if (messageType === 'PACS008') {
    return 'standard_flow';
  }
  
  return 'default_flow';
}

// Route to MDZ mediation service (placeholder)
async function routeToMdzMediationService(validatedMessage: any): Promise<void> {
  console.log('🏭 Routing to MDZ mediation service (placeholder implementation)');
  
  const mdzMessage = {
    messageId: validatedMessage.messageId,
    puid: validatedMessage.puid,
    messageType: validatedMessage.messageType,
    accountSystem: 'MDZ',
    enrichmentData: validatedMessage.enrichmentData,
    jsonPayload: validatedMessage.jsonPayload,
    routedAt: new Date().toISOString(),
    sourceService: 'fast-orchestrator-service'
  };

  await producer.send({
    topic: MDZ_KAFKA_TOPIC,
    messages: [
      {
        key: validatedMessage.messageId,
        value: JSON.stringify(mdzMessage),
        headers: {
          'message-type': validatedMessage.messageType || 'PACS008',
          'account-system': 'MDZ',
          'source': 'orchestrator'
        }
      }
    ]
  });
}

// Process downstream services
async function processDownstreamServices(route: string, validatedMessage: any): Promise<any> {
  const results: any = {};
  
  switch (route) {
    case 'grouplimit_vam_flow':
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.vamMediation = await callVamMediationService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      results.specialRouting = 'GROUPLIMIT + VAM system routing applied';
      break;
      
    case 'grouplimit_mdz_flow':
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.mdzMediation = await callMdzMediationService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      results.specialRouting = 'GROUPLIMIT + MDZ system routing applied';
      break;
      
    case 'vam_flow':
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      results.vamMediation = await callVamMediationService(validatedMessage);
      results.specialRouting = 'VAM system routing applied';
      break;
      
    case 'mdz_flow':
      results.limitCheck = await callLimitCheckService(validatedMessage);
      results.accounting = await callAccountingService(validatedMessage);
      results.mdzMediation = await callMdzMediationService(validatedMessage);
      results.specialRouting = 'MDZ system routing applied';
      break;
      
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

// Placeholder service calls
async function callLimitCheckService(message: any): Promise<any> {
  // Placeholder implementation
  return { status: 'completed', result: 'Limit check passed' };
}

async function callAccountingService(message: any): Promise<any> {
  // Placeholder implementation
  return { status: 'completed', result: 'Accounting processed' };
}

async function callVamMediationService(message: any): Promise<any> {
  // Placeholder implementation
  return { status: 'completed', result: 'VAM mediation processed' };
}

async function callMdzMediationService(message: any): Promise<any> {
  // Placeholder implementation
  return { status: 'completed', result: 'MDZ mediation processed' };
}

// Health check endpoint
app.get('/health', (req: Request, res: Response): void => {
  const health = {
    service: 'fast-orchestrator-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    kafka: {
      connected: true,
      topic: KAFKA_TOPIC,
      groupId: KAFKA_GROUP_ID,
      vamTopic: VAM_KAFKA_TOPIC,
      limitCheckTopic: LIMITCHECK_KAFKA_TOPIC // **NEW: Include limit check topic in health**
    },
    requestId: req.headers['x-request-id']
  };

  res.json(health);
});

// Get all processed messages
app.get('/api/v1/messages', (req: Request, res: Response): void => {
  const messages = Array.from(processedMessages.values());

  res.json({
    messages,
    count: messages.length,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Get all orchestration statuses
app.get('/api/v1/orchestration', (req: Request, res: Response): void => {
  const orchestrations = Array.from(orchestrationStatus.values());

  res.json({
    orchestrations,
    count: orchestrations.length,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Get specific orchestration status
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

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error('Express error:', error);
  
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Start services
async function startServices(): Promise<void> {
  try {
    // Initialize Kafka
    await initializeKafkaProducer();
    await initializeVAMResponseConsumer();
    await startKafkaConsumer();
    console.log('📥 Kafka consumer started (topic: validated-messages)');
    console.log('🔍 Limit check routing enabled for GROUPLIMIT auth method'); // **NEW: Log limit check capability**
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Fast Orchestrator Service is running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📋 Messages API: http://localhost:${PORT}/api/v1/messages`);
      console.log(`🔄 Orchestration API: http://localhost:${PORT}/api/v1/orchestration`);
    });
    
  } catch (error) {
    console.error('Failed to start services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('📤 Shutting down gracefully...');
  
  try {
    await consumer.disconnect();
    await vamResponseConsumer.disconnect();
    await producer.disconnect();
    console.log('📤 Kafka disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('📤 Shutting down gracefully...');
  
  try {
    await consumer.disconnect();
    await vamResponseConsumer.disconnect();
    await producer.disconnect();
    console.log('📤 Kafka disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the application
startServices(); 