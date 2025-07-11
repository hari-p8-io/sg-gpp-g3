import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from './utils/logger';
import { ValidationHandler } from './grpc/validationHandler';
import { config } from './config/default';

async function main(): Promise<void> {
  const validationHandler = new ValidationHandler();

  // Load proto definition
  const protoPath = path.join(__dirname, '../proto/validation_service.proto');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const validationProto = grpc.loadPackageDefinition(packageDefinition) as any;

  // Create and configure gRPC server
  const server = new grpc.Server();

  // Add validation service
  server.addService(
    validationProto.gpp.g3.validation.ValidationService.service,
    {
      ValidateEnrichedMessage: validationHandler.validateEnrichedMessage.bind(validationHandler),
      HealthCheck: validationHandler.healthCheck.bind(validationHandler),
    }
  );

  // Start server
  try {
    await new Promise<void>((resolve, reject) => {
      server.bindAsync(
        `0.0.0.0:${config.grpcPort}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            logger.error('Failed to start validation service', { 
              error: error.message 
            });
            reject(error);
            return;
          }

          logger.info('🚀 fast-validation-service (gRPC) is running', {
            port,
            expectedCurrency: config.expectedCurrency,
            expectedCountry: config.expectedCountry,
            kafkaTopic: config.kafka.topic
          });
          
          server.start();
          resolve();
        }
      );
    });
  } catch (error) {
    logger.error('❌ Failed to start fast-validation-service', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('🔄 Received SIGTERM, shutting down gracefully...');
    await shutdown(server, validationHandler);
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('🔄 Received SIGINT, shutting down gracefully...');
    await shutdown(server, validationHandler);
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

async function shutdown(server: grpc.Server, handler: ValidationHandler): Promise<void> {
  return new Promise((resolve) => {
    handler.shutdown();
    server.tryShutdown(() => {
      logger.info('✅ Validation service shutdown complete');
      resolve();
    });
  });
}

main().catch((error) => {
  logger.error('❌ Fatal error in main', { 
    error: error instanceof Error ? error.message : 'Unknown error' 
  });
  process.exit(1);
}); 