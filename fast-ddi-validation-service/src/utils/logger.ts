// Use fast-core shared logger instead of separate logger package
import { getLogger, Logger, LogData } from '@gpp/fast-core';

// Export the shared logger configured for this service
export const logger = getLogger('fast-validation-service');

// Re-export types for backward compatibility
export type { LogData };

// Re-export Logger class for backward compatibility
export { Logger }; 