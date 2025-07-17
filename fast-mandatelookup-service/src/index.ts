import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { config } from './config/default';
import { mandateRoutes } from './routes/mandateRoutes';
import { healthRoutes } from './routes/healthRoutes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

async function main(): Promise<void> {
  let server: any;

  try {
    // Create Express app
    const app = express();
    
    // Middleware
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
      app.use(requestLogger);
    }

    // Routes
    app.use('/api/v1', mandateRoutes);
    app.use('/api/v1', healthRoutes);

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        service: config.serviceName,
        version: '1.0.0',
        status: 'running',
        api: {
          baseUrl: `http://localhost:${config.port}/api/v1`,
          endpoints: [
            'POST /api/v1/mandates/lookup',
            'GET /api/v1/health',
            'GET /api/v1/info'
          ]
        }
      });
    });

    // Error handling
    app.use(errorHandler);

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${req.method} ${req.originalUrl} not found`
        },
        timestamp: new Date().toISOString()
      });
    });

    // Start server
    server = app.listen(config.port, config.host, () => {
      logger.info('✅ fast-mandatelookup-service started successfully', {
        port: config.port,
        host: config.host,
        environment: config.environment,
        mockMode: config.useMockMandates
      });
    });

  } catch (error) {
    logger.error('❌ Failed to start fast-mandatelookup-service', { 
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
        server.close(() => {
          logger.info('✅ HTTP server stopped successfully');
          process.exit(0);
        });

        // Force close after timeout
        setTimeout(() => {
          logger.warn('⚠️ Forced shutdown after timeout');
          process.exit(1);
        }, 10000);
      } else {
        logger.info('✅ Server was not initialized, shutdown complete');
        process.exit(0);
      }
    } catch (error) {
      logger.error('❌ Error during graceful shutdown', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    }
  };

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM').catch((error) => {
      logger.error('❌ Error in SIGTERM handler', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
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