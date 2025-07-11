import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../utils/logger';
import { EnrichmentHandler } from './handlers/enrichmentHandler';
import { config } from '../config/default';

export class EnrichmentGrpcServer {
  private server: grpc.Server;
  private enrichmentHandler: EnrichmentHandler;

  // Private constructor to force use of factory method
  private constructor(enrichmentHandler: EnrichmentHandler) {
    this.server = new grpc.Server();
    this.enrichmentHandler = enrichmentHandler;
    this.loadServices();
  }

  /**
   * Static async factory method to create and initialize EnrichmentGrpcServer
   * @returns Promise<EnrichmentGrpcServer> - Fully initialized server instance
   * @throws Error if initialization fails
   */
  static async create(): Promise<EnrichmentGrpcServer> {
    try {
      const enrichmentHandler = await EnrichmentHandler.create();
      return new EnrichmentGrpcServer(enrichmentHandler);
    } catch (error) {
      throw new Error(`Failed to initialize EnrichmentGrpcServer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadServices(): void {
    // Load enrichment service proto
    const enrichmentProtoPath = path.join(__dirname, '../../proto/gpp/g3/enrichment/enrichment_service.proto');
    console.log('EnrichmentGrpcServer: Trying to load proto from:', enrichmentProtoPath);
    console.log('EnrichmentGrpcServer: __dirname is:', __dirname);
    
    const enrichmentPackageDefinition = protoLoader.loadSync(enrichmentProtoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const enrichmentProto = grpc.loadPackageDefinition(enrichmentPackageDefinition) as any;

    // Add enrichment service
    const serviceImplementation = {
      EnrichMessage: this.enrichmentHandler.enrichMessage.bind(this.enrichmentHandler),
      HealthCheck: this.enrichmentHandler.healthCheck.bind(this.enrichmentHandler)
    };

    this.server.addService(
      enrichmentProto.gpp.g3.enrichment.EnrichmentService.service,
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