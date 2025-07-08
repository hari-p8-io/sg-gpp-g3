export interface ServiceConfig {
  grpcPort: number;
  serviceName: string;
  logLevel: string;
  environment: string;
  country: string;
  defaultCurrency: string;
  accountLookupServiceUrl: string;
  validationServiceUrl: string;
  enrichmentTimeoutMs: number;
  accountLookupTimeoutMs: number;
  maxRetryAttempts: number;
  retryBackoffMs: number;
  useMockAccountLookup: boolean;
}

export const getConfig = (): ServiceConfig => {
  return {
    grpcPort: parseInt(process.env['GRPC_PORT'] || '50052', 10),
    serviceName: process.env['SERVICE_NAME'] || 'fast-enrichment-service',
    logLevel: process.env['LOG_LEVEL'] || 'info',
    environment: process.env['ENVIRONMENT'] || 'development',
    country: process.env['COUNTRY'] || 'SG',
    defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'SGD',
    accountLookupServiceUrl: process.env['ACCOUNT_LOOKUP_SERVICE_URL'] || 'localhost:50059',
    validationServiceUrl: process.env['VALIDATION_SERVICE_URL'] || 'localhost:50053',
    enrichmentTimeoutMs: parseInt(process.env['ENRICHMENT_TIMEOUT_MS'] || '5000', 10),
    accountLookupTimeoutMs: parseInt(process.env['ACCOUNT_LOOKUP_TIMEOUT_MS'] || '3000', 10),
    maxRetryAttempts: parseInt(process.env['MAX_RETRY_ATTEMPTS'] || '3', 10),
    retryBackoffMs: parseInt(process.env['RETRY_BACKOFF_MS'] || '1000', 10),
    useMockAccountLookup: process.env['USE_MOCK_ACCOUNT_LOOKUP'] === 'true'
  };
};

export const config = getConfig(); 