import { logger } from './utils/logger';
import { EnrichmentGrpcServer } from './grpc/server';

async function main(): Promise<void> {
  const server = new EnrichmentGrpcServer();

  try {
    await server.start();
    logger.info('🚀 fast-enrichment-service started successfully');
  } catch (error) {
    logger.error('❌ Failed to start fast-enrichment-service', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('🔄 Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('🔄 Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection', { 
      reason: reason instanceof Error ? reason.message : String(reason),
      promise: String(promise)
    });
    process.exit(1);
  });
}

main().catch((error) => {
  logger.error('❌ Fatal error in main', { 
    error: error instanceof Error ? error.message : 'Unknown error' 
  });
  process.exit(1);
}); 