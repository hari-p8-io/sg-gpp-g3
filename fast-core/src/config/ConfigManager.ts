import { BaseServiceConfig, ConfigSchema } from './types';

/**
 * Centralized configuration manager for Fast services
 */
export class ConfigManager {
  /**
   * Load configuration from environment variables with validation
   */
  static loadConfig<T extends BaseServiceConfig>(
    defaults: Partial<T>,
    schema?: ConfigSchema<T>
  ): T {
    const config = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      environment: process.env.ENVIRONMENT || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      ...defaults
    } as T;

    // Override with environment variables
    this.applyEnvironmentOverrides(config);

    // Validate if schema provided
    if (schema) {
      this.validateConfig(config, schema);
    }

    return config;
  }

  /**
   * Apply environment variable overrides to configuration
   */
  private static applyEnvironmentOverrides<T>(config: T): void {
    // Apply common environment variables
    if (process.env.GRPC_PORT) {
      (config as any).grpc = { ...(config as any).grpc, port: parseInt(process.env.GRPC_PORT, 10) };
    }

    if (process.env.HTTP_PORT) {
      (config as any).http = { ...(config as any).http, port: parseInt(process.env.HTTP_PORT, 10) };
    }

    if (process.env.KAFKA_BROKERS) {
      (config as any).kafka = {
        ...(config as any).kafka,
        brokers: process.env.KAFKA_BROKERS.split(',')
      };
    }

    if (process.env.KAFKA_CLIENT_ID) {
      (config as any).kafka = {
        ...(config as any).kafka,
        clientId: process.env.KAFKA_CLIENT_ID
      };
    }

    if (process.env.KAFKA_GROUP_ID) {
      (config as any).kafka = {
        ...(config as any).kafka,
        groupId: process.env.KAFKA_GROUP_ID
      };
    }

    // Database configuration
    if (process.env.SPANNER_PROJECT_ID) {
      (config as any).database = {
        ...(config as any).database,
        projectId: process.env.SPANNER_PROJECT_ID
      };
    }

    if (process.env.SPANNER_INSTANCE_ID) {
      (config as any).database = {
        ...(config as any).database,
        instanceId: process.env.SPANNER_INSTANCE_ID
      };
    }

    if (process.env.SPANNER_DATABASE_ID) {
      (config as any).database = {
        ...(config as any).database,
        databaseId: process.env.SPANNER_DATABASE_ID
      };
    }
  }

  /**
   * Validate configuration against schema
   */
  static validateConfig<T>(config: T, schema: ConfigSchema<T>): void {
    for (const [key, definition] of Object.entries(schema)) {
      const value = (config as any)[key];

      // Check required fields
      if (definition.required && (value === undefined || value === null)) {
        throw new Error(`Configuration error: Required field '${key}' is missing`);
      }

      // Skip validation if value is undefined and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateType(value, definition.type)) {
        throw new Error(`Configuration error: Field '${key}' must be of type ${definition.type}`);
      }

      // Custom validation
      if (definition.validate && !definition.validate(value)) {
        throw new Error(`Configuration error: Field '${key}' failed validation`);
      }
    }
  }

  /**
   * Validate value type
   */
  private static validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Get environment-specific configuration
   */
  static getEnvironmentConfig(): {
    environment: string;
    isDevelopment: boolean;
    isProduction: boolean;
    isTest: boolean;
  } {
    const environment = process.env.ENVIRONMENT || 'development';
    
    return {
      environment,
      isDevelopment: environment === 'development',
      isProduction: environment === 'production',
      isTest: environment === 'test'
    };
  }

  /**
   * Load Kafka configuration from environment
   */
  static loadKafkaConfig(serviceName: string, additionalTopics: Record<string, string> = {}) {
    return {
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      clientId: process.env.KAFKA_CLIENT_ID || serviceName,
      groupId: process.env.KAFKA_GROUP_ID || `${serviceName}-group`,
      topics: {
        enrichedMessages: process.env.ENRICHED_MESSAGES_TOPIC || 'enriched-messages',
        validatedMessages: process.env.VALIDATED_MESSAGES_TOPIC || 'validated-messages',
        accountingMessages: process.env.ACCOUNTING_MESSAGES_TOPIC || 'accounting-messages',
        limitCheckMessages: process.env.LIMITCHECK_MESSAGES_TOPIC || 'limitcheck-messages',
        responseMessages: process.env.RESPONSE_MESSAGES_TOPIC || 'pacs-response-messages',
        ...additionalTopics
      },
      retry: {
        retries: parseInt(process.env.KAFKA_RETRY_ATTEMPTS || '3', 10),
        initialRetryTime: parseInt(process.env.KAFKA_RETRY_DELAY || '1000', 10)
      }
    };
  }

  /**
   * Load gRPC configuration from environment
   */
  static loadGrpcConfig(defaultPort: number) {
    return {
      port: parseInt(process.env.GRPC_PORT || defaultPort.toString(), 10),
      timeout: parseInt(process.env.GRPC_TIMEOUT || '5000', 10),
      maxRetryAttempts: parseInt(process.env.GRPC_MAX_RETRIES || '3', 10)
    };
  }

  /**
   * Load HTTP configuration from environment
   */
  static loadHttpConfig(defaultPort: number) {
    return {
      port: parseInt(process.env.HTTP_PORT || defaultPort.toString(), 10),
      timeout: parseInt(process.env.HTTP_TIMEOUT || '5000', 10),
      maxRetryAttempts: parseInt(process.env.HTTP_MAX_RETRIES || '3', 10)
    };
  }
} 