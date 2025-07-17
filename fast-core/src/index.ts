// Logging exports
export { Logger } from './logging/Logger';
export { LoggerFactory, createLogger, getLogger, setGlobalLogLevel } from './logging/LoggerFactory';
export { LogLevel, LogData, LogEntry, LoggerConfig } from './logging/types';

// Kafka client exports
export { KafkaClient } from './clients/kafka/KafkaClient';
export { KafkaProducer } from './clients/kafka/KafkaProducer';
export { KafkaConsumer } from './clients/kafka/KafkaConsumer';
export {
  FastKafkaConfig,
  FastKafkaMessage,
  KafkaPublishOptions,
  MessageHandler,
  KafkaHealthStatus,
  TopicConfig
} from './clients/kafka/types';

// Configuration exports
export { ConfigManager } from './config/ConfigManager';
export {
  BaseServiceConfig,
  GrpcServiceConfig,
  KafkaServiceConfig,
  HttpServiceConfig,
  DatabaseConfig,
  ValidationConfig,
  ConfigSchema
} from './config/types';

// Common types exports
export {
  BaseMessage,
  EnrichedMessage,
  KafkaMessage,
  GrpcServiceInfo,
  HealthStatus,
  ServiceConfig,
  GrpcConfig,
  KafkaConfig,
  SingaporeAccountInfo,
  AuthenticationMethod,
  ValidationResult,
  ProcessingResult,
  MessageType,
  ProcessingStatus
} from './types';

// Import types for convenience functions
import { FastKafkaConfig } from './clients/kafka/types';
import { Logger } from './logging/Logger';
import { KafkaProducer } from './clients/kafka/KafkaProducer';
import { KafkaConsumer } from './clients/kafka/KafkaConsumer';
import { createLogger } from './logging/LoggerFactory';

// Convenience factory functions
export const createKafkaProducer = (config: FastKafkaConfig, logger?: Logger) => 
  new KafkaProducer(config, logger);

export const createKafkaConsumer = (config: FastKafkaConfig, logger?: Logger) => 
  new KafkaConsumer(config, logger);

export const createServiceLogger = (serviceName: string) => 
  createLogger({ serviceName });

// Default configurations for common services
export const DEFAULT_KAFKA_CONFIG = {
  brokers: ['localhost:9092'],
  retry: {
    retries: 3,
    initialRetryTime: 1000
  }
};

export const DEFAULT_GRPC_CONFIG = {
  timeout: 5000,
  maxRetryAttempts: 3
};

export const DEFAULT_HTTP_CONFIG = {
  timeout: 5000,
  maxRetryAttempts: 3
}; 