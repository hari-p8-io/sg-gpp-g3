import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../../utils/logger';

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
  private client: any;
  private connected: boolean = false;

  constructor(serviceUrl: string) {
    this.initializeClient(serviceUrl);
  }

  private initializeClient(serviceUrl: string): void {
    try {
      const protoPath = path.join(__dirname, '../../../proto/validation_service.proto');
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const validationProto = grpc.loadPackageDefinition(packageDefinition) as any;
      
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
      const validationRequest = {
        message_id: request.messageId,
        puid: request.puid,
        message_type: request.messageType,
        enriched_xml_payload: request.enrichedXmlPayload,
        enrichment_data: this.convertEnrichmentDataToGrpc(request.enrichmentData),
        timestamp: request.timestamp,
        metadata: request.metadata || {}
      };

      this.client.ValidateEnrichedMessage(validationRequest, (error: any, response: any) => {
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

          resolve({
            messageId: response.message_id,
            puid: response.puid,
            success: response.success,
            errorMessage: response.error_message || undefined,
            kafkaPublished: response.kafka_published,
            processedAt: response.processed_at,
            nextService: response.next_service
          });
        }
      });
    });
  }

  private convertEnrichmentDataToGrpc(enrichmentData: any): any {
    if (!enrichmentData) return null;

    const grpcData: any = {
      received_acct_id: enrichmentData.receivedAcctId,
      lookup_status_code: enrichmentData.lookupStatusCode,
      lookup_status_desc: enrichmentData.lookupStatusDesc,
      normalized_acct_id: enrichmentData.normalizedAcctId,
      matched_acct_id: enrichmentData.matchedAcctId,
      partial_match: enrichmentData.partialMatch,
      is_physical: enrichmentData.isPhysical,
      auth_method: enrichmentData.authMethod
    };

    if (enrichmentData.physicalAcctInfo) {
      const physicalInfo = enrichmentData.physicalAcctInfo;
      grpcData.physical_acct_info = {
        acct_id: physicalInfo.acctId,
        acct_sys: physicalInfo.acctSys,
        acct_group: physicalInfo.acctGroup,
        country: physicalInfo.country,
        branch_id: physicalInfo.branchId || '',
        acct_attributes: {
          acct_type: physicalInfo.acctAttributes.acctType,
          acct_category: physicalInfo.acctAttributes.acctCategory,
          acct_purpose: physicalInfo.acctAttributes.acctPurpose
        },
        acct_ops_attributes: {
          is_active: physicalInfo.acctOpsAttributes.isActive,
          acct_status: physicalInfo.acctOpsAttributes.acctStatus,
          open_date: physicalInfo.acctOpsAttributes.openDate,
          expiry_date: physicalInfo.acctOpsAttributes.expiryDate,
          restraints: {
            stop_all: physicalInfo.acctOpsAttributes.restraints.stopAll,
            stop_debits: physicalInfo.acctOpsAttributes.restraints.stopDebits,
            stop_credits: physicalInfo.acctOpsAttributes.restraints.stopCredits,
            stop_atm: physicalInfo.acctOpsAttributes.restraints.stopAtm,
            stop_eft_pos: physicalInfo.acctOpsAttributes.restraints.stopEftPos,
            stop_unknown: physicalInfo.acctOpsAttributes.restraints.stopUnknown,
            warnings: physicalInfo.acctOpsAttributes.restraints.warnings
          }
        },
        bicfi: physicalInfo.bicfi,
        currency_code: physicalInfo.currencyCode
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
      this.client.HealthCheck({ service: 'validation' }, (error: any, response: any) => {
        if (error) {
          resolve({
            status: 'NOT_SERVING',
            message: `Validation service health check failed: ${error.message}`
          });
        } else {
          const statusMap = {
            0: 'UNKNOWN',
            1: 'SERVING',
            2: 'NOT_SERVING',
            3: 'SERVICE_UNKNOWN'
          };
          
          resolve({
            status: statusMap[response.status as keyof typeof statusMap] || 'UNKNOWN',
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