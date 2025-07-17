import { KafkaConfig as KafkaJSConfig, ProducerConfig, ConsumerConfig, Message } from 'kafkajs';

export interface FastKafkaConfig {
  brokers: string[];
  clientId: string;
  groupId?: string;
  topics?: Record<string, string>;
  retry?: {
    retries: number;
    initialRetryTime: number;
    maxRetryTime?: number;
  };
  producer?: Partial<ProducerConfig>;
  consumer?: Partial<ConsumerConfig>;
}

export interface FastKafkaMessage<T = any> {
  messageId: string;
  puid: string;
  timestamp: number;
  sourceService: string;
  messageType?: string;
  payload: T;
  enrichmentData?: any;
  validationResult?: any;
  correlationId?: string;
}

export interface KafkaPublishOptions {
  key?: string;
  partition?: number;
  headers?: Record<string, string | Buffer>;
  timestamp?: string;
}

export interface MessageHandler<T = any> {
  (message: FastKafkaMessage<T>, rawMessage: Message): Promise<void>;
}

export interface KafkaHealthStatus {
  connected: boolean;
  brokers: string[];
  lastConnectionTime?: Date;
  error?: string;
}

export interface TopicConfig {
  name: string;
  partitions?: number;
  replicationFactor?: number;
  configs?: Record<string, string>;
} 