import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../../utils/logger';
import { config } from '../../config/default';

export interface AuthMethodRequest {
  messageId: string;
  puid: string;
  acctSys: string;
  acctGrp: string;
  acctId: string;
  country: string;
  currencyCode: string;
  metadata: { [key: string]: string };
  timestamp: number;
}

export interface AuthMethodResponse {
  messageId: string;
  puid: string;
  success: boolean;
  authMethod?: string;
  errorMessage?: string;
  errorCode?: string;
  refDataDetails?: any;
  processedAt: number;
  lookupSource: string;
}

export class ReferenceDataClient {
  private client: any;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const protoPath = path.join(__dirname, '../../../proto/referencedata_client.proto');
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const proto = grpc.loadPackageDefinition(packageDefinition) as any;
      const referenceDataServiceUrl = process.env['REFERENCE_DATA_SERVICE_URL'] || 'localhost:50060';
      
      this.client = new proto.gpp.g3.referencedata.ReferenceDataService(
        referenceDataServiceUrl,
        grpc.credentials.createInsecure()
      );

      logger.info('Reference data client initialized', {
        serviceUrl: referenceDataServiceUrl,
        protoPath
      });

      this.isConnected = true;

    } catch (error) {
      logger.error('Failed to initialize reference data client', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.isConnected = false;
    }
  }

  async lookupAuthMethod(request: AuthMethodRequest): Promise<AuthMethodResponse> {
    if (!this.isConnected) {
      throw new Error('Reference data client not connected');
    }

    const grpcRequest = {
      message_id: request.messageId,
      puid: request.puid,
      acct_sys: request.acctSys,
      acct_grp: request.acctGrp,
      acct_id: request.acctId,
      country: request.country,
      currency_code: request.currencyCode,
      metadata: request.metadata,
      timestamp: request.timestamp
    };

    return new Promise((resolve, reject) => {
      const deadline = Date.now() + config.authMethodTimeoutMs;
      
      this.client.LookupAuthMethod(grpcRequest, { deadline }, (error: any, response: any) => {
        if (error) {
          logger.error('Reference data lookup failed', {
            messageId: request.messageId,
            error: error.message,
            code: error.code
          });
          reject(error);
          return;
        }

        const authMethodResponse: AuthMethodResponse = {
          messageId: response.message_id,
          puid: response.puid,
          success: response.success,
          authMethod: response.auth_method,
          errorMessage: response.error_message,
          errorCode: response.error_code,
          refDataDetails: response.ref_data_details,
          processedAt: response.processed_at,
          lookupSource: response.lookup_source
        };

        logger.info('Reference data lookup completed', {
          messageId: request.messageId,
          authMethod: response.auth_method,
          success: response.success,
          lookupSource: response.lookup_source
        });

        resolve(authMethodResponse);
      });
    });
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    return new Promise((resolve) => {
      const request = { service: 'fast-referencedata-service' };
      const deadline = Date.now() + 5000; // 5 second timeout

      this.client.HealthCheck(request, { deadline }, (error: any, response: any) => {
        if (error) {
          logger.warn('Reference data service health check failed', {
            error: error.message
          });
          resolve(false);
          return;
        }

        const isHealthy = response.status === 'SERVING';
        logger.debug('Reference data service health check', {
          status: response.status,
          healthy: isHealthy
        });

        resolve(isHealthy);
      });
    });
  }

  // Create a mock response when reference data service is not available
  createMockAuthMethodResponse(request: AuthMethodRequest): AuthMethodResponse {
    // Simple mock logic - in production this would be more sophisticated
    let authMethod = 'AFPONLY'; // default
    
    if (request.acctId.startsWith('999') || request.acctId.includes('VAM')) {
      authMethod = 'GROUPLIMIT';
    } else if (request.acctId.startsWith('888') || request.acctId.includes('CORP')) {
      authMethod = 'AFPTHENLIMIT';
    }

    return {
      messageId: request.messageId,
      puid: request.puid,
      success: true,
      authMethod,
      processedAt: Date.now(),
      lookupSource: 'MOCK'
    };
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }
} 