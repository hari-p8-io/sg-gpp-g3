import { config } from 'dotenv';
config();

export default {
  // Cloud Spanner Configuration
  spanner: {
    projectId: process.env.SPANNER_PROJECT_ID || 'gpp-g3-local',
    instanceId: process.env.SPANNER_INSTANCE_ID || 'test-instance',
    databaseId: process.env.SPANNER_DATABASE_ID || 'safe-str-db',
    emulatorHost: process.env.SPANNER_EMULATOR_HOST || 'localhost:9010'
  },

  // gRPC Configuration
  grpc: {
    port: parseInt(process.env.GRPC_PORT || '50051'),
    enrichmentServiceUrl: process.env.ENRICHMENT_SERVICE_URL || 'localhost:50052'
  },

  // Service Configuration
  service: {
    name: process.env.SERVICE_NAME || 'fast-requesthandler-service',
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // Market Configuration (defaults to Singapore)
  market: {
    code: process.env.MARKET_CODE || 'SG',
    country: process.env.COUNTRY || 'SG',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'SGD',
    timezone: process.env.TIMEZONE || 'Asia/Singapore'
  },

  // Processing Configuration
  processing: {
    maxXmlSize: parseInt(process.env.MAX_XML_SIZE || '10485760'), // 10MB
    validationTimeout: parseInt(process.env.VALIDATION_TIMEOUT || '30000'), // 30 seconds
    enrichmentTimeout: parseInt(process.env.ENRICHMENT_TIMEOUT || '60000') // 60 seconds
  },

  // Database Configuration
  database: {
    connectionPoolSize: parseInt(process.env.DB_CONNECTION_POOL_SIZE || '10'),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000')
  }
}; 