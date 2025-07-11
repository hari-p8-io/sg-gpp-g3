# @gpp/logger

A shared logging utility for GPP G3 microservices, providing structured logging with correlation IDs, service identification, and configurable output.

## Features

- **Structured Logging**: JSON-formatted log entries with consistent schema
- **Correlation IDs**: Request tracing support for distributed systems
- **Service Identification**: Automatic service name inclusion in logs
- **Configurable Log Levels**: Debug, Info, Warn, Error with level filtering
- **Enhanced Error Handling**: Built-in error object logging with stack traces
- **Child Loggers**: Create contextual loggers with additional metadata
- **Environment Configuration**: Automatic configuration via environment variables
- **TypeScript Support**: Full TypeScript definitions included

## Installation

```bash
npm install @gpp/logger
```

## Quick Start

### Basic Usage

```typescript
import { logger } from '@gpp/logger';

// Simple logging
logger.info('Service started');
logger.error('Something went wrong', { userId: '123', action: 'login' });

// With correlation ID for request tracing
logger.setCorrelationId('req-123-456');
logger.info('Processing request', { endpoint: '/api/users' });
```

### Custom Logger

```typescript
import { Logger, LogLevel } from '@gpp/logger';

const customLogger = new Logger({
  serviceName: 'fast-enrichment-service',
  logLevel: LogLevel.DEBUG,
  enableCorrelationId: true
});

customLogger.debug('Debug information', { module: 'enrichment' });
```

### Factory Functions

```typescript
import { createLogger, getLogger } from '@gpp/logger';

// Create with configuration
const logger1 = createLogger({ serviceName: 'my-service' });

// Create with just service name
const logger2 = getLogger('my-service');
```

## Configuration

### Environment Variables

The logger automatically reads configuration from environment variables:

```bash
# Service identification
SERVICE_NAME=fast-enrichment-service

# Log level control
LOG_LEVEL=debug  # debug, info, warn, error

# Timezone for timestamps
TZ=Asia/Singapore
```

### Programmatic Configuration

```typescript
import { Logger, LogLevel } from '@gpp/logger';

const logger = new Logger({
  serviceName: 'my-service',
  logLevel: LogLevel.INFO,
  enableConsoleOutput: true,
  enableTimestamp: true,
  enableCorrelationId: true,
  timezone: 'Asia/Singapore'
});
```

## API Reference

### Logger Class

#### Methods

- `debug(message: string, data?: LogData)`: Log debug message
- `info(message: string, data?: LogData)`: Log info message
- `warn(message: string, data?: LogData)`: Log warning message
- `error(message: string, data?: LogData)`: Log error message
- `errorWithException(message: string, error: Error, data?: LogData)`: Log error with exception details

#### Correlation ID Management

- `setCorrelationId(correlationId: string)`: Set correlation ID for request tracing
- `clearCorrelationId()`: Clear current correlation ID
- `getCorrelationId()`: Get current correlation ID

#### Child Loggers

- `child(additionalContext: LogData)`: Create child logger with additional context

### Types

```typescript
interface LogData {
  [key: string]: any;
}

interface LoggerConfig {
  serviceName?: string;
  logLevel?: LogLevel;
  enableConsoleOutput?: boolean;
  enableTimestamp?: boolean;
  enableCorrelationId?: boolean;
  timezone?: string;
}

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}
```

## Usage Examples

### Basic Service Logging

```typescript
import { getLogger } from '@gpp/logger';

const logger = getLogger('fast-enrichment-service');

// Service startup
logger.info('Service starting', { port: 50052 });

// Request processing
logger.setCorrelationId('req-abc-123');
logger.info('Processing enrichment request', { 
  messageId: 'msg-456', 
  accountId: 'acc-789' 
});

// Error handling
try {
  // Some operation
} catch (error) {
  logger.errorWithException('Enrichment failed', error, { 
    messageId: 'msg-456' 
  });
}
```

### Child Logger with Context

```typescript
import { getLogger } from '@gpp/logger';

const logger = getLogger('fast-enrichment-service');

// Create child logger with request context
const requestLogger = logger.child({ 
  requestId: 'req-123',
  userId: 'user-456' 
});

// All logs from child logger will include the context
requestLogger.info('Starting account lookup');
requestLogger.error('Lookup failed', { accountId: 'acc-789' });
```

### Log Level Filtering

```typescript
import { Logger, LogLevel } from '@gpp/logger';

// Only log WARN and ERROR messages
const logger = new Logger({
  serviceName: 'production-service',
  logLevel: LogLevel.WARN
});

logger.debug('This will not appear');
logger.info('This will not appear');
logger.warn('This will appear');
logger.error('This will appear');
```

## Log Format

The logger outputs structured JSON logs with the following format:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "service": "fast-enrichment-service",
  "message": "Processing enrichment request",
  "correlationId": "req-abc-123",
  "messageId": "msg-456",
  "accountId": "acc-789"
}
```

## Migration from Local Logger

If you're migrating from a local logger implementation:

### Before (Local Logger)

```typescript
import { logger } from './utils/logger';

logger.info('Service started');
logger.error('Error occurred', { userId: '123' });
```

### After (Shared Logger)

```typescript
import { getLogger } from '@gpp/logger';

const logger = getLogger('your-service-name');

logger.info('Service started');
logger.error('Error occurred', { userId: '123' });
```

## Best Practices

### 1. Use Service-Specific Loggers

```typescript
// Good: Create service-specific logger
const logger = getLogger('fast-enrichment-service');

// Better: Use environment variable
const logger = getLogger(process.env.SERVICE_NAME || 'unknown-service');
```

### 2. Include Context Data

```typescript
// Good: Include relevant context
logger.info('User authenticated', { userId: '123', method: 'oauth' });

// Better: Use structured data
logger.info('User authenticated', { 
  user: { id: '123', email: 'user@example.com' },
  auth: { method: 'oauth', provider: 'google' }
});
```

### 3. Use Correlation IDs

```typescript
// Set correlation ID at request start
logger.setCorrelationId(req.headers['x-correlation-id'] || generateId());

// All subsequent logs will include the correlation ID
logger.info('Processing request');
logger.info('Calling external service');

// Clear at request end
logger.clearCorrelationId();
```

### 4. Handle Errors Properly

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Use errorWithException for proper error logging
  logger.errorWithException('Operation failed', error, { 
    operation: 'user-lookup',
    userId: '123' 
  });
}
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## License

MIT

## Contributing

This package is part of the GPP G3 platform. For contribution guidelines, see the main project documentation. 