export interface ServiceConfig {
  grpcPort: number;
  serviceName: string;
  logLevel: string;
  environment: string;
  country: string;
  defaultCurrency: string;
  accountLookupServiceUrl: string;
  referenceDataServiceUrl: string;
  validationServiceUrl: string;
  enrichmentTimeoutMs: number;
  accountLookupTimeoutMs: number;
  authMethodTimeoutMs: number;
  maxRetryAttempts: number;
  retryBackoffMs: number;
  useMockAccountLookup: boolean;
  kafka: {
    brokers: string[];
    enrichedMessagesTopic: string;
    responseTopics: {
      pacsResponses: string;
    };
  };
  database: {
    projectId: string;
    instanceId: string;
    databaseId: string;
  };
}

export const config: ServiceConfig = {
  grpcPort: parseInt(process.env['GRPC_PORT'] || '50052', 10),
  serviceName: process.env['SERVICE_NAME'] || 'fast-inwd-processor-service',
  logLevel: process.env['LOG_LEVEL'] || 'info',
  environment: process.env['ENVIRONMENT'] || 'development',
  country: process.env['COUNTRY'] || 'SG',
  defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'SGD',
  accountLookupServiceUrl: process.env['ACCOUNT_LOOKUP_SERVICE_URL'] || 'localhost:50059',
  referenceDataServiceUrl: process.env['REFERENCE_DATA_SERVICE_URL'] || 'localhost:50060',
  validationServiceUrl: process.env['VALIDATION_SERVICE_URL'] || 'localhost:50053',
  enrichmentTimeoutMs: parseInt(process.env['ENRICHMENT_TIMEOUT_MS'] || '5000', 10),
  accountLookupTimeoutMs: parseInt(process.env['ACCOUNT_LOOKUP_TIMEOUT_MS'] || '3000', 10),
  authMethodTimeoutMs: parseInt(process.env['AUTH_METHOD_TIMEOUT_MS'] || '3000', 10),
  maxRetryAttempts: parseInt(process.env['MAX_RETRY_ATTEMPTS'] || '3', 10),
  retryBackoffMs: parseInt(process.env['RETRY_BACKOFF_MS'] || '1000', 10),
  useMockAccountLookup: process.env['USE_MOCK_ACCOUNT_LOOKUP'] === 'true',
  kafka: {
    brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','),
    enrichedMessagesTopic: process.env['KAFKA_ENRICHED_MESSAGES_TOPIC'] || 'enriched-messages',
    responseTopics: {
      pacsResponses: process.env['KAFKA_PACS_RESPONSE_TOPIC'] || 'pacs-response-messages'
    }
  },
  database: {
    projectId: process.env['SPANNER_PROJECT_ID'] || 'gpp-g3-project',
    instanceId: process.env['SPANNER_INSTANCE_ID'] || 'gpp-g3-instance',
    databaseId: process.env['SPANNER_DATABASE_ID'] || 'gpp-g3-database'
  }
};

// Backward compatibility - export function that returns the config
export const getConfig = (): ServiceConfig => config; 