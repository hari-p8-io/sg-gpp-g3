import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { config } from 'dotenv';
import path from 'path';
import { PacsHandler } from './grpc/handlers/pacsHandler';
import { SpannerClient } from './database/spanner';
import defaultConfig from './config/default';

// Load environment variables
config();

// Load proto definition
const PROTO_PATH = path.join(__dirname, '../proto/pacs_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const pacsProto = grpc.loadPackageDefinition(packageDefinition) as any;

async function startServer() {
  // Initialize database connection
  const spannerClient = new SpannerClient(defaultConfig.spanner);
  try {
    await spannerClient.initialize();
  } catch (error) {
    console.warn('⚠️  Database initialization failed, continuing without database:', error);
  }

  // Initialize handlers
  const pacsHandler = new PacsHandler(spannerClient);

  // Create gRPC server
  const server = new grpc.Server();

  // Add services
  server.addService(pacsProto.gpp.g3.requesthandler.PacsHandler.service, {
    ProcessPacsMessage: pacsHandler.processPacsMessage.bind(pacsHandler),
    GetMessageStatus: pacsHandler.getMessageStatus.bind(pacsHandler),
    HealthCheck: pacsHandler.healthCheck.bind(pacsHandler),
    GetAllMessages: pacsHandler.getAllMessages.bind(pacsHandler),
    ClearMockStorage: pacsHandler.clearMockStorage.bind(pacsHandler),
    GetMockStorageSize: pacsHandler.getMockStorageSize.bind(pacsHandler),
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
      console.log(`📊 PACS Handler: grpc://localhost:${port}/ProcessPacsMessage`);
      console.log(`🔍 Message Status: grpc://localhost:${port}/GetMessageStatus`);
      console.log(`🌏 Singapore market ready - SGD currency, SG country codes`);
      
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