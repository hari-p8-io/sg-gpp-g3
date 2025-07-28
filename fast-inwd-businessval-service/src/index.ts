import { logger } from './utils/logger';
import { BusinessValGrpcServer } from './grpc/server';

async function main(): Promise<void> {
  let server: BusinessValGrpcServer;

  try {
    // Create and initialize server with all async dependencies
    server = await BusinessValGrpcServer.create();
    logger.info('✅ fast-inwd-businessval-service initialized successfully');
    
    // Start the server
    await server.start();
    logger.info('🚀 fast-inwd-businessval-service started successfully');
  } catch (error) {
    logger.error('❌ Failed to start fast-inwd-businessval-service', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }

  // Shutdown coordinator to prevent concurrent shutdown attempts
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.info(`🔄 Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    logger.info(`🔄 Received ${signal}, shutting down gracefully...`);

    try {
      if (server) {
        await server.stop();
        logger.info('✅ Server stopped successfully');
      } else {
        logger.info('✅ Server was not initialized, shutdown complete');
      }
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    }
  };

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    // Don't await here - let the async function handle itself
    gracefulShutdown('SIGTERM').catch((error) => {
      logger.error('❌ Error in SIGTERM handler', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    // Don't await here - let the async function handle itself
    gracefulShutdown('SIGINT').catch((error) => {
      logger.error('❌ Error in SIGINT handler', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    });
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