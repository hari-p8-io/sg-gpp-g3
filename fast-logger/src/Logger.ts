/**
 * LogData interface for structured logging data
 */
export interface LogData {
  [key: string]: any;
}

/**
 * Log level enum for type safety
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  serviceName?: string;
  logLevel?: LogLevel;
  enableConsoleOutput?: boolean;
  enableTimestamp?: boolean;
  enableCorrelationId?: boolean;
  timezone?: string;
}

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp?: string;
  level: LogLevel;
  service: string;
  message: string;
  correlationId?: string;
  [key: string]: any;
}

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

  /**
   * Parse log level from string
   */
  private parseLogLevel(level?: string): LogLevel | undefined {
    if (!level) return undefined;
    
    const normalizedLevel = level.toLowerCase();
    return Object.values(LogLevel).find(l => l === normalizedLevel);
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    
    return targetLevelIndex >= currentLevelIndex;
  }

  /**
   * Format log message with structured data
   */
  private formatMessage(level: LogLevel, message: string, data?: LogData): string {
    const timestamp = this.enableTimestamp ? new Date().toISOString() : undefined;
    
    const logEntry: LogEntry = {
      ...(timestamp && { timestamp }),
      level,
      service: this.serviceName,
      message,
      ...(this.enableCorrelationId && this.currentCorrelationId && { 
        correlationId: this.currentCorrelationId 
      }),
      ...data
    };

    return JSON.stringify(logEntry);
  }

  /**
   * Output log message to console
   */
  private output(level: LogLevel, formattedMessage: string): void {
    if (!this.enableConsoleOutput) return;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  /**
   * Set correlation ID for request tracing
   */
  setCorrelationId(correlationId: string | undefined): void {
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
   * Log debug message
   */
  debug(message: string, data?: LogData): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formattedMessage = this.formatMessage(LogLevel.DEBUG, message, data);
      this.output(LogLevel.DEBUG, formattedMessage);
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: LogData): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formattedMessage = this.formatMessage(LogLevel.INFO, message, data);
      this.output(LogLevel.INFO, formattedMessage);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: LogData): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formattedMessage = this.formatMessage(LogLevel.WARN, message, data);
      this.output(LogLevel.WARN, formattedMessage);
    }
  }

  /**
   * Log error message
   */
  error(message: string, data?: LogData): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formattedMessage = this.formatMessage(LogLevel.ERROR, message, data);
      this.output(LogLevel.ERROR, formattedMessage);
    }
  }

  /**
   * Log error with Error object
   */
  errorWithException(message: string, error: Error, data?: LogData): void {
    const errorData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      ...data
    };
    
    this.error(message, errorData);
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogData): Logger {
    const childLogger = new Logger({
      serviceName: this.serviceName,
      logLevel: this.logLevel,
      enableConsoleOutput: this.enableConsoleOutput,
      enableTimestamp: this.enableTimestamp,
      enableCorrelationId: this.enableCorrelationId,
      timezone: this.timezone
    });

    // Override formatMessage to include additional context
    const originalFormatMessage = childLogger.formatMessage.bind(childLogger);
    childLogger.formatMessage = (level: LogLevel, message: string, data?: LogData) => {
      return originalFormatMessage(level, message, { ...additionalContext, ...data });
    };

    return childLogger;
  }

  /**
   * Get logger configuration
   */
  getConfig(): LoggerConfig {
    return {
      serviceName: this.serviceName,
      logLevel: this.logLevel,
      enableConsoleOutput: this.enableConsoleOutput,
      enableTimestamp: this.enableTimestamp,
      enableCorrelationId: this.enableCorrelationId,
      timezone: this.timezone
    };
  }
} 