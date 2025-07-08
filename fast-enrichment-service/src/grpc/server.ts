import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../utils/logger';
import { EnrichmentHandler } from './handlers/enrichmentHandler';
import { config } from '../config/default';

export class EnrichmentGrpcServer {
  private server: grpc.Server;
  private enrichmentHandler: EnrichmentHandler;

  constructor() {
    this.server = new grpc.Server();
    this.enrichmentHandler = new EnrichmentHandler();
    this.loadServices();
  }

  private loadServices(): void {
    // Load enrichment service proto
    const enrichmentProtoPath = path.join(__dirname, '../../proto/enrichment_service.proto');
    const enrichmentPackageDefinition = protoLoader.loadSync(enrichmentProtoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const enrichmentProto = grpc.loadPackageDefinition(enrichmentPackageDefinition) as any;

    // Add enrichment service
    this.server.addService(
      enrichmentProto.gpp.g3.enrichment.EnrichmentService.service,
      {
        EnrichPacsMessage: this.enrichmentHandler.enrichPacsMessage.bind(this.enrichmentHandler),
        HealthCheck: this.enrichmentHandler.healthCheck.bind(this.enrichmentHandler),
      }
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