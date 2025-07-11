// Import components from Logger module
import { Logger, LogLevel, LogData, LoggerConfig, LogEntry } from './Logger';

// Export main Logger class and related types
export { Logger, LogLevel, LogData, LoggerConfig, LogEntry };

// Export factory function for creating logger instances
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

// Export default logger instance for quick usage
export const logger = new Logger();

// Export convenience functions
export function getLogger(serviceName: string): Logger {
  return new Logger({ serviceName });
}

export function getLoggerWithConfig(config: LoggerConfig): Logger {
  return new Logger(config);
} 