import { ServiceConfig } from '../types/accountLookup';

export const getConfig = (): ServiceConfig => {
  return {
    grpcPort: parseInt(process.env['GRPC_PORT'] || '50059', 10),
    serviceName: process.env['SERVICE_NAME'] || 'fast-accountlookup-service',
    logLevel: process.env['LOG_LEVEL'] || 'info',
    environment: process.env['ENVIRONMENT'] || 'development',
    isStubbed: process.env['IS_STUBBED'] === 'true' || true,
    country: process.env['COUNTRY'] || 'SG',
    defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'SGD',
    timezone: process.env['TIMEZONE'] || 'Asia/Singapore',
    defaultBankCode: process.env['DEFAULT_BANK_CODE'] || 'ANZBSG3MXXX',
    mockSuccessRate: parseFloat(process.env['MOCK_SUCCESS_RATE'] || '0.95'),
    mockResponseDelayMs: parseInt(process.env['MOCK_RESPONSE_DELAY_MS'] || '100', 10),
    enableErrorScenarios: process.env['ENABLE_ERROR_SCENARIOS'] === 'true' || true,
    defaultAccountType: process.env['DEFAULT_ACCOUNT_TYPE'] || 'Physical',
    lookupTimeoutMs: parseInt(process.env['LOOKUP_TIMEOUT_MS'] || '3000', 10),
    maxRetryAttempts: parseInt(process.env['MAX_RETRY_ATTEMPTS'] || '2', 10),
    rateLimitRequestsPerMinute: parseInt(process.env['RATE_LIMIT_REQUESTS_PER_MINUTE'] || '1000', 10)
  };
};

export const config = getConfig(); 