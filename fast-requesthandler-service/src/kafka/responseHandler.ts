import { Kafka, Consumer, Producer } from 'kafkajs';
import { SpannerClient } from '../database/spanner';
const PACS002Generator = require('../utils/pacs002Generator');

export interface CompletionMessage {
  messageId: string;
  puid: string;
  transactionId: string;
  messageType: string;
  status: string;
  completedAt: string;
  processingTimeMs: number;
  amount: string;
  currency: string;
  debtorAccount: string;
  creditorAccount: string;
  originalMessageData: {
    originalMessageId: string;
    originalCreationTime: string;
    originalXmlPayload: string;
  };
  enrichmentData: any;
  accountingResult: any;
  responseRequired: boolean;
  responseType: string;
}

export class ResponseHandler {
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private spannerClient: SpannerClient;
  private pacs002Generator: any;
  private isRunning: boolean = false;

  constructor(
    spannerClient: SpannerClient,
    kafkaBrokers: string[],
    consumerGroupId: string = 'fast-requesthandler-response-group',
    completionTopic: string = 'accounting-completion-messages',
    responseTopic: string = 'pacs-response-messages'
  ) {
    this.spannerClient = spannerClient;
    this.pacs002Generator = new PACS002Generator();
    
    this.kafka = new Kafka({
      clientId: 'fast-requesthandler-service',
      brokers: kafkaBrokers,
      retry: {
        retries: 3,
        initialRetryTime: 1000,
        maxRetryTime: 30000,
      },
    });

    this.consumer = this.kafka.consumer({ 
      groupId: consumerGroupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        retries: 3,
        initialRetryTime: 1000,
      },
    });

    this.completionTopic = completionTopic;
    this.responseTopic = responseTopic;
  }

  private completionTopic: string;
  private responseTopic: string;

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Kafka Response Handler...');
      
      // Connect producer
      await this.producer.connect();
      console.log('📤 Kafka producer connected');

      // Connect consumer
      await this.consumer.connect();
      console.log('📥 Kafka consumer connected');

      // Subscribe to completion messages
      await this.consumer.subscribe({ 
        topic: this.completionTopic,
        fromBeginning: false 
      });
      console.log(`📥 Subscribed to completion topic: ${this.completionTopic}`);

      console.log('✅ Kafka Response Handler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kafka Response Handler:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Response handler is already running');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🔄 Starting Kafka Response Handler...');

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const completionData = this.parseCompletionMessage(message);
            if (completionData) {
              await this.processCompletionMessage(completionData);
            }
          } catch (error) {
            console.error('❌ Error processing completion message:', error);
            // Log error but don't stop processing
          }
        },
      });

      console.log('✅ Kafka Response Handler started successfully');
    } catch (error) {
      console.error('❌ Failed to start Kafka Response Handler:', error);
      this.isRunning = false;
      throw error;
    }
  }

  private parseCompletionMessage(message: any): CompletionMessage | null {
    try {
      if (!message.value) {
        console.warn('⚠️  Received message with no value');
        return null;
      }

      const messageString = message.value.toString();
      const completionData = JSON.parse(messageString) as CompletionMessage;

      console.log(`📥 Received completion message: ${completionData.puid}`);
      console.log(`   Status: ${completionData.status}`);
      console.log(`   Response Required: ${completionData.responseRequired}`);
      console.log(`   Response Type: ${completionData.responseType}`);

      return completionData;
    } catch (error) {
      console.error('❌ Failed to parse completion message:', error);
      return null;
    }
  }

  private async processCompletionMessage(completionData: CompletionMessage): Promise<void> {
    try {
      console.log(`🔄 Processing completion message for PUID: ${completionData.puid}`);
      
      // Check if response is required
      if (!completionData.responseRequired) {
        console.log(`ℹ️  No response required for PUID: ${completionData.puid}`);
        return;
      }

      // Update message status in database
      await this.updateMessageStatus(completionData);

      // Generate PACS.002 response
      const pacs002Response = await this.generatePacs002Response(completionData);

      // Send PACS.002 response to response topic
      await this.sendPacs002Response(pacs002Response, completionData);

      console.log(`✅ Completion message processed successfully for PUID: ${completionData.puid}`);
    } catch (error) {
      console.error(`❌ Failed to process completion message for PUID: ${completionData.puid}`, error);
    }
  }

  private async updateMessageStatus(completionData: CompletionMessage): Promise<void> {
    try {
      const status = completionData.status === 'COMPLETED' ? 'PROCESSED' : 'FAILED';
      await this.spannerClient.updateMessageStatus(
        completionData.messageId,
        status,
        new Date(completionData.completedAt)
      );
      console.log(`📊 Updated message status to ${status} for ${completionData.puid}`);
    } catch (error) {
      console.error(`❌ Failed to update message status for ${completionData.puid}:`, error);
      // Don't throw - this is not critical for response generation
    }
  }

  private async generatePacs002Response(completionData: CompletionMessage): Promise<string> {
    try {
      console.log(`🏭 Generating PACS.002 response for PUID: ${completionData.puid}`);
      
      if (completionData.status === 'COMPLETED') {
        const pacs002Xml = this.pacs002Generator.generatePacs002(completionData);
        console.log(`✅ PACS.002 success response generated for PUID: ${completionData.puid}`);
        return pacs002Xml;
      } else {
        // Generate failure response
        const failureData = {
          originalMessageId: completionData.originalMessageData.originalMessageId,
          puid: completionData.puid,
          amount: completionData.amount,
          currency: completionData.currency,
          errorCode: 'TECHNICAL_ERROR',
          errorMessage: 'Transaction processing failed'
        };
        
        const pacs002Xml = this.pacs002Generator.generatePacs002Failure(failureData);
        console.log(`⚠️  PACS.002 failure response generated for PUID: ${completionData.puid}`);
        return pacs002Xml;
      }
    } catch (error) {
      console.error(`❌ Failed to generate PACS.002 response for PUID: ${completionData.puid}`, error);
      throw error;
    }
  }

  private async sendPacs002Response(pacs002Xml: string, completionData: CompletionMessage): Promise<void> {
    try {
      const responseMessage = {
        messageId: completionData.messageId,
        puid: completionData.puid,
        responseType: 'PACS.002',
        originalMessageType: completionData.messageType,
        status: completionData.status,
        createdAt: new Date().toISOString(),
        processingTimeMs: completionData.processingTimeMs,
        xmlPayload: pacs002Xml,
        originalTransaction: {
          amount: completionData.amount,
          currency: completionData.currency,
          debtorAccount: completionData.debtorAccount,
          creditorAccount: completionData.creditorAccount,
        },
        enrichmentData: completionData.enrichmentData,
        accountingResult: completionData.accountingResult,
      };

      const kafkaMessage = {
        key: completionData.puid,
        value: JSON.stringify(responseMessage),
        headers: {
          'messageId': completionData.messageId,
          'puid': completionData.puid,
          'messageType': 'PACS.002',
          'originalMessageType': completionData.messageType,
          'status': completionData.status,
          'timestamp': new Date().toISOString(),
          'source': 'fast-requesthandler-service',
        },
      };

      await this.producer.send({
        topic: this.responseTopic,
        messages: [kafkaMessage],
      });

      console.log(`📤 PACS.002 response sent to topic: ${this.responseTopic}`);
      console.log(`   PUID: ${completionData.puid}`);
      console.log(`   Status: ${completionData.status}`);
      console.log(`   XML Size: ${pacs002Xml.length} bytes`);
    } catch (error) {
      console.error(`❌ Failed to send PACS.002 response for PUID: ${completionData.puid}`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('ℹ️  Response handler is not running');
      return;
    }

    try {
      console.log('🛑 Stopping Kafka Response Handler...');
      this.isRunning = false;

      if (this.consumer) {
        await this.consumer.stop();
        await this.consumer.disconnect();
        console.log('📥 Kafka consumer disconnected');
      }

      if (this.producer) {
        await this.producer.disconnect();
        console.log('📤 Kafka producer disconnected');
      }

      console.log('✅ Kafka Response Handler stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping Kafka Response Handler:', error);
      throw error;
    }
  }

  getStatus(): object {
    return {
      isRunning: this.isRunning,
      completionTopic: this.completionTopic,
      responseTopic: this.responseTopic,
      timestamp: new Date().toISOString(),
    };
  }
}

export default ResponseHandler; 