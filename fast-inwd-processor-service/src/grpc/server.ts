import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../utils/logger';
import { InwdProcessorHandler } from './handlers/inwdProcessorHandler';
import { config } from '../config/default';

export class InwdProcessorGrpcServer {
  private server: grpc.Server;
  private processorHandler: InwdProcessorHandler;

  // Private constructor to force use of factory method
  private constructor(processorHandler: InwdProcessorHandler) {
    this.server = new grpc.Server();
    this.processorHandler = processorHandler;
    this.loadServices();
  }

  /**
   * Static async factory method to create and initialize InwdProcessorGrpcServer
   * @returns Promise<InwdProcessorGrpcServer> - Fully initialized server instance
   * @throws Error if initialization fails
   */
  static async create(): Promise<InwdProcessorGrpcServer> {
    try {
      const processorHandler = await InwdProcessorHandler.create();
      return new InwdProcessorGrpcServer(processorHandler);
    } catch (error) {
      throw new Error(`Failed to initialize InwdProcessorGrpcServer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadServices(): void {
    // Load inward processor service proto
    const processorProtoPath = path.join(__dirname, '../../proto/gpp/g3/inwd-processor/inwd_processor_service.proto');
    console.log('InwdProcessorGrpcServer: Trying to load proto from:', processorProtoPath);
    console.log('InwdProcessorGrpcServer: __dirname is:', __dirname);
    
    const processorPackageDefinition = protoLoader.loadSync(processorProtoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const processorProto = grpc.loadPackageDefinition(processorPackageDefinition) as any;

    // Add inward processor service
    const serviceImplementation = {
      ProcessMessage: this.processorHandler.enrichMessage.bind(this.processorHandler),
      HealthCheck: this.processorHandler.healthCheck.bind(this.processorHandler)
    };

    this.server.addService(
      processorProto.gpp.g3.inwdprocessor.InwdProcessorService.service,
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
            logger.error('Failed to start enrichment service:', error);
            reject(error);
            return;
          }

          logger.info(`🚀 fast-enrichment-service (gRPC) is running on port ${port}`);
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
        logger.info('✅ Enrichment service shutdown complete');
        resolve();
      });
    });
  }
} 