export interface ServiceConfig {
  grpcPort: number;
  serviceName: string;
  logLevel: string;
  environment: string;
  country: string;
  defaultCurrency: string;
  authMethodTimeoutMs: number;
  maxRetryAttempts: number;
  retryBackoffMs: number;
  useMockData: boolean;
}

export const getConfig = (): ServiceConfig => {
  return {
    grpcPort: parseInt(process.env['GRPC_PORT'] || '50060', 10),
    serviceName: process.env['SERVICE_NAME'] || 'fast-referencedata-service',
    logLevel: process.env['LOG_LEVEL'] || 'info',
    environment: process.env['ENVIRONMENT'] || 'development',
    country: process.env['COUNTRY'] || 'SG',
    defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'SGD',
    authMethodTimeoutMs: parseInt(process.env['AUTH_METHOD_TIMEOUT_MS'] || '3000', 10),
    maxRetryAttempts: parseInt(process.env['MAX_RETRY_ATTEMPTS'] || '3', 10),
    retryBackoffMs: parseInt(process.env['RETRY_BACKOFF_MS'] || '1000', 10),
    useMockData: process.env['USE_MOCK_DATA'] === 'true' || process.env['ENVIRONMENT'] === 'test'
  };
};

export const config = getConfig(); 