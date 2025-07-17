import { GrpcServer } from './grpc/server';
import { logger } from './utils/logger';
import { config } from './config/default';

class AccountLookupServiceApp {
  private grpcServer: GrpcServer;

  constructor() {
    this.grpcServer = new GrpcServer();
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting Fast Account Lookup Service', {
        serviceName: config.serviceName,
        version: '1.0.0',
        environment: config.environment,
        grpcPort: config.grpcPort,
        isStubbed: config.isStubbed,
        country: config.country,
        currency: config.defaultCurrency
      });

      // Start gRPC server
      await this.grpcServer.start();

      logger.info('Fast Account Lookup Service started successfully', {
        grpcPort: config.grpcPort,
        capabilities: [
          'account-lookup',
          'singapore-banking-data',
          'mock-data-generation',
          'error-simulation'
        ]
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Fast Account Lookup Service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping Fast Account Lookup Service...');
      
      await this.grpcServer.stop();
      
      logger.info('Fast Account Lookup Service stopped successfully');
    } catch (error) {
      logger.error('Error stopping Fast Account Lookup Service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Force shutdown if graceful shutdown fails
        this.grpcServer.forceShutdown();
        process.exit(1);
      }
    };

    // Handle process termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: String(promise)
      });
      process.exit(1);
    });
  }
}

// Start the application
const app = new AccountLookupServiceApp();
app.start().catch((error) => {
  logger.error('Failed to start application', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  process.exit(1);
}); 