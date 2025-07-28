import { 
  KafkaProducer, 
  FastKafkaConfig, 
  FastKafkaMessage,
  ConfigManager,
  createServiceLogger
} from '@gpp/fast-core';

export interface EnrichedKafkaMessage {
  messageId: string;
  puid: string;
  messageType: string;
  jsonPayload: any;
  enrichmentData: any;
  timestamp: number;
  sourceService: string;
}

export class KafkaClient {
  private producer: KafkaProducer;
  private readonly topic: string;
  private readonly logger = createServiceLogger('fast-enrichment-service');

  constructor() {
    this.topic = process.env.ENRICHED_MESSAGES_TOPIC || 'enriched-messages';

    // Use fast-core ConfigManager to load Kafka configuration
    const kafkaConfig: FastKafkaConfig = {
      ...ConfigManager.loadKafkaConfig('fast-enrichment-service', {
        enrichedMessages: this.topic
      }),
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

  async publishEnrichedMessage(message: EnrichedKafkaMessage): Promise<boolean> {
    try {
      // Convert to FastKafkaMessage format
      const fastMessage: FastKafkaMessage = {
        messageId: message.messageId,
        puid: message.puid,
        timestamp: message.timestamp,
        sourceService: message.sourceService,
        messageType: message.messageType,
        payload: {
          messageId: message.messageId,
          puid: message.puid,
          messageType: message.messageType,
          jsonPayload: message.jsonPayload,
          enrichmentData: message.enrichmentData,
          timestamp: message.timestamp,
          sourceService: message.sourceService,
          publishedAt: new Date().toISOString(),
          flow: 'direct-enrichment'
        }
      };

      const result = await this.producer.publishMessage(this.topic, fastMessage, {
        key: message.messageId,
        headers: {
          'messageId': message.messageId,
          'puid': message.puid,
          'messageType': message.messageType,
          'sourceService': message.sourceService,
          'flow': 'direct-enrichment',
          'timestamp': message.timestamp.toString()
        }
      });

      this.logger.info('Enriched message published to Kafka successfully', {
        messageId: message.messageId,
        puid: message.puid,
        messageType: message.messageType,
        topic: this.topic,
        partition: result[0]?.partition,
        offset: result[0]?.offset,
        flow: 'direct-enrichment'
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to publish enriched message to Kafka', {
        messageId: message.messageId,
        puid: message.puid,
        topic: this.topic,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  isProducerConnected(): boolean {
    return this.producer.isClientConnected();
  }

  getTopic(): string {
    return this.topic;
  }

  // Health check method
  async healthCheck() {
    return await this.producer.healthCheck();
  }
} 