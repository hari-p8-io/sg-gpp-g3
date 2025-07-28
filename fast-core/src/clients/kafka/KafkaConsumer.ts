import { Consumer, EachMessagePayload, ConsumerSubscribeTopics } from 'kafkajs';
import { KafkaClient } from './KafkaClient';
import { FastKafkaConfig, FastKafkaMessage, MessageHandler } from './types';
import { Logger } from '../../logging/Logger';

/**
 * Kafka consumer with standardized message consumption and error handling
 */
export class KafkaConsumer extends KafkaClient {
  private consumer: Consumer;
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private isRunning: boolean = false;

  constructor(config: FastKafkaConfig, logger?: Logger) {
    super(config, logger);
    
    if (!config.groupId) {
      throw new Error('Consumer requires groupId in configuration');
    }

    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576,
      retry: {
        retries: config.retry?.retries || 3,
        initialRetryTime: config.retry?.initialRetryTime || 1000,
      },
      ...config.consumer
    });
  }

  /**
   * Connect consumer to Kafka
   */
  async connect(): Promise<void> {
    try {
      await this.consumer.connect();
      await super.connect(); // Connect admin client too
      
      this.logger.info('Kafka consumer connected successfully', {
        clientId: this.config.clientId,
        groupId: this.config.groupId,
        brokers: this.config.brokers
      });
    } catch (error) {
      this.logger.error('Failed to connect Kafka consumer', {
        clientId: this.config.clientId,
        groupId: this.config.groupId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Disconnect consumer from Kafka
   */
  async disconnect(): Promise<void> {
    try {
      this.isRunning = false;
      await this.consumer.disconnect();
      await super.disconnect();
      
      this.logger.info('Kafka consumer disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka consumer', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Subscribe to topics with message handlers
   */
  async subscribe(
    topics: string | string[] | ConsumerSubscribeTopics,
    handler: MessageHandler
  ): Promise<void> {
    try {
      await this.consumer.subscribe(typeof topics === 'string' || Array.isArray(topics) 
        ? { topics: Array.isArray(topics) ? topics : [topics] }
        : topics
      );

      // Store handler for all topics
      const topicList = typeof topics === 'string' 
        ? [topics] 
        : Array.isArray(topics) 
          ? topics 
          : topics.topics || [];

      topicList.forEach(topicName => {
        if (typeof topicName === 'string') {
          this.messageHandlers.set(topicName, handler);
        }
      });

      this.logger.info('Subscribed to topics', {
        topics: topicList,
        groupId: this.config.groupId
      });
    } catch (error) {
      this.logger.error('Failed to subscribe to topics', {
        topics: typeof topics === 'string' ? [topics] : topics,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Start consuming messages
   */
  async run(): Promise<void> {
    try {
      this.isRunning = true;

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.info('Kafka consumer started successfully', {
        groupId: this.config.groupId,
        topics: Array.from(this.messageHandlers.keys())
      });
    } catch (error) {
      this.isRunning = false;
      this.logger.error('Failed to start Kafka consumer', {
        groupId: this.config.groupId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      await this.consumer.stop();
      
      this.logger.info('Kafka consumer stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping Kafka consumer', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const handler = this.messageHandlers.get(topic);

    if (!handler) {
      this.logger.warn('No handler found for topic', { topic });
      return;
    }

    try {
      // Parse the message
      const messageValue = message.value?.toString();
      if (!messageValue) {
        this.logger.warn('Received empty message', { topic, partition, offset: message.offset });
        return;
      }

      let fastMessage: FastKafkaMessage;
      try {
        fastMessage = JSON.parse(messageValue);
      } catch (parseError) {
        this.logger.error('Failed to parse message JSON', {
          topic,
          partition,
          offset: message.offset,
          error: parseError instanceof Error ? parseError.message : 'Unknown error'
        });
        return;
      }

      // Set correlation ID if available
      const correlationId = message.headers?.correlationId?.toString() || fastMessage.correlationId;
      if (correlationId) {
        this.logger.setCorrelationId(correlationId);
      }

      this.logger.debug('Processing message', {
        topic,
        partition,
        offset: message.offset,
        messageId: fastMessage.messageId,
        puid: fastMessage.puid,
        messageType: fastMessage.messageType
      });

      // Call the handler
      await handler(fastMessage, message);

      this.logger.debug('Message processed successfully', {
        topic,
        messageId: fastMessage.messageId,
        puid: fastMessage.puid
      });

    } catch (error) {
      this.logger.error('Error processing message', {
        topic,
        partition,
        offset: message.offset,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Optionally send to dead letter topic
      await this.handleMessageError(payload, error as Error);
    } finally {
      // Clear correlation ID
      this.logger.clearCorrelationId();
    }
  }

  /**
   * Handle message processing errors
   */
  private async handleMessageError(payload: EachMessagePayload, error: Error): Promise<void> {
    const { topic, message } = payload;
    const deadLetterTopic = `${topic}-dead-letter`;

    try {
      const messageValue = message.value?.toString();
      if (!messageValue) return;

      const deadLetterMessage: FastKafkaMessage = {
        messageId: `dl-${Date.now()}`,
        puid: message.headers?.puid?.toString() || 'unknown',
        timestamp: Date.now(),
        sourceService: this.config.clientId,
        messageType: 'dead-letter',
        payload: {
          originalTopic: topic,
          originalMessage: messageValue,
          error: error.message,
          timestamp: new Date().toISOString(),
          partition: payload.partition,
          offset: message.offset
        }
      };

      // Send to dead letter topic (would need a producer instance)
      this.logger.error('Message sent to dead letter processing', {
        originalTopic: topic,
        deadLetterTopic,
        error: error.message
      });

    } catch (deadLetterError) {
      this.logger.error('Failed to handle message error', {
        originalError: error.message,
        deadLetterError: deadLetterError instanceof Error ? deadLetterError.message : 'Unknown error'
      });
    }
  }

  /**
   * Pause consumption for specific topics
   */
  async pause(topics?: string[]): Promise<void> {
    try {
      if (topics && topics.length > 0) {
        await this.consumer.pause(topics.map(topic => ({ topic })));
      } else {
        // Get all subscribed topics to pause them all
        const allTopics = Array.from(this.messageHandlers.keys());
        if (allTopics.length > 0) {
          await this.consumer.pause(allTopics.map(topic => ({ topic })));
        }
      }
      
      this.logger.info('Consumer paused', { topics });
    } catch (error) {
      this.logger.error('Failed to pause consumer', {
        topics,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Resume consumption for specific topics
   */
  async resume(topics?: string[]): Promise<void> {
    try {
      if (topics && topics.length > 0) {
        await this.consumer.resume(topics.map(topic => ({ topic })));
      } else {
        // Get all subscribed topics to resume them all
        const allTopics = Array.from(this.messageHandlers.keys());
        if (allTopics.length > 0) {
          await this.consumer.resume(allTopics.map(topic => ({ topic })));
        }
      }
      
      this.logger.info('Consumer resumed', { topics });
    } catch (error) {
      this.logger.error('Failed to resume consumer', {
        topics,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get consumer instance for advanced usage
   */
  getConsumerInstance(): Consumer {
    return this.consumer;
  }

  /**
   * Check if consumer is running
   */
  isConsumerRunning(): boolean {
    return this.isRunning;
  }
} 