import { Kafka, Admin } from 'kafkajs';
import { Logger } from '../../logging/Logger';
import { FastKafkaConfig, KafkaHealthStatus, TopicConfig } from './types';

/**
 * Base Kafka client providing common functionality for producers and consumers
 */
export class KafkaClient {
  protected kafka: Kafka;
  protected admin: Admin;
  protected logger: Logger;
  protected config: FastKafkaConfig;
  protected isConnected: boolean = false;
  protected lastConnectionTime?: Date;

  constructor(config: FastKafkaConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger({ serviceName: 'kafka-client' });

    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      retry: {
        retries: config.retry?.retries || 3,
        initialRetryTime: config.retry?.initialRetryTime || 1000,
        maxRetryTime: config.retry?.maxRetryTime || 30000,
      },
    });

    this.admin = this.kafka.admin();
  }

  /**
   * Connect to Kafka cluster
   */
  async connect(): Promise<void> {
    try {
      await this.admin.connect();
      this.isConnected = true;
      this.lastConnectionTime = new Date();
      
      this.logger.info('Kafka client connected successfully', {
        brokers: this.config.brokers,
        clientId: this.config.clientId
      });
    } catch (error) {
      this.isConnected = false;
      this.logger.error('Failed to connect Kafka client', {
        brokers: this.config.brokers,
        clientId: this.config.clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Disconnect from Kafka cluster
   */
  async disconnect(): Promise<void> {
    try {
      await this.admin.disconnect();
      this.isConnected = false;
      
      this.logger.info('Kafka client disconnected successfully', {
        clientId: this.config.clientId
      });
    } catch (error) {
      this.logger.error('Error disconnecting Kafka client', {
        clientId: this.config.clientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check health status of Kafka connection
   */
  async healthCheck(): Promise<KafkaHealthStatus> {
    try {
      // Try to list topics as a health check
      await this.admin.listTopics();
      
      return {
        connected: this.isConnected,
        brokers: this.config.brokers,
        lastConnectionTime: this.lastConnectionTime
      };
    } catch (error) {
      return {
        connected: false,
        brokers: this.config.brokers,
        lastConnectionTime: this.lastConnectionTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create topics if they don't exist
   */
  async createTopics(topics: TopicConfig[]): Promise<void> {
    try {
      const existingTopics = await this.admin.listTopics();
      const topicsToCreate = topics.filter(topic => !existingTopics.includes(topic.name));

      if (topicsToCreate.length > 0) {
        await this.admin.createTopics({
          topics: topicsToCreate.map(topic => ({
            topic: topic.name,
            numPartitions: topic.partitions || 1,
            replicationFactor: topic.replicationFactor || 1,
            configEntries: topic.configs ? Object.entries(topic.configs).map(([key, value]) => ({ name: key, value })) : []
          }))
        });

        this.logger.info('Topics created successfully', {
          topics: topicsToCreate.map(t => t.name)
        });
      }
    } catch (error) {
      this.logger.error('Failed to create topics', {
        topics: topics.map(t => t.name),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * List all available topics
   */
  async listTopics(): Promise<string[]> {
    try {
      return await this.admin.listTopics();
    } catch (error) {
      this.logger.error('Failed to list topics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get topic metadata
   */
  async getTopicMetadata(topics: string[]) {
    try {
      return await this.admin.fetchTopicMetadata({ topics });
    } catch (error) {
      this.logger.error('Failed to fetch topic metadata', {
        topics,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Wait for Kafka to be ready
   */
  async waitForReady(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const health = await this.healthCheck();
        if (health.connected) {
          this.logger.info('Kafka is ready', {
            waitTime: Date.now() - startTime
          });
          return;
        }
      } catch (error) {
        // Ignore and retry
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Kafka not ready within ${timeoutMs}ms`);
  }

  /**
   * Get Kafka instance for advanced usage
   */
  getKafkaInstance(): Kafka {
    return this.kafka;
  }

  /**
   * Get admin instance for advanced usage
   */
  getAdminInstance(): Admin {
    return this.admin;
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }
} 