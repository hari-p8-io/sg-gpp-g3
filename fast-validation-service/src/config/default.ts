export interface ValidationServiceConfig {
  grpcPort: number;
  serviceName: string;
  logLevel: string;
  environment: string;
  expectedCountry: string;
  expectedCurrency: string;
  useTestMode: boolean;
  kafka: {
    brokers: string[];
    clientId: string;
    topic: string;
    groupId: string;
  };
  validation: {
    timeoutMs: number;
    maxRetryAttempts: number;
    retryBackoffMs: number;
  };
  orchestratorService: {
    url: string;
    timeoutMs: number;
  };
}

export const getConfig = (): ValidationServiceConfig => {
  return {
    grpcPort: parseInt(process.env['GRPC_PORT'] || '50053', 10),
    serviceName: process.env['SERVICE_NAME'] || 'fast-validation-service',
    logLevel: process.env['LOG_LEVEL'] || 'info',
    environment: process.env['ENVIRONMENT'] || 'development',
    expectedCountry: process.env['COUNTRY'] || 'SG',
    expectedCurrency: process.env['DEFAULT_CURRENCY'] || 'SGD',
    useTestMode: process.env['USE_TEST_MODE'] === 'true',
    kafka: {
      brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','),
      clientId: process.env['KAFKA_CLIENT_ID'] || 'fast-validation-service',
      topic: process.env['KAFKA_TOPIC'] || 'validated-messages',
      groupId: process.env['KAFKA_GROUP_ID'] || 'fast-validation-group'
    },
    validation: {
      timeoutMs: parseInt(process.env['VALIDATION_TIMEOUT_MS'] || '5000', 10),
      maxRetryAttempts: parseInt(process.env['MAX_RETRY_ATTEMPTS'] || '3', 10),
      retryBackoffMs: parseInt(process.env['RETRY_BACKOFF_MS'] || '1000', 10)
    },
    orchestratorService: {
      url: process.env['ORCHESTRATOR_SERVICE_URL'] || 'localhost:50054',
      timeoutMs: parseInt(process.env['ORCHESTRATOR_TIMEOUT_MS'] || '3000', 10)
    }
  };
};

export const config = getConfig(); 