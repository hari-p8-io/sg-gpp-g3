export interface BaseServiceConfig {
  serviceName: string;
  environment: string;
  logLevel: string;
  healthCheckPort?: number;
}

export interface GrpcServiceConfig extends BaseServiceConfig {
  grpc: {
    port: number;
    timeout: number;
    maxRetryAttempts: number;
  };
}

export interface KafkaServiceConfig extends BaseServiceConfig {
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
    topics: Record<string, string>;
  };
}

export interface HttpServiceConfig extends BaseServiceConfig {
  http: {
    port: number;
    timeout: number;
    maxRetryAttempts: number;
  };
}

export interface DatabaseConfig {
  projectId: string;
  instanceId: string;
  databaseId: string;
  keyFilename?: string;
}

export interface ValidationConfig {
  timeoutMs: number;
  maxRetryAttempts: number;
  retryBackoffMs: number;
  expectedCountry: string;
  expectedCurrency: string;
  useTestMode: boolean;
}

export interface ConfigSchema<T> {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    default?: any;
    validate?: (value: any) => boolean;
  };
} 