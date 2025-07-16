import { 
  KafkaProducer, 
  FastKafkaConfig, 
  FastKafkaMessage,
  ConfigManager,
  createServiceLogger
} from '@gpp/fast-core';
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
  private producer: KafkaProducer;
  private readonly logger = createServiceLogger('fast-validation-service');

  constructor() {
    // Use fast-core ConfigManager to load Kafka configuration with validation service specifics
    const kafkaConfig: FastKafkaConfig = {
      brokers: config.kafka.brokers,
      clientId: config.kafka.clientId,
      groupId: config.kafka.groupId,
      topics: {
        validatedMessages: config.kafka.topic
      },
      retry: {
        retries: config.validation.maxRetryAttempts,
        initialRetryTime: config.validation.retryBackoffMs
      },
      producer: {
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000,
      }
    };

    this.producer = new KafkaProducer(kafkaConfig, this.logger);
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publishValidatedMessage(message: KafkaPublishMessage): Promise<boolean> {
    try {
      // Convert to FastKafkaMessage format
      const fastMessage: FastKafkaMessage = {
        messageId: message.messageId,
        puid: message.puid,
        timestamp: message.timestamp,
        sourceService: 'fast-validation-service',
        payload: {
          messageId: message.messageId,
          puid: message.puid,
          jsonPayload: message.jsonPayload,
          enrichmentData: message.enrichmentData,
          validationResult: message.validationResult,
          timestamp: message.timestamp,
          service: 'fast-validation-service',
          publishedAt: new Date().toISOString()
        }
      };

      const result = await this.producer.publishMessage(config.kafka.topic, fastMessage, {
        key: message.messageId,
        headers: {
          'messageId': message.messageId,
          'puid': message.puid,
          'service': 'fast-validation-service',
          'timestamp': message.timestamp.toString()
        }
      });

      this.logger.info('Message published to Kafka successfully', {
        messageId: message.messageId,
        puid: message.puid,
        topic: config.kafka.topic,
        partition: result[0]?.partition,
        offset: result[0]?.offset
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to publish message to Kafka', {
        messageId: message.messageId,
        puid: message.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async publishBatch(messages: KafkaPublishMessage[]): Promise<boolean> {
    try {
      // Convert to FastKafkaMessage format
      const fastMessages: FastKafkaMessage[] = messages.map(message => ({
        messageId: message.messageId,
        puid: message.puid,
        timestamp: message.timestamp,
        sourceService: 'fast-validation-service',
        payload: {
          messageId: message.messageId,
          puid: message.puid,
          jsonPayload: message.jsonPayload,
          enrichmentData: message.enrichmentData,
          validationResult: message.validationResult,
          timestamp: message.timestamp,
          service: 'fast-validation-service',
          publishedAt: new Date().toISOString()
        }
      }));

      const result = await this.producer.publishBatch(config.kafka.topic, fastMessages, {
        headers: {
          'service': 'fast-validation-service'
        }
      });

      this.logger.info('Batch published to Kafka successfully', {
        messageCount: messages.length,
        topic: config.kafka.topic,
        partitions: result.map((r: any) => r.partition),
        offsets: result.map((r: any) => r.offset)
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to publish batch to Kafka', {
        messageCount: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      const healthStatus = await this.producer.healthCheck();
      
      if (healthStatus.connected) {
        return { status: 'HEALTHY', message: 'Kafka connection is healthy' };
      } else {
        return { 
          status: 'UNHEALTHY', 
          message: healthStatus.error || 'Kafka connection not healthy' 
        };
      }
    } catch (error) {
      this.logger.error('Kafka health check failed', {
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