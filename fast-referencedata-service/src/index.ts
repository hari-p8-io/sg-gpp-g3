import { config } from './config/default';
import { logger } from './utils/logger';
import { ReferenceDataGrpcServer } from './grpc/server';

async function startService() {
  try {
    logger.info('Starting fast-referencedata-service...', {
      serviceName: config.serviceName,
      grpcPort: config.grpcPort,
      environment: config.environment,
      country: config.country,
      defaultCurrency: config.defaultCurrency,
      useMockData: config.useMockData
    });

    // Initialize gRPC server
    const grpcServer = new ReferenceDataGrpcServer();
    
    // Start the server
    await grpcServer.start();
    
    logger.info('🚀 fast-referencedata-service started successfully', {
      grpcPort: config.grpcPort,
      grpcEndpoint: `localhost:${config.grpcPort}`,
      healthCheck: 'gRPC HealthCheck method available',
      lookupMethod: 'gRPC LookupAuthMethod method available'
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await grpcServer.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await grpcServer.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start fast-referencedata-service', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Start the service
startService().catch((error) => {
  logger.error('Unhandled error during service startup', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
}); 