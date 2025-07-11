import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../utils/logger';
import { ReferenceDataHandler } from './handlers/referenceDataHandler';
import { config } from '../config/default';

export class ReferenceDataGrpcServer {
  private server: grpc.Server;
  private referenceDataHandler: ReferenceDataHandler;

  constructor() {
    this.server = new grpc.Server();
    this.referenceDataHandler = new ReferenceDataHandler();
    this.loadServices();
  }

  private loadServices(): void {
    // Load reference data service proto
    const referenceDataProtoPath = path.join(__dirname, '../../proto/referencedata_service.proto');
    const referenceDataPackageDefinition = protoLoader.loadSync(referenceDataProtoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const referenceDataProto = grpc.loadPackageDefinition(referenceDataPackageDefinition) as any;

    // Add reference data service
    this.server.addService(
      referenceDataProto.gpp.g3.referencedata.ReferenceDataService.service,
      {
        LookupAuthMethod: this.referenceDataHandler.lookupAuthMethod.bind(this.referenceDataHandler),
        HealthCheck: this.referenceDataHandler.healthCheck.bind(this.referenceDataHandler),
      }
    );

    logger.info('gRPC services loaded successfully', {
      service: 'ReferenceDataService',
      protoPath: referenceDataProtoPath
    });
  }

  public async start(): Promise<void> {
    const bindAddress = `0.0.0.0:${config.grpcPort}`;
    
    return new Promise((resolve, reject) => {
      this.server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (error, port) => {
        if (error) {
          logger.error('Failed to bind gRPC server', {
            error: error.message,
            bindAddress,
            port: config.grpcPort
          });
          reject(error);
          return;
        }

        this.server.start();
        
        logger.info('gRPC server started successfully', {
          serviceName: config.serviceName,
          port: port,
          bindAddress,
          environment: config.environment
        });
        
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown((error) => {
        if (error) {
          logger.error('Error during gRPC server shutdown', {
            error: error.message
          });
        } else {
          logger.info('gRPC server stopped successfully');
        }
        resolve();
      });
    });
  }

  public getServer(): grpc.Server {
    return this.server;
  }
} 