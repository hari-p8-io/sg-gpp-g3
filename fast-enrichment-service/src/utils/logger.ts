interface LogData {
  [key: string]: any;
}

export class Logger {
  private serviceName: string;

  constructor(serviceName: string = 'fast-enrichment-service') {
    this.serviceName = serviceName;
  }

  private formatMessage(level: string, message: string, data?: LogData): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...data
    };
    return JSON.stringify(logEntry);
  }

  info(message: string, data?: LogData): void {
    console.log(this.formatMessage('info', message, data));
  }

  error(message: string, data?: LogData): void {
    console.error(this.formatMessage('error', message, data));
  }

  warn(message: string, data?: LogData): void {
    console.warn(this.formatMessage('warn', message, data));
  }

  debug(message: string, data?: LogData): void {
    if (process.env['LOG_LEVEL'] === 'debug') {
      console.debug(this.formatMessage('debug', message, data));
    }
  }
}

export const logger = new Logger(); 