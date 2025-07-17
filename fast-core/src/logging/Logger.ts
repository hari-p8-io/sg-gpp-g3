import moment from 'moment-timezone';
import { LogLevel, LogData, LogEntry, LoggerConfig } from './types';

/**
 * Enhanced Logger class for GPP G3 services
 * Provides structured logging with correlation IDs, service identification, and configurable output
 */
export class Logger {
  private serviceName: string;
  private logLevel: LogLevel;
  private enableConsoleOutput: boolean;
  private enableTimestamp: boolean;
  private enableCorrelationId: boolean;
  private timezone: string;
  private currentCorrelationId: string | undefined;

  constructor(config: LoggerConfig = {}) {
    this.serviceName = config.serviceName || process.env.SERVICE_NAME || 'gpp-service';
    this.logLevel = config.logLevel || this.parseLogLevel(process.env.LOG_LEVEL) || LogLevel.INFO;
    this.enableConsoleOutput = config.enableConsoleOutput ?? true;
    this.enableTimestamp = config.enableTimestamp ?? true;
    this.enableCorrelationId = config.enableCorrelationId ?? true;
    this.timezone = config.timezone || process.env.TZ || 'Asia/Singapore';
  }

  private parseLogLevel(level?: string): LogLevel | undefined {
    if (!level) return undefined;
    
    switch (level.toUpperCase()) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatLogEntry(level: LogLevel, message: string, data?: LogData, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: this.enableTimestamp ? moment().tz(this.timezone).toISOString() : new Date().toISOString(),
      level: LogLevel[level],
      service: this.serviceName,
      message
    };

    if (data) {
      entry.data = data;
    }

    if (this.enableCorrelationId && this.currentCorrelationId) {
      entry.correlationId = this.currentCorrelationId;
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (!this.enableConsoleOutput) return;

    const logString = JSON.stringify(entry, null, 2);
    
    switch (entry.level) {
      case 'ERROR':
        console.error(logString);
        break;
      case 'WARN':
        console.warn(logString);
        break;
      case 'DEBUG':
        console.debug(logString);
        break;
      default:
        console.log(logString);
    }
  }

  /**
   * Set correlation ID for request tracing
   */
  setCorrelationId(correlationId: string): void {
    this.currentCorrelationId = correlationId;
  }

  /**
   * Clear correlation ID
   */
  clearCorrelationId(): void {
    this.currentCorrelationId = undefined;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string | undefined {
    return this.currentCorrelationId;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalData: LogData): Logger {
    const childLogger = new Logger({
      serviceName: this.serviceName,
      logLevel: this.logLevel,
      enableConsoleOutput: this.enableConsoleOutput,
      enableTimestamp: this.enableTimestamp,
      enableCorrelationId: this.enableCorrelationId,
      timezone: this.timezone
    });

    childLogger.currentCorrelationId = this.currentCorrelationId;
    
    // Override output to include additional data
    const originalOutput = childLogger.output.bind(childLogger);
    childLogger.output = (entry: LogEntry) => {
      entry.data = { ...additionalData, ...entry.data };
      originalOutput(entry);
    };

    return childLogger;
  }

  /**
   * Debug level logging
   */
  debug(message: string, data?: LogData): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.formatLogEntry(LogLevel.DEBUG, message, data);
    this.output(entry);
  }

  /**
   * Info level logging
   */
  info(message: string, data?: LogData): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.formatLogEntry(LogLevel.INFO, message, data);
    this.output(entry);
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: LogData): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.formatLogEntry(LogLevel.WARN, message, data);
    this.output(entry);
  }

  /**
   * Error level logging
   */
  error(message: string, data?: LogData, error?: Error): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.formatLogEntry(LogLevel.ERROR, message, data, error);
    this.output(entry);
  }

  /**
   * Log an error object directly
   */
  logError(error: Error, additionalData?: LogData): void {
    this.error('Error occurred', additionalData, error);
  }

  /**
   * Update log level dynamically
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }
} 