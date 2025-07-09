import winston from 'winston';
import { config } from '../config/default';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: config.serviceName,
    environment: config.environment
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Helper functions for structured logging
export const logAuthMethodRequest = (messageId: string, puid: string, acctId: string, acctSys: string) => {
  logger.info('Authentication method lookup request received', {
    messageId,
    puid,
    acctId,
    acctSys,
    timestamp: new Date().toISOString()
  });
};

export const logAuthMethodResponse = (messageId: string, authMethod: string, success: boolean, processingTime: number) => {
  logger.info('Authentication method lookup completed', {
    messageId,
    authMethod,
    success,
    processingTime,
    timestamp: new Date().toISOString()
  });
};

export const logError = (messageId: string, error: Error, context?: any) => {
  logger.error('Authentication method lookup error', {
    messageId,
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
}; 