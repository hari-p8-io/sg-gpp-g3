import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { Kafka, Consumer, KafkaMessage } from 'kafkajs';
import winston from 'winston';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3006;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'limitcheck-messages';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fast-limitcheck-group';
const SERVICE_NAME = process.env.SERVICE_NAME || 'fast-limitcheck-service';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Logger setup
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: SERVICE_NAME },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

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

// In-memory storage for processed limit checks
const processedLimitChecks = new Map<string, any>();
const limitCheckResults = new Map<string, any>();

// Kafka setup
const kafka = new Kafka({
  clientId: SERVICE_NAME,
  brokers: KAFKA_BROKERS,
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

// Limit check service interfaces
interface LimitCheckRequest {
  messageId: string;
  puid: string;
  messageType: string;
  authMethod: string;
  accountInfo: {
    acctId: string;
    acctSys: string;
    acctGrp: string;
    country: string;
    currencyCode: string;
  };
  transactionData: {
    amount: number;
    currency: string;
    debtorAccount: string;
    creditorAccount: string;
  };
  enrichmentData: any;
  jsonPayload: any;
  routedAt: string;
  sourceService: string;
}

interface LimitCheckResponse {
  messageId: string;
  puid: string;
  success: boolean;
  limitCheckResult: 'APPROVED' | 'REJECTED' | 'REQUIRES_APPROVAL';
  errorMessage?: string;
  limitDetails?: {
    dailyLimit: number;
    monthlyLimit: number;
    transactionLimit: number;
    usedDailyAmount: number;
    usedMonthlyAmount: number;
    remainingDailyLimit: number;
    remainingMonthlyLimit: number;
  };
  processedAt: string;
  processingTimeMs: number;
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

        const limitCheckRequest: LimitCheckRequest = JSON.parse(messageValue);
        
        logger.info('Received limit check request', {
          messageId: limitCheckRequest.messageId,
          authMethod: limitCheckRequest.authMethod,
          accountId: limitCheckRequest.accountInfo.acctId,
          amount: limitCheckRequest.transactionData.amount
        });
        
        // Process the limit check request
        await processLimitCheckRequest(limitCheckRequest);
        
      } catch (error) {
        logger.error('Error processing Kafka message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          topic,
          partition
        });
      }
    },
  });
}

// Process limit check request
async function processLimitCheckRequest(request: LimitCheckRequest): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Store the request
    processedLimitChecks.set(request.messageId, {
      ...request,
      receivedAt: new Date().toISOString(),
      status: 'processing'
    });

    // Validate that this is a GROUPLIMIT auth method
    if (request.authMethod !== 'GROUPLIMIT') {
      logger.warn('Received limit check request for non-GROUPLIMIT auth method', {
        messageId: request.messageId,
        authMethod: request.authMethod
      });
      
      // Still process it but log the warning
    }

    // Perform limit check
    const limitCheckResult = await performLimitCheck(request);
    
    // Store the result
    limitCheckResults.set(request.messageId, limitCheckResult);
    
    // Update processing status
    processedLimitChecks.set(request.messageId, {
      ...processedLimitChecks.get(request.messageId),
      status: 'completed',
      result: limitCheckResult,
      completedAt: new Date().toISOString()
    });

    logger.info('Limit check completed', {
      messageId: request.messageId,
      result: limitCheckResult.limitCheckResult,
      processingTimeMs: limitCheckResult.processingTimeMs
    });

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    
    logger.error('Limit check failed', {
      messageId: request.messageId,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs
    });

    // Store error result
    const errorResult: LimitCheckResponse = {
      messageId: request.messageId,
      puid: request.puid,
      success: false,
      limitCheckResult: 'REJECTED',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      processedAt: new Date().toISOString(),
      processingTimeMs
    };

    limitCheckResults.set(request.messageId, errorResult);
    
    processedLimitChecks.set(request.messageId, {
      ...processedLimitChecks.get(request.messageId),
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date().toISOString()
    });
  }
}

// Perform actual limit check logic
async function performLimitCheck(request: LimitCheckRequest): Promise<LimitCheckResponse> {
  const startTime = Date.now();
  
  logger.info('Processing limit check request', {
    messageId: request.messageId,
    puid: request.puid,
    authMethod: request.authMethod,
    amount: request.transactionData.amount,
    account: request.accountInfo.acctId
  });

  // Get account limit details
  const limitDetails = await getLimitDetails(request.accountInfo);
  
  const transactionAmount = request.transactionData.amount;
  const remainingDailyLimit = limitDetails.dailyLimit - limitDetails.usedDailyAmount;
  const remainingMonthlyLimit = limitDetails.monthlyLimit - limitDetails.usedMonthlyAmount;

  let limitCheckResult: 'APPROVED' | 'REJECTED' | 'REQUIRES_APPROVAL' = 'APPROVED';
  let errorMessage: string | undefined;

  // Perform limit checks
  if (transactionAmount > limitDetails.transactionLimit) {
    limitCheckResult = 'REJECTED';
    errorMessage = `Transaction amount ${transactionAmount} exceeds transaction limit ${limitDetails.transactionLimit}`;
  } else if (transactionAmount > remainingDailyLimit) {
    limitCheckResult = 'REJECTED';
    errorMessage = `Transaction amount ${transactionAmount} exceeds remaining daily limit ${remainingDailyLimit}`;
  } else if (transactionAmount > remainingMonthlyLimit) {
    limitCheckResult = 'REJECTED';
    errorMessage = `Transaction amount ${transactionAmount} exceeds remaining monthly limit ${remainingMonthlyLimit}`;
  } else if (transactionAmount > limitDetails.transactionLimit * 0.8) {
    // If transaction is more than 80% of transaction limit, require approval
    limitCheckResult = 'REQUIRES_APPROVAL';
    errorMessage = `Transaction amount ${transactionAmount} requires approval (>80% of transaction limit)`;
  }

  const processingTimeMs = Date.now() - startTime;
  
  const response: LimitCheckResponse = {
    messageId: request.messageId,
    puid: request.puid,
    success: true,
    limitCheckResult,
    ...(errorMessage && { errorMessage }),
    limitDetails: {
      ...limitDetails,
      remainingDailyLimit,
      remainingMonthlyLimit
    },
    processedAt: new Date().toISOString(),
    processingTimeMs
  };

  logger.info('Limit check result', {
    messageId: request.messageId,
    result: limitCheckResult,
    amount: transactionAmount,
    remainingDailyLimit,
    remainingMonthlyLimit,
    processingTimeMs
  });

  return response;
}

// Get limit details for an account (mock implementation)
async function getLimitDetails(accountInfo: any): Promise<any> {
  // This would typically query a database or external service
  // For now, we'll return mock data based on account type
  
  const baseLimit = {
    dailyLimit: 100000,
    monthlyLimit: 1000000,
    transactionLimit: 50000,
    usedDailyAmount: 0,
    usedMonthlyAmount: 0
  };

  // Adjust limits based on account system and group
  if (accountInfo.acctSys === 'VAM') {
    return {
      ...baseLimit,
      dailyLimit: 200000,
      monthlyLimit: 2000000,
      transactionLimit: 100000,
      usedDailyAmount: Math.floor(Math.random() * 50000), // Mock usage
      usedMonthlyAmount: Math.floor(Math.random() * 500000)
    };
  }

  if (accountInfo.acctGrp === 'CORP') {
    return {
      ...baseLimit,
      dailyLimit: 500000,
      monthlyLimit: 5000000,
      transactionLimit: 200000,
      usedDailyAmount: Math.floor(Math.random() * 100000), // Mock usage
      usedMonthlyAmount: Math.floor(Math.random() * 1000000)
    };
  }

  return {
    ...baseLimit,
    usedDailyAmount: Math.floor(Math.random() * 25000), // Mock usage
    usedMonthlyAmount: Math.floor(Math.random() * 250000)
  };
}

// Health check endpoint
app.get('/health', (req: Request, res: Response): void => {
  const health = {
    service: SERVICE_NAME,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    kafka: {
      connected: true,
      topic: KAFKA_TOPIC,
      groupId: KAFKA_GROUP_ID
    },
    metrics: {
      totalProcessed: processedLimitChecks.size,
      totalResults: limitCheckResults.size
    },
    requestId: req.headers['x-request-id']
  };

  res.json(health);
});

// Get all processed limit checks
app.get('/api/v1/limitchecks', (req: Request, res: Response): void => {
  const limitChecks = Array.from(processedLimitChecks.values());

  res.json({
    limitChecks,
    count: limitChecks.length,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Get specific limit check result
app.get('/api/v1/limitchecks/:messageId', (req, res): void => {
  const { messageId } = req.params;
  const limitCheck = processedLimitChecks.get(messageId);
  const result = limitCheckResults.get(messageId);
  
  if (!limitCheck) {
    res.status(404).json({
      error: 'Limit check not found',
      messageId,
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  res.json({
    limitCheck,
    result,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Get limit check results
app.get('/api/v1/results', (req: Request, res: Response): void => {
  const results = Array.from(limitCheckResults.values());

  res.json({
    results,
    count: results.length,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Manual limit check endpoint (for testing)
app.post('/api/v1/limitcheck', async (req: Request, res: Response): Promise<void> => {
  try {
    const request: LimitCheckRequest = {
      messageId: uuidv4(),
      puid: req.body.puid || 'manual-test',
      messageType: req.body.messageType || 'PACS008',
      authMethod: req.body.authMethod || 'GROUPLIMIT',
      accountInfo: req.body.accountInfo || {
        acctId: 'TEST123',
        acctSys: 'MDZ',
        acctGrp: 'SGB',
        country: 'SG',
        currencyCode: 'SGD'
      },
      transactionData: req.body.transactionData || {
        amount: 10000,
        currency: 'SGD',
        debtorAccount: 'DEBTOR123',
        creditorAccount: 'CREDITOR123'
      },
      enrichmentData: req.body.enrichmentData || {},
      jsonPayload: req.body.jsonPayload || {},
      routedAt: new Date().toISOString(),
      sourceService: 'manual-test'
    };

    const result = await performLimitCheck(request);
    
    res.json({
      request,
      result,
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Manual limit check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id']
    });
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Express error', {
    error: error.message,
    stack: error.stack,
    requestId: req.headers['x-request-id']
  });
  
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
    // Start Kafka consumer
    await startKafkaConsumer();
    logger.info('Kafka consumer started', {
      topic: KAFKA_TOPIC,
      groupId: KAFKA_GROUP_ID
    });
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info('Fast Limit Check Service started', {
        port: PORT,
        healthEndpoint: `http://localhost:${PORT}/health`,
        limitsEndpoint: `http://localhost:${PORT}/api/v1/limitchecks`,
        resultsEndpoint: `http://localhost:${PORT}/api/v1/results`
      });
    });
    
  } catch (error) {
    logger.error('Failed to start services', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    await consumer.disconnect();
    logger.info('Kafka disconnected');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    await consumer.disconnect();
    logger.info('Kafka disconnected');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
});

// Start the application
startServices(); 