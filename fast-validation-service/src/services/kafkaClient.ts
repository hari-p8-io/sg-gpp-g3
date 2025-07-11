import { Kafka, Producer, Message } from 'kafkajs';
import { logger } from '../utils/logger';
import { config } from '../config/default';

export interface KafkaPublishMessage {
  messageId: string;
  puid: string;
  jsonPayload: any;
  enrichmentData?: any;
  validationResult: any;
  timestamp: number;
}

export class KafkaClient {
  private kafka: Kafka;
  private producer: Producer;
  private isConnected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        retries: config.validation.maxRetryAttempts,
        initialRetryTime: config.validation.retryBackoffMs
      }
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.isConnected = true;
      logger.info('Kafka producer connected successfully', {
        brokers: config.kafka.brokers,
        clientId: config.kafka.clientId
      });
    } catch (error) {
      logger.error('Failed to connect Kafka producer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        brokers: config.kafka.brokers
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.producer.disconnect();
        this.isConnected = false;
        logger.info('Kafka producer disconnected successfully');
      }
    } catch (error) {
      logger.error('Error disconnecting Kafka producer', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async publishValidatedMessage(message: KafkaPublishMessage): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const kafkaMessage: Message = {
        key: message.messageId,
        value: JSON.stringify({
          messageId: message.messageId,
          puid: message.puid,
          jsonPayload: message.jsonPayload,
          enrichmentData: message.enrichmentData,
          validationResult: message.validationResult,
          timestamp: message.timestamp,
          service: 'fast-validation-service',
          publishedAt: new Date().toISOString()
        }),
        headers: {
          'messageId': message.messageId,
          'puid': message.puid,
          'service': 'fast-validation-service',
          'timestamp': message.timestamp.toString()
        }
      };

      const result = await this.producer.send({
        topic: config.kafka.topic,
        messages: [kafkaMessage]
      });

      logger.info('Message published to Kafka successfully', {
        messageId: message.messageId,
        puid: message.puid,
        topic: config.kafka.topic,
        partition: result[0]?.partition,
        offset: result[0]?.baseOffset
      });

      return true;
    } catch (error) {
      logger.error('Failed to publish message to Kafka', {
        messageId: message.messageId,
        puid: message.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async publishBatch(messages: KafkaPublishMessage[]): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const kafkaMessages: Message[] = messages.map(message => ({
        key: message.messageId,
        value: JSON.stringify({
          messageId: message.messageId,
          puid: message.puid,
          jsonPayload: message.jsonPayload,
          enrichmentData: message.enrichmentData,
          validationResult: message.validationResult,
          timestamp: message.timestamp,
          service: 'fast-validation-service',
          publishedAt: new Date().toISOString()
        }),
        headers: {
          'messageId': message.messageId,
          'puid': message.puid,
          'service': 'fast-validation-service',
          'timestamp': message.timestamp.toString()
        }
      }));

      const result = await this.producer.send({
        topic: config.kafka.topic,
        messages: kafkaMessages
      });

      logger.info('Batch published to Kafka successfully', {
        messageCount: messages.length,
        topic: config.kafka.topic,
        partitions: result.map((r: any) => r.partition),
        offsets: result.map((r: any) => r.baseOffset)
      });

      return true;
    } catch (error) {
      logger.error('Failed to publish batch to Kafka', {
        messageCount: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      if (!this.isConnected) {
        return { status: 'NOT_CONNECTED', message: 'Kafka producer not connected' };
      }

      // Simple health check - try to get metadata
      const admin = this.kafka.admin();
      await admin.connect();
      const metadata = await admin.fetchTopicMetadata({ topics: [config.kafka.topic] });
      await admin.disconnect();

      if (metadata.topics.length > 0) {
        return { status: 'HEALTHY', message: 'Kafka connection is healthy' };
      } else {
        return { status: 'UNHEALTHY', message: 'Topic not found' };
      }
    } catch (error) {
      logger.error('Kafka health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { 
        status: 'UNHEALTHY', 
        message: `Kafka health check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}

export const kafkaClient = new KafkaClient(); 