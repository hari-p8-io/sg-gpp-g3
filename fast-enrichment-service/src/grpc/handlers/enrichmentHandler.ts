import * as grpc from '@grpc/grpc-js';
import { EnrichmentService } from '../../services/enrichmentService';
import { logger } from '../../utils/logger';

// Health check status codes as defined in the gRPC health check protocol
enum HealthCheckStatus {
  UNKNOWN = 0,
  SERVING = 1,
  NOT_SERVING = 2,
  SERVICE_UNKNOWN = 3
}

// Generated types based on enrichment_service.proto
interface EnrichmentGrpcRequest {
  message_id: string;
  puid: string;
  message_type: string;
  xml_payload: string;
  metadata: Record<string, string>;
  timestamp: number;
}

interface EnrichmentGrpcResponse {
  message_id: string;
  puid: string;
  success: boolean;
  enriched_payload: string;
  error_message: string;
  enrichment_data?: EnrichmentDataGrpc | null;
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
  auth_method: string;
  physical_acct_info?: PhysicalAccountInfoGrpc;
}

interface PhysicalAccountInfoGrpc {
  acct_id: string;
  acct_sys: string;
  acct_group: string;
  country: string;
  branch_id: string;
  acct_attributes: AccountAttributesGrpc;
  acct_ops_attributes: AccountOpsAttributesGrpc;
  bicfi: string;
  currency_code: string;
}

interface AccountAttributesGrpc {
  acct_type: string;
  acct_category: string;
  acct_purpose: string;
}

interface AccountOpsAttributesGrpc {
  is_active: string;
  acct_status: string;
  open_date: string;
  expiry_date: string;
  restraints: RestraintsGrpc;
}

interface RestraintsGrpc {
  stop_all: string;
  stop_debits: string;
  stop_credits: string;
  stop_atm: string;
  stop_eft_pos: string;
  stop_unknown: string;
  warnings: string[];
}

interface HealthCheckGrpcRequest {
  service: string;
}

interface HealthCheckGrpcResponse {
  status: number;
  message: string;
}

export class EnrichmentHandler {
  private enrichmentService: EnrichmentService;

  // Private constructor to force use of factory method
  private constructor(enrichmentService: EnrichmentService) {
    this.enrichmentService = enrichmentService;
  }

  /**
   * Static async factory method to create and initialize EnrichmentHandler
   * @returns Promise<EnrichmentHandler> - Fully initialized handler instance
   * @throws Error if initialization fails
   */
  static async create(): Promise<EnrichmentHandler> {
    try {
      const enrichmentService = await EnrichmentService.create();
      return new EnrichmentHandler(enrichmentService);
    } catch (error) {
      throw new Error(`Failed to initialize EnrichmentHandler: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  enrichMessage = async (call: grpc.ServerUnaryCall<EnrichmentGrpcRequest, EnrichmentGrpcResponse>, callback: grpc.sendUnaryData<EnrichmentGrpcResponse>) => {
    try {
      const request = call.request;

      logger.info('gRPC EnrichMessage request received', {
        messageId: request.message_id,
        puid: request.puid,
        messageType: request.message_type
      });

      // Convert gRPC request to service request
      const serviceRequest = {
        messageId: request.message_id,
        puid: request.puid,
        messageType: request.message_type,
        xmlPayload: request.xml_payload,
        metadata: request.metadata || {},
        timestamp: request.timestamp || Date.now()
      };

      // Call the enrichment service
      const serviceResponse = await this.enrichmentService.enrichMessage(serviceRequest);

      // Convert service response to gRPC response
      const grpcResponse = {
        message_id: serviceResponse.messageId,
        puid: serviceResponse.puid,
        success: serviceResponse.success,
        enriched_payload: serviceResponse.enrichedPayload || '',
        error_message: serviceResponse.errorMessage || '',
        enrichment_data: serviceResponse.enrichmentData ? this.convertEnrichmentDataToGrpc(serviceResponse.enrichmentData) : null,
        processed_at: serviceResponse.processedAt,
        next_service: serviceResponse.nextService
      };

      logger.info('gRPC EnrichMessage response sent', {
        messageId: serviceResponse.messageId,
        success: serviceResponse.success,
        hasEnrichmentData: !!serviceResponse.enrichmentData
      });

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC EnrichMessage error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error during enrichment'
      });
    }
  };

  healthCheck = async (call: grpc.ServerUnaryCall<HealthCheckGrpcRequest, HealthCheckGrpcResponse>, callback: grpc.sendUnaryData<HealthCheckGrpcResponse>) => {
    try {
      const request = call.request;

      logger.debug('gRPC HealthCheck request received', { service: request.service });

      const healthResult = await this.enrichmentService.healthCheck();

      const grpcResponse = {
        status: this.mapHealthStatus(healthResult.status),
        message: healthResult.message
      };

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC HealthCheck error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      callback(null, {
        status: HealthCheckStatus.NOT_SERVING,
        message: 'Health check failed'
      });
    }
  };

  private convertEnrichmentDataToGrpc(enrichmentData: any): EnrichmentDataGrpc {
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
          is_active: physicalInfo.acctOpsAttributes?.isActive || '',
          acct_status: physicalInfo.acctOpsAttributes?.acctStatus || '',
          open_date: physicalInfo.acctOpsAttributes?.openDate || '',
          expiry_date: physicalInfo.acctOpsAttributes?.expiryDate || '',
          restraints: {
            stop_all: physicalInfo.acctOpsAttributes?.restraints?.stopAll || '',
            stop_debits: physicalInfo.acctOpsAttributes?.restraints?.stopDebits || '',
            stop_credits: physicalInfo.acctOpsAttributes?.restraints?.stopCredits || '',
            stop_atm: physicalInfo.acctOpsAttributes?.restraints?.stopAtm || '',
            stop_eft_pos: physicalInfo.acctOpsAttributes?.restraints?.stopEftPos || '',
            stop_unknown: physicalInfo.acctOpsAttributes?.restraints?.stopUnknown || '',
            warnings: physicalInfo.acctOpsAttributes?.restraints?.warnings || []
          }
        },
        bicfi: physicalInfo.bicfi || '',
        currency_code: physicalInfo.currencyCode || ''
      };
    }

    return grpcData;
  }

  private mapHealthStatus(status: string): number {
    switch (status) {
      case 'SERVING':
        return HealthCheckStatus.SERVING;
      case 'NOT_SERVING':
        return HealthCheckStatus.NOT_SERVING;
      case 'SERVICE_UNKNOWN':
        return HealthCheckStatus.SERVICE_UNKNOWN;
      default:
        return HealthCheckStatus.UNKNOWN;
    }
  }

  shutdown(): void {
    logger.info('Shutting down enrichment handler');
    this.enrichmentService.shutdown();
  }
} 