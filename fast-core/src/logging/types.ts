export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogData {
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  data?: LogData;
  correlationId?: string;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerConfig {
  serviceName?: string;
  logLevel?: LogLevel;
  enableConsoleOutput?: boolean;
  enableTimestamp?: boolean;
  enableCorrelationId?: boolean;
  timezone?: string;
} 