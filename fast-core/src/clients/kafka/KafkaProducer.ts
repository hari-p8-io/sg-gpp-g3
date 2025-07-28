import { Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { KafkaClient } from './KafkaClient';
import { FastKafkaConfig, FastKafkaMessage, KafkaPublishOptions } from './types';
import { Logger } from '../../logging/Logger';

/**
 * Kafka producer with standardized message publishing and error handling
 */
export class KafkaProducer extends KafkaClient {
  private producer: Producer;

  constructor(config: FastKafkaConfig, logger?: Logger) {
    super(config, logger);
    
    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        retries: config.retry?.retries || 3,
        initialRetryTime: config.retry?.initialRetryTime || 1000,
      },
      ...config.producer
    });
  }

  /**
   * Connect producer to Kafka
   */
  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      await super.connect(); // Connect admin client too
      
      this.logger.info('Kafka producer connected successfully', {
        clientId: this.config.clientId,
        brokers: this.config.brokers
      });
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', {
        clientId: this.config.clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Disconnect producer from Kafka
   */
  async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      await super.disconnect();
      
      this.logger.info('Kafka producer disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish a single message to a topic
   */
  async publishMessage<T>(
    topic: string,
    message: FastKafkaMessage<T>,
    options: KafkaPublishOptions = {}
  ): Promise<RecordMetadata[]> {
    try {
      const kafkaMessage = {
        key: options.key || message.messageId,
        value: JSON.stringify(message),
        partition: options.partition,
        timestamp: options.timestamp || new Date().toISOString(),
        headers: {
          messageId: message.messageId,
          puid: message.puid,
          sourceService: message.sourceService,
          messageType: message.messageType || 'unknown',
          correlationId: message.correlationId || '',
          ...options.headers
        }
      };

      const result = await this.producer.send({
        topic,
        messages: [kafkaMessage]
      });

      this.logger.info('Message published successfully', {
        topic,
        messageId: message.messageId,
        puid: message.puid,
        partition: result[0]?.partition,
        offset: result[0]?.offset
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to publish message', {
        topic,
        messageId: message.messageId,
        puid: message.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish multiple messages to a topic
   */
  async publishBatch<T>(
    topic: string,
    messages: FastKafkaMessage<T>[],
    options: KafkaPublishOptions = {}
  ): Promise<RecordMetadata[]> {
    try {
      const kafkaMessages = messages.map(message => ({
        key: options.key || message.messageId,
        value: JSON.stringify(message),
        partition: options.partition,
        timestamp: options.timestamp || new Date().toISOString(),
        headers: {
          messageId: message.messageId,
          puid: message.puid,
          sourceService: message.sourceService,
          messageType: message.messageType || 'unknown',
          correlationId: message.correlationId || '',
          ...options.headers
        }
      }));

      const result = await this.producer.send({
        topic,
        messages: kafkaMessages
      });

      this.logger.info('Batch messages published successfully', {
        topic,
        messageCount: messages.length,
        messageIds: messages.map(m => m.messageId)
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to publish batch messages', {
        topic,
        messageCount: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish message with automatic retry and dead letter handling
   */
  async publishWithRetry<T>(
    topic: string,
    message: FastKafkaMessage<T>,
    options: KafkaPublishOptions & { maxRetries?: number; retryDelayMs?: number } = {}
  ): Promise<RecordMetadata[]> {
    const maxRetries = options.maxRetries || 3;
    const retryDelayMs = options.retryDelayMs || 1000;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.publishMessage(topic, message, options);
      } catch (error) {
        lastError = error as Error;
        
        this.logger.warn('Failed to publish message, retrying', {
          topic,
          messageId: message.messageId,
          attempt,
          maxRetries,
          error: lastError.message
        });

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
        }
      }
    }

    // Send to dead letter topic if configured
    const deadLetterTopic = `${topic}-dead-letter`;
    try {
      await this.publishMessage(deadLetterTopic, {
        ...message,
        payload: {
          originalMessage: message,
          error: lastError!.message,
          retryAttempts: maxRetries,
          failedAt: new Date().toISOString()
        }
      });

      this.logger.error('Message sent to dead letter topic after retry exhaustion', {
        originalTopic: topic,
        deadLetterTopic,
        messageId: message.messageId,
        error: lastError!.message
      });
    } catch (deadLetterError) {
      this.logger.error('Failed to send message to dead letter topic', {
        topic: deadLetterTopic,
        messageId: message.messageId,
        originalError: lastError!.message,
        deadLetterError: deadLetterError instanceof Error ? deadLetterError.message : 'Unknown error'
      });
    }

    throw lastError!;
  }

  /**
   * Send raw Kafka record (for advanced usage)
   */
  async sendRaw(record: ProducerRecord): Promise<RecordMetadata[]> {
    try {
      const result = await this.producer.send(record);
      
      this.logger.debug('Raw message sent successfully', {
        topic: record.topic,
        messageCount: record.messages.length
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to send raw message', {
        topic: record.topic,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get producer instance for advanced usage
   */
  getProducerInstance(): Producer {
    return this.producer;
  }
} 