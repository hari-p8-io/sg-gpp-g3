import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { config } from 'dotenv';
import path from 'path';
import { MessageHandler } from './grpc/handlers/messageHandler';
import { SpannerClient } from './database/spanner';
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

async function startServer() {
  // Initialize database connection
  const spannerClient = new SpannerClient(defaultConfig.spanner);
  try {
    await spannerClient.initialize();
  } catch (error) {
    console.warn('⚠️  Database initialization failed, continuing without database:', error);
  }

  // Initialize handlers
  const messageHandler = new MessageHandler(spannerClient);

  // Create gRPC server
  const server = new grpc.Server();

  // Add services
  server.addService(messageProto.gpp.g3.requesthandler.MessageHandler.service, {
    ProcessMessage: messageHandler.processMessage.bind(messageHandler),
    GetMessageStatus: messageHandler.getMessageStatus.bind(messageHandler),
    HealthCheck: messageHandler.healthCheck.bind(messageHandler),
    GetAllMessages: messageHandler.getAllMessages.bind(messageHandler),
    ClearMockStorage: messageHandler.clearMockStorage.bind(messageHandler),
    GetMockStorageSize: messageHandler.getMockStorageSize.bind(messageHandler),
  });

  // Start server
  const port = defaultConfig.grpc.port;
  server.bindAsync(
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
      
      server.start();
    }
  );

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    server.tryShutdown((error) => {
      if (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    server.tryShutdown((error) => {
      if (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
  });
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

export default startServer; 