import { Kafka, Producer, KafkaConfig } from 'kafkajs';
import { logger } from '../utils/logger';
import { config } from '../config/default';

export interface PACS002Message {
  messageId: string;
  puid: string;
  responseType: 'PACS.002';
  originalMessageType: string;
  status: 'ACSC' | 'RJCT';
  createdAt: string;
  processingTimeMs?: number;
  xmlPayload: string;
  originalTransaction?: {
    amount?: string;
    currency?: string;
    debtorAccount?: string;
    creditorAccount?: string;
  };
  enrichmentData?: any;
  errorDetails?: {
    errorCode?: string;
    errorMessage?: string;
  };
}

export class ResponseKafkaClient {
  private kafka: Kafka;
  private producer: Producer;
  private isConnected: boolean = false;
  private readonly responseTopic: string;

  constructor() {
    const kafkaConfig: KafkaConfig = {
      clientId: 'fast-inwd-processor-response-client',
      brokers: config.kafka.brokers,
      retry: {
        retries: 3,
        initialRetryTime: 1000,
        maxRetryTime: 30000,
      },
    };

    this.kafka = new Kafka(kafkaConfig);
    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        retries: 3,
        initialRetryTime: 1000,
      },
    });

    this.responseTopic = config.kafka.responseTopics.pacsResponses || 'pacs-response-messages';
    
    logger.info('ResponseKafkaClient initialized', {
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      responseTopic: this.responseTopic
    });
  }

  /**
   * Connect to Kafka
   */
  async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        logger.debug('ResponseKafkaClient already connected');
        return;
      }

      await this.producer.connect();
      this.isConnected = true;
      
      logger.info('ResponseKafkaClient connected successfully', {
        responseTopic: this.responseTopic
      });
    } catch (error) {
      logger.error('Failed to connect ResponseKafkaClient', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect(): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.debug('ResponseKafkaClient already disconnected');
        return;
      }

      await this.producer.disconnect();
      this.isConnected = false;
      
      logger.info('ResponseKafkaClient disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect ResponseKafkaClient', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish PACS.002 response message to Kafka
   */
  async publishPacs002Response(response: PACS002Message): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const kafkaMessage = {
        key: response.puid,
        value: JSON.stringify(response),
        headers: {
          'messageId': response.messageId,
          'puid': response.puid,
          'messageType': response.responseType,
          'originalMessageType': response.originalMessageType,
          'status': response.status,
          'timestamp': response.createdAt,
          'source': 'fast-inwd-processor-service',
        },
      };

      const result = await this.producer.send({
        topic: this.responseTopic,
        messages: [kafkaMessage],
      });

      logger.info('PACS.002 response published successfully', {
        messageId: response.messageId,
        puid: response.puid,
        status: response.status,
        originalMessageType: response.originalMessageType,
        topic: this.responseTopic,
        partition: result[0].partition,
        offset: result[0].offset,
        xmlPayloadSize: response.xmlPayload.length
      });

      return true;

    } catch (error) {
      logger.error('Failed to publish PACS.002 response', {
        messageId: response.messageId,
        puid: response.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * Health check for Kafka connection
   */
  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      if (!this.isConnected) {
        return {
          status: 'NOT_SERVING',
          message: 'ResponseKafkaClient not connected'
        };
      }

      // Try to get metadata as a connectivity test
      const admin = this.kafka.admin();
      await admin.connect();
      await admin.fetchTopicMetadata({ topics: [this.responseTopic] });
      await admin.disconnect();

      return {
        status: 'SERVING',
        message: 'ResponseKafkaClient healthy'
      };

    } catch (error) {
      logger.error('ResponseKafkaClient health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        status: 'NOT_SERVING',
        message: `ResponseKafkaClient unhealthy: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get connection status
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get response topic name
   */
  getResponseTopic(): string {
    return this.responseTopic;
  }
} 