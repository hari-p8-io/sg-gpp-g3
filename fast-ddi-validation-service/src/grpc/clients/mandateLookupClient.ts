import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../../utils/logger';

export interface MandateLookupRequest {
  messageId: string;
  puid: string;
  messageType: string;
  xmlPayload: string;
  debtorAccount: string;
  creditorAccount: string;
  mandateId?: string;
  amount: string;
  currency: string;
  metadata: { [key: string]: string };
}

export interface MandateLookupResponse {
  success: boolean;
  mandateReference: string;
  mandateStatus: {
    isValid: boolean;
    isActive: boolean;
    isExpired: boolean;
    statusCode: string;
    statusDescription: string;
  };
  mandateDetails?: {
    mandateId: string;
    debtorAccount: string;
    creditorAccount: string;
    creationDate: string;
    expiryDate: string;
    maxAmount: string;
    frequency: string;
    mandateType: string;
    authorizationInfo: {
      isAuthorized: boolean;
      authorizationMethod: string;
      authorizedBy: string;
      authorizationDate: string;
      restrictions: string[];
    };
  };
  validationErrors: string[];
  errorMessage: string;
  processedAt: number;
}

export class MandateLookupClient {
  private client: any;
  private serviceUrl: string;
  private timeout: number;
  private isConnected: boolean = false;

  constructor(serviceUrl: string = 'localhost:50061', timeout: number = 3000) {
    this.serviceUrl = serviceUrl;
    this.timeout = timeout;
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      // Load the protobuf definition
      const protoPath = path.join(__dirname, '../../../proto/gpp/g3/mandate-lookup/mandate_lookup_service.proto');
      
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const mandateProto = grpc.loadPackageDefinition(packageDefinition) as any;

      this.client = new mandateProto.gpp.g3.mandatelookup.MandateLookupService(
        this.serviceUrl,
        grpc.credentials.createInsecure()
      );

      this.isConnected = true;
      
      logger.info('MandateLookupClient initialized', {
        serviceUrl: this.serviceUrl,
        timeout: this.timeout
      });

    } catch (error) {
      logger.error('Failed to initialize MandateLookupClient', {
        serviceUrl: this.serviceUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async lookupMandate(request: MandateLookupRequest): Promise<MandateLookupResponse> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('MandateLookupClient is not connected'));
        return;
      }

      const grpcRequest = {
        message_id: request.messageId,
        puid: request.puid,
        message_type: request.messageType,
        xml_payload: request.xmlPayload,
        debtor_account: request.debtorAccount,
        creditor_account: request.creditorAccount,
        mandate_id: request.mandateId || '',
        amount: request.amount,
        currency: request.currency,
        metadata: request.metadata
      };

      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + this.timeout);

      logger.debug('Sending mandate lookup request', {
        messageId: request.messageId,
        puid: request.puid,
        debtorAccount: request.debtorAccount,
        mandateId: request.mandateId
      });

      this.client.LookupMandate(grpcRequest, { deadline }, (error: any, response: any) => {
        if (error) {
          logger.error('Mandate lookup failed', {
            messageId: request.messageId,
            error: error.message,
            code: error.code
          });

          // Return a failure response instead of rejecting
          resolve({
            success: false,
            mandateReference: '',
            mandateStatus: {
              isValid: false,
              isActive: false,
              isExpired: false,
              statusCode: 'SERVICE_ERROR',
              statusDescription: `Mandate lookup service error: ${error.message}`
            },
            validationErrors: ['MND999: TECHNICAL_ERROR', error.message],
            errorMessage: `Mandate lookup service unavailable: ${error.message}`,
            processedAt: Date.now()
          });
          return;
        }

        logger.debug('Mandate lookup response received', {
          messageId: request.messageId,
          success: response.success,
          mandateReference: response.mandate_reference,
          statusCode: response.mandate_status?.status_code
        });

        // Convert gRPC response to our interface
        const mandateLookupResponse: MandateLookupResponse = {
          success: response.success,
          mandateReference: response.mandate_reference || '',
          mandateStatus: {
            isValid: response.mandate_status?.is_valid || false,
            isActive: response.mandate_status?.is_active || false,
            isExpired: response.mandate_status?.is_expired || false,
            statusCode: response.mandate_status?.status_code || '',
            statusDescription: response.mandate_status?.status_description || ''
          },
          validationErrors: response.validation_errors || [],
          errorMessage: response.error_message || '',
          processedAt: response.processed_at || Date.now()
        };

        // Include mandate details if present
        if (response.mandate_details) {
          mandateLookupResponse.mandateDetails = {
            mandateId: response.mandate_details.mandate_id || '',
            debtorAccount: response.mandate_details.debtor_account || '',
            creditorAccount: response.mandate_details.creditor_account || '',
            creationDate: response.mandate_details.creation_date || '',
            expiryDate: response.mandate_details.expiry_date || '',
            maxAmount: response.mandate_details.max_amount || '',
            frequency: response.mandate_details.frequency || '',
            mandateType: response.mandate_details.mandate_type || '',
            authorizationInfo: {
              isAuthorized: response.mandate_details.authorization_info?.is_authorized || false,
              authorizationMethod: response.mandate_details.authorization_info?.authorization_method || '',
              authorizedBy: response.mandate_details.authorization_info?.authorized_by || '',
              authorizationDate: response.mandate_details.authorization_info?.authorization_date || '',
              restrictions: response.mandate_details.authorization_info?.restrictions || []
            }
          };
        }

        resolve(mandateLookupResponse);
      });
    });
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve({
          status: 'NOT_SERVING',
          message: 'MandateLookupClient is not connected'
        });
        return;
      }

      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + this.timeout);

      this.client.HealthCheck({ service: 'MandateLookupService' }, { deadline }, (error: any, response: any) => {
        if (error) {
          logger.error('Mandate lookup health check failed', {
            error: error.message,
            code: error.code
          });

          resolve({
            status: 'NOT_SERVING',
            message: `Mandate lookup service unhealthy: ${error.message}`
          });
          return;
        }

        const status = response.status === 1 ? 'SERVING' : 'NOT_SERVING';
        resolve({
          status,
          message: response.message || 'Health check completed'
        });
      });
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.isConnected = false;
      logger.info('MandateLookupClient disconnected');
    }
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  getServiceUrl(): string {
    return this.serviceUrl;
  }

  setTimeout(timeout: number): void {
    this.timeout = timeout;
    logger.info('MandateLookupClient timeout updated', { timeout });
  }
} 