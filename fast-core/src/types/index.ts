// Common types used across Fast services

export interface BaseMessage {
  messageId: string;
  puid: string;
  timestamp: number;
  sourceService: string;
}

export interface EnrichedMessage extends BaseMessage {
  messageType: string;
  jsonPayload: any;
  enrichmentData: any;
}

export interface KafkaMessage<T = any> extends BaseMessage {
  topic: string;
  key?: string;
  value: T;
  headers?: Record<string, string | Buffer>;
}

export interface GrpcServiceInfo {
  serviceName: string;
  version: string;
  environment: string;
  isStubbed: boolean;
}

export interface HealthStatus {
  status: 'SERVING' | 'NOT_SERVING' | 'UNKNOWN';
  message?: string;
  timestamp: number;
  dependencies?: Record<string, HealthStatus>;
}

export interface ServiceConfig {
  serviceName: string;
  environment: string;
  logLevel: string;
}

export interface GrpcConfig {
  port: number;
  timeout: number;
  maxRetryAttempts: number;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId?: string;
  topics?: Record<string, string>;
}

export interface DatabaseConfig {
  projectId: string;
  instanceId: string;
  databaseId: string;
}

// Singapore specific types
export interface SingaporeAccountInfo {
  accountId: string;
  accountSystem: 'VAM' | 'MDZ' | 'MEPS';
  accountType: string;
  accountCategory: string;
  isActive: boolean;
  country: string;
  currency: string;
  bicfi: string;
}

export interface AuthenticationMethod {
  method: 'GROUPLIMIT' | 'AFPTHENLIMIT' | 'AFPONLY';
  description: string;
  isFireAndForget: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validatedFields: Record<string, any>;
}

export interface ProcessingResult {
  success: boolean;
  messageId: string;
  puid: string;
  resultData?: any;
  error?: string;
  processingTime: number;
}

// Event types for Kafka messages
export enum MessageType {
  PACS008 = 'pacs.008.001.08',
  PACS003 = 'pacs.003.001.08',
  PACS002 = 'pacs.002.001.10'
}

export enum ProcessingStatus {
  RECEIVED = 'RECEIVED',
  ENRICHED = 'ENRICHED',
  VALIDATED = 'VALIDATED',
  ROUTED = 'ROUTED',
  PROCESSED = 'PROCESSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
} 