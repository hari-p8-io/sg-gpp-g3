import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../../utils/logger';

// Health check status codes as defined in the gRPC health check protocol
enum HealthCheckStatus {
  UNKNOWN = 0,
  SERVING = 1,
  NOT_SERVING = 2,
  SERVICE_UNKNOWN = 3
}

// Generated types based on validation_service.proto
interface ValidationServiceClient {
  ValidateEnrichedMessage(
    request: ValidateEnrichedMessageGrpcRequest,
    callback: (error: grpc.ServiceError | null, response: ValidateEnrichedMessageGrpcResponse) => void
  ): void;
  HealthCheck(
    request: HealthCheckGrpcRequest,
    callback: (error: grpc.ServiceError | null, response: HealthCheckGrpcResponse) => void
  ): void;
}

interface ValidationServicePackage {
  gpp: {
    g3: {
      validation: {
        ValidationService: new (
          address: string,
          credentials: grpc.ChannelCredentials
        ) => ValidationServiceClient;
      };
    };
  };
}

// gRPC message types based on proto definitions
interface ValidateEnrichedMessageGrpcRequest {
  message_id: string;
  puid: string;
  message_type: string;
  enriched_xml_payload: string;
  enrichment_data?: EnrichmentDataGrpc | null;
  timestamp: number;
  metadata: Record<string, string>;
}

interface ValidateEnrichedMessageGrpcResponse {
  message_id: string;
  puid: string;
  success: boolean;
  error_message?: string;
  kafka_published: boolean;
  processed_at: number;
  next_service: string;
}

interface EnrichmentDataGrpc {
  received_acct_id: string;
  lookup_status_code: number;
  lookup_status_desc: string;
  normalized_acct_id: string;
  matched_acct_id: string;
  partial_match: string;
  is_physical: string;
  auth_method?: string;
  physical_acct_info?: PhysicalAcctInfoGrpc;
}

interface PhysicalAcctInfoGrpc {
  acct_id: string;
  acct_sys: string;
  acct_group: string;
  country: string;
  branch_id: string;
  acct_attributes: AcctAttributesGrpc;
  acct_ops_attributes: AcctOpsAttributesGrpc;
  bicfi: string;
  currency_code: string;
}

interface AcctAttributesGrpc {
  acct_type: string;
  acct_category: string;
  acct_purpose: string;
}

interface AcctOpsAttributesGrpc {
  is_active: boolean;
  acct_status: string;
  open_date: string;
  expiry_date: string;
  restraints: AcctRestraintsGrpc;
}

interface AcctRestraintsGrpc {
  stop_all: boolean;
  stop_debits: boolean;
  stop_credits: boolean;
  stop_atm: boolean;
  stop_eft_pos: boolean;
  stop_unknown: boolean;
  warnings: string[];
}

interface HealthCheckGrpcRequest {
  service: string;
}

interface HealthCheckGrpcResponse {
  status: number;
  message: string;
}

export interface ValidationRequest {
  messageId: string;
  puid: string;
  messageType: string;
  enrichedXmlPayload: string;
  enrichmentData?: any;
  timestamp: number;
  metadata?: Record<string, string>;
}

export interface ValidationResponse {
  messageId: string;
  puid: string;
  success: boolean;
  errorMessage?: string;
  kafkaPublished: boolean;
  processedAt: number;
  nextService: string;
}

export class ValidationClient {
  private client!: ValidationServiceClient;
  private connected: boolean = false;

  constructor(serviceUrl: string) {
    this.initializeClient(serviceUrl);
  }

  private initializeClient(serviceUrl: string): void {
    try {
      const protoPath = path.join(__dirname, '../../../proto/gpp/g3/validation/validation_service.proto');
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const validationProto = grpc.loadPackageDefinition(packageDefinition) as unknown as ValidationServicePackage;
      
      this.client = new validationProto.gpp.g3.validation.ValidationService(
        serviceUrl,
        grpc.credentials.createInsecure()
      );

      this.connected = true;
      logger.info('Validation client initialized', { serviceUrl });
    } catch (error) {
      logger.error('Failed to initialize validation client', {
        error: error instanceof Error ? error.message : 'Unknown error',
        serviceUrl
      });
      this.connected = false;
    }
  }

  async validateEnrichedMessage(request: ValidationRequest): Promise<ValidationResponse> {
    if (!this.connected) {
      throw new Error('Validation client not connected');
    }

    logger.info('Calling validation service', {
      messageId: request.messageId,
      puid: request.puid,
      messageType: request.messageType
    });

    return new Promise((resolve, reject) => {
      const validationRequest: ValidateEnrichedMessageGrpcRequest = {
        message_id: request.messageId,
        puid: request.puid,
        message_type: request.messageType,
        enriched_xml_payload: request.enrichedXmlPayload,
        enrichment_data: this.convertEnrichmentDataToGrpc(request.enrichmentData),
        timestamp: request.timestamp,
        metadata: request.metadata || {}
      };

      this.client.ValidateEnrichedMessage(validationRequest, (error: grpc.ServiceError | null, response: ValidateEnrichedMessageGrpcResponse) => {
        if (error) {
          logger.error('Validation service call failed', {
            messageId: request.messageId,
            error: error.message
          });
          reject(error);
        } else {
          logger.info('Validation service call successful', {
            messageId: request.messageId,
            success: response.success,
            kafkaPublished: response.kafka_published
          });

          const validationResponse: ValidationResponse = {
            messageId: response.message_id,
            puid: response.puid,
            success: response.success,
            kafkaPublished: response.kafka_published,
            processedAt: response.processed_at,
            nextService: response.next_service
          };
          
          if (response.error_message) {
            validationResponse.errorMessage = response.error_message;
          }
          
          resolve(validationResponse);
        }
      });
    });
  }

  private convertEnrichmentDataToGrpc(enrichmentData: any): EnrichmentDataGrpc | null {
    if (!enrichmentData) return null;

    const grpcData: EnrichmentDataGrpc = {
      received_acct_id: enrichmentData.receivedAcctId || '',
      lookup_status_code: enrichmentData.lookupStatusCode || 0,
      lookup_status_desc: enrichmentData.lookupStatusDesc || '',
      normalized_acct_id: enrichmentData.normalizedAcctId || '',
      matched_acct_id: enrichmentData.matchedAcctId || '',
      partial_match: enrichmentData.partialMatch || '',
      is_physical: enrichmentData.isPhysical || '',
      auth_method: enrichmentData.authMethod || ''
    };

    if (enrichmentData.physicalAcctInfo) {
      const physicalInfo = enrichmentData.physicalAcctInfo;
      grpcData.physical_acct_info = {
        acct_id: physicalInfo.acctId || '',
        acct_sys: physicalInfo.acctSys || '',
        acct_group: physicalInfo.acctGroup || '',
        country: physicalInfo.country || '',
        branch_id: physicalInfo.branchId || '',
        acct_attributes: {
          acct_type: physicalInfo.acctAttributes?.acctType || '',
          acct_category: physicalInfo.acctAttributes?.acctCategory || '',
          acct_purpose: physicalInfo.acctAttributes?.acctPurpose || ''
        },
        acct_ops_attributes: {
          is_active: physicalInfo.acctOpsAttributes?.isActive || false,
          acct_status: physicalInfo.acctOpsAttributes?.acctStatus || '',
          open_date: physicalInfo.acctOpsAttributes?.openDate || '',
          expiry_date: physicalInfo.acctOpsAttributes?.expiryDate || '',
          restraints: {
            stop_all: physicalInfo.acctOpsAttributes?.restraints?.stopAll || false,
            stop_debits: physicalInfo.acctOpsAttributes?.restraints?.stopDebits || false,
            stop_credits: physicalInfo.acctOpsAttributes?.restraints?.stopCredits || false,
            stop_atm: physicalInfo.acctOpsAttributes?.restraints?.stopAtm || false,
            stop_eft_pos: physicalInfo.acctOpsAttributes?.restraints?.stopEftPos || false,
            stop_unknown: physicalInfo.acctOpsAttributes?.restraints?.stopUnknown || false,
            warnings: physicalInfo.acctOpsAttributes?.restraints?.warnings || []
          }
        },
        bicfi: physicalInfo.bicfi || '',
        currency_code: physicalInfo.currencyCode || ''
      };
    }

    return grpcData;
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    if (!this.connected) {
      return {
        status: 'NOT_SERVING',
        message: 'Validation client not connected'
      };
    }

    return new Promise((resolve) => {
      this.client.HealthCheck({ service: 'validation' }, (error: grpc.ServiceError | null, response: HealthCheckGrpcResponse) => {
        if (error) {
          resolve({
            status: 'NOT_SERVING',
            message: `Validation service health check failed: ${error.message}`
          });
        } else {
          const statusMap = {
            [HealthCheckStatus.UNKNOWN]: 'UNKNOWN',
            [HealthCheckStatus.SERVING]: 'SERVING',
            [HealthCheckStatus.NOT_SERVING]: 'NOT_SERVING',
            [HealthCheckStatus.SERVICE_UNKNOWN]: 'SERVICE_UNKNOWN'
          };
          
          resolve({
            status: statusMap[response.status as keyof typeof statusMap] || statusMap[HealthCheckStatus.UNKNOWN],
            message: response.message || 'Validation service health check completed'
          });
        }
      });
    });
  }

  disconnect(): void {
    this.connected = false;
    logger.info('Validation client disconnected');
  }
} 