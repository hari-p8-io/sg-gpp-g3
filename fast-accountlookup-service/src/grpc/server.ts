import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { AccountLookupHandler } from './handlers/accountLookupHandler';
import { logger } from '../utils/logger';
import { config } from '../config/default';

export class GrpcServer {
  private server: grpc.Server;
  private accountLookupHandler: AccountLookupHandler;

  constructor() {
    this.server = new grpc.Server();
    this.accountLookupHandler = new AccountLookupHandler();
  }

  async start(): Promise<void> {
    try {
      // Load proto file
      const PROTO_PATH = path.join(__dirname, '../../proto/accountlookup_service.proto');
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const accountLookupService = (protoDescriptor['gpp'] as any).g3.accountlookup.AccountLookupService;

      // Add service to server
      this.server.addService(accountLookupService.service, {
        LookupAccount: this.accountLookupHandler.lookupAccount,
        HealthCheck: this.accountLookupHandler.healthCheck,
        GetServiceInfo: this.accountLookupHandler.getServiceInfo
      });

      // Start server
      const serverCredentials = grpc.ServerCredentials.createInsecure();
      const bindAddress = `0.0.0.0:${config.grpcPort}`;

      this.server.bindAsync(bindAddress, serverCredentials, (error, port) => {
        if (error) {
          logger.error('Failed to start gRPC server', { error: error.message });
          throw error;
        }

        logger.info('gRPC server started successfully', {
          port,
          bindAddress,
          serviceName: config.serviceName,
          environment: config.environment,
          isStubbed: config.isStubbed
        });

        this.server.start();
      });

    } catch (error) {
      logger.error('Failed to initialize gRPC server', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.tryShutdown((error) => {
        if (error) {
          logger.error('Error stopping gRPC server', { error: error.message });
          reject(error);
        } else {
          logger.info('gRPC server stopped successfully');
          resolve();
        }
      });
    });
  }

  forceShutdown(): void {
    this.server.forceShutdown();
    logger.warn('gRPC server force shutdown completed');
  }
} 