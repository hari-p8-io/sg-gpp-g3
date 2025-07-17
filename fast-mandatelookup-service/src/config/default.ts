export interface ServiceConfig {
  port: number;
  host: string;
  serviceName: string;
  logLevel: string;
  environment: string;
  country: string;
  defaultCurrency: string;
  useMockMandates: boolean;
  mockResponseDelayMs: number;
  defaultMandateValidityDays: number;
  maxMandateAmount: number;
  supportedMandateTypes: string[];
  supportedFrequencies: string[];
  mandateRegulationVersion: string;
  complianceMode: string;
  api: {
    version: string;
    basePath: string;
    corsEnabled: boolean;
    requestTimeoutMs: number;
  };
  database: {
    connectionString: string;
    cacheTtlMinutes: number;
  };
}

export const config: ServiceConfig = {
  port: parseInt(process.env['PORT'] || '3005', 10),
  host: process.env['HOST'] || '0.0.0.0',
  serviceName: process.env['SERVICE_NAME'] || 'fast-mandatelookup-service',
  logLevel: process.env['LOG_LEVEL'] || 'info',
  environment: process.env['ENVIRONMENT'] || 'development',
  country: process.env['COUNTRY'] || 'SG',
  defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'SGD',
  useMockMandates: process.env['USE_MOCK_MANDATES'] === 'true',
  mockResponseDelayMs: parseInt(process.env['MOCK_RESPONSE_DELAY_MS'] || '100', 10),
  defaultMandateValidityDays: parseInt(process.env['DEFAULT_MANDATE_VALIDITY_DAYS'] || '365', 10),
  maxMandateAmount: parseFloat(process.env['MAX_MANDATE_AMOUNT'] || '10000.00'),
  supportedMandateTypes: (process.env['SUPPORTED_MANDATE_TYPES'] || 'CONSUMER_DDI,CORPORATE_DDI,BULK_DDI').split(','),
  supportedFrequencies: (process.env['SUPPORTED_FREQUENCIES'] || 'MONTHLY,QUARTERLY,ANNUALLY,ON_DEMAND').split(','),
  mandateRegulationVersion: process.env['MANDATE_REGULATION_VERSION'] || 'SGGIRO_V2.1',
  complianceMode: process.env['COMPLIANCE_MODE'] || 'SINGAPORE_BANKING',
  api: {
    version: process.env['API_VERSION'] || 'v1',
    basePath: process.env['BASE_PATH'] || '/api/v1',
    corsEnabled: process.env['CORS_ENABLED'] !== 'false',
    requestTimeoutMs: parseInt(process.env['REQUEST_TIMEOUT_MS'] || '30000', 10)
  },
  database: {
    connectionString: process.env['MANDATE_DB_CONNECTION_STRING'] || 'postgresql://localhost:5432/mandate_db',
    cacheTtlMinutes: parseInt(process.env['MANDATE_CACHE_TTL_MINUTES'] || '60', 10)
  }
};

// Backward compatibility - export function that returns the config
export const getConfig = (): ServiceConfig => config; 