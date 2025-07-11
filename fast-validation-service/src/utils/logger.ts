// Use shared logger package instead of local implementation
import { getLogger } from '@gpp/logger';

// Export the shared logger configured for this service
export const logger = getLogger('fast-validation-service');

// Re-export types for backward compatibility
export type { LogData } from '@gpp/logger';

// Re-export Logger class for backward compatibility
export { Logger } from '@gpp/logger'; 