import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { config } from 'dotenv';
import path from 'path';
import { MessageHandler } from './grpc/handlers/messageHandler';
import { SpannerClient } from './database/spanner';
import { ResponseHandler } from './kafka/responseHandler';
import defaultConfig from './config/default';

// Load environment variables
config();

// Load proto definition
const PROTO_PATH = path.join(__dirname, '../proto/message_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const messageProto = grpc.loadPackageDefinition(packageDefinition) as any;

// Global variables for graceful shutdown
let responseHandler: ResponseHandler | null = null;
let grpcServer: grpc.Server | null = null;

async function startServer() {
  // Initialize database connection
  const spannerClient = new SpannerClient(defaultConfig.spanner);
  try {
    await spannerClient.initialize();
    console.log('✅ Database connection established');
  } catch (error) {
    console.warn('⚠️  Database initialization failed, continuing without database:', error);
  }

  // Initialize Kafka response handler
  const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  const completionTopic = process.env.COMPLETION_KAFKA_TOPIC || 'accounting-completion-messages';
  const responseTopic = process.env.RESPONSE_KAFKA_TOPIC || 'pacs-response-messages';
  
  responseHandler = new ResponseHandler(
    spannerClient,
    kafkaBrokers,
    'fast-requesthandler-response-group',
    completionTopic,
    responseTopic
  );

  try {
    await responseHandler.initialize();
    await responseHandler.start();
    console.log('✅ Kafka response handler initialized and started');
  } catch (error) {
    console.warn('⚠️  Kafka response handler initialization failed, continuing without Kafka:', error);
    responseHandler = null;
  }

  // Initialize handlers
  const messageHandler = new MessageHandler(spannerClient);

  // Create gRPC server
  grpcServer = new grpc.Server();

  // Add services
  grpcServer.addService(messageProto.gpp.g3.requesthandler.MessageHandler.service, {
    ProcessMessage: messageHandler.processMessage.bind(messageHandler),
    GetMessageStatus: messageHandler.getMessageStatus.bind(messageHandler),
    HealthCheck: messageHandler.healthCheck.bind(messageHandler),
    GetAllMessages: messageHandler.getAllMessages.bind(messageHandler),
    ClearMockStorage: messageHandler.clearMockStorage.bind(messageHandler),
    GetMockStorageSize: messageHandler.getMockStorageSize.bind(messageHandler),
  });

  // Start server
  const port = defaultConfig.grpc.port;
  grpcServer.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error('🚨 Failed to start gRPC server:', error);
        process.exit(1);
      }
      
      console.log(`🚀 fast-requesthandler-service gRPC server started on port ${port}`);
      console.log(`🏥 Health check: grpc://localhost:${port}/HealthCheck`);
      console.log(`📊 Message Handler: grpc://localhost:${port}/ProcessMessage`);
      console.log(`🔍 Message Status: grpc://localhost:${port}/GetMessageStatus`);
      console.log(`🌍 Multi-market ready - Supports PACS, CAMT messages for various markets`);
      
      if (responseHandler) {
        console.log(`📤 PACS.002 response generation: Active`);
        console.log(`📥 Completion topic: ${completionTopic}`);
        console.log(`📤 Response topic: ${responseTopic}`);
      }
      
      grpcServer!.start();
    }
  );

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    await performGracefulShutdown();
  });

  process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    await performGracefulShutdown();
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    performGracefulShutdown().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
    performGracefulShutdown().then(() => process.exit(1));
  });
}

async function performGracefulShutdown() {
  const shutdownPromises: Promise<void>[] = [];

  // Stop Kafka response handler
  if (responseHandler) {
    console.log('🔄 Stopping Kafka response handler...');
    shutdownPromises.push(
      responseHandler.stop().then(() => {
        console.log('✅ Kafka response handler stopped');
      }).catch(error => {
        console.error('❌ Error stopping Kafka response handler:', error);
      })
    );
  }

  // Stop gRPC server
  if (grpcServer) {
    console.log('🔄 Stopping gRPC server...');
    shutdownPromises.push(
      new Promise<void>((resolve) => {
        grpcServer!.tryShutdown((error) => {
          if (error) {
            console.error('❌ Error during gRPC server shutdown:', error);
          } else {
            console.log('✅ gRPC server stopped');
          }
          resolve();
        });
      })
    );
  }

  // Wait for all shutdown operations to complete
  await Promise.all(shutdownPromises);
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

export default startServer; 