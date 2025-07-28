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
  messageType: string; // Added: Message type for routing
  jsonPayload: any;
  enrichmentData?: any;
  validationResult: any;
  timestamp: number;
  sourceService: string; // Added: Source service identification
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
      }
    };

    this.producer = new KafkaProducer(kafkaConfig, this.logger);
  }

  async publishValidatedMessage(message: KafkaPublishMessage): Promise<boolean> {
    try {
      // Convert to FastKafkaMessage format
      const fastMessage: FastKafkaMessage = {
        messageId: message.messageId,
        puid: message.puid,
        timestamp: message.timestamp,
        sourceService: message.sourceService,
        payload: {
          messageId: message.messageId,
          puid: message.puid,
          messageType: message.messageType,
          jsonPayload: message.jsonPayload,
          enrichmentData: message.enrichmentData,
          validationResult: message.validationResult,
          timestamp: message.timestamp,
          service: message.sourceService,
          publishedAt: new Date().toISOString()
        }
      };

      const result = await this.producer.publishMessage(config.kafka.topic, fastMessage, {
        key: message.messageId,
        headers: {
          'messageId': message.messageId,
          'puid': message.puid,
          'messageType': message.messageType,
          'service': message.sourceService,
          'timestamp': message.timestamp.toString()
        }
      });

      this.logger.info('Message published to Kafka successfully', {
        messageId: message.messageId,
        puid: message.puid,
        messageType: message.messageType,
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

  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      const healthStatus = await this.producer.healthCheck();
      
      if (healthStatus.connected) {
        return {
          status: 'SERVING',
          message: 'Kafka client is healthy and connected'
        };
      } else {
        return {
          status: 'NOT_SERVING',
          message: healthStatus.error || 'Kafka client is not connected'
        };
      }

    } catch (error) {
      this.logger.error('Kafka health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        status: 'NOT_SERVING',
        message: `Kafka health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.info('Kafka client connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Kafka', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.logger.info('Kafka client disconnected successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from Kafka', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

// Export singleton instance
export const kafkaClient = new KafkaClient(); 