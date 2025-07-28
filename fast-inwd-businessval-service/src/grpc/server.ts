import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../utils/logger';
import { BusinessValHandler } from './handlers/businessValHandler';
import { config } from '../config/default';

export class BusinessValGrpcServer {
  private server: grpc.Server;
  private businessValHandler: BusinessValHandler;

  // Private constructor to force use of factory method
  private constructor(businessValHandler: BusinessValHandler) {
    this.server = new grpc.Server();
    this.businessValHandler = businessValHandler;
    this.loadServices();
  }

  /**
   * Static async factory method to create and initialize BusinessValGrpcServer
   * @returns Promise<BusinessValGrpcServer> - Fully initialized server instance
   * @throws Error if initialization fails
   */
  static async create(): Promise<BusinessValGrpcServer> {
    try {
      const businessValHandler = await BusinessValHandler.create();
      return new BusinessValGrpcServer(businessValHandler);
    } catch (error) {
      throw new Error(`Failed to initialize BusinessValGrpcServer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadServices(): void {
    // Load business validation service proto
    const businessValProtoPath = path.join(__dirname, '../../proto/gpp/g3/businessval/businessval_service.proto');
    console.log('BusinessValGrpcServer: Trying to load proto from:', businessValProtoPath);
    console.log('BusinessValGrpcServer: __dirname is:', __dirname);
    
    const businessValPackageDefinition = protoLoader.loadSync(businessValProtoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const businessValProto = grpc.loadPackageDefinition(businessValPackageDefinition) as any;

    // Add business validation service
    const serviceImplementation = {
      ProcessMessage: this.businessValHandler.processMessage.bind(this.businessValHandler),
      HealthCheck: this.businessValHandler.healthCheck.bind(this.businessValHandler)
    };

    this.server.addService(
      businessValProto.gpp.g3.businessval.BusinessValService.service,
      serviceImplementation
    );
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `0.0.0.0:${config.grpcPort}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            logger.error('Failed to start business validation service:', error);
            reject(error);
            return;
          }

          logger.info(`🚀 fast-inwd-businessval-service (gRPC) is running on port ${port}`);
          logger.info(`📊 Health check available via gRPC HealthCheck method`);
          
          this.server.start();
          resolve();
        }
      );
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        logger.info('✅ Business validation service shutdown complete');
        resolve();
      });
    });
  }
} 