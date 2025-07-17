import { Logger } from './Logger';
import { LogLevel, LoggerConfig } from './types';

/**
 * Factory for creating and managing Logger instances
 */
export class LoggerFactory {
  private static globalLogLevel: LogLevel | undefined;
  private static loggers: Map<string, Logger> = new Map();

  /**
   * Create a new logger instance
   */
  static createLogger(config: LoggerConfig): Logger {
    const finalConfig = {
      ...config,
      logLevel: config.logLevel || LoggerFactory.globalLogLevel || LogLevel.INFO
    };

    return new Logger(finalConfig);
  }

  /**
   * Create a logger with just a service name (convenience method)
   */
  static getLogger(serviceName: string): Logger {
    if (!LoggerFactory.loggers.has(serviceName)) {
      const logger = LoggerFactory.createLogger({ serviceName });
      LoggerFactory.loggers.set(serviceName, logger);
    }
    
    return LoggerFactory.loggers.get(serviceName)!;
  }

  /**
   * Set global log level for all new loggers
   */
  static setGlobalLogLevel(level: LogLevel): void {
    LoggerFactory.globalLogLevel = level;
    
    // Update existing loggers
    for (const logger of LoggerFactory.loggers.values()) {
      logger.setLogLevel(level);
    }
  }

  /**
   * Clear all cached loggers
   */
  static clearLoggers(): void {
    LoggerFactory.loggers.clear();
  }

  /**
   * Get all active loggers
   */
  static getActiveLoggers(): Logger[] {
    return Array.from(LoggerFactory.loggers.values());
  }
}

// Export convenience functions
export const createLogger = LoggerFactory.createLogger;
export const getLogger = LoggerFactory.getLogger;
export const setGlobalLogLevel = LoggerFactory.setGlobalLogLevel; 