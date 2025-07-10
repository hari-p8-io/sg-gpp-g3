import * as grpc from '@grpc/grpc-js';
import { EnrichmentService } from '../../services/enrichmentService';
import { logger } from '../../utils/logger';

export class EnrichmentHandler {
  private enrichmentService: EnrichmentService;

  constructor() {
    this.enrichmentService = new EnrichmentService();
  }

  enrichMessage = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
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

  healthCheck = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
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
        status: 2, // NOT_SERVING
        message: 'Health check failed'
      });
    }
  };

  private convertEnrichmentDataToGrpc(enrichmentData: any): any {
    const grpcData: any = {
      received_acct_id: enrichmentData.receivedAcctId,
      lookup_status_code: enrichmentData.lookupStatusCode,
      lookup_status_desc: enrichmentData.lookupStatusDesc,
      normalized_acct_id: enrichmentData.normalizedAcctId,
      matched_acct_id: enrichmentData.matchedAcctId,
      partial_match: enrichmentData.partialMatch,
      is_physical: enrichmentData.isPhysical,
      auth_method: enrichmentData.authMethod // Add the auth method field
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

  private mapHealthStatus(status: string): number {
    switch (status) {
      case 'SERVING':
        return 1;
      case 'NOT_SERVING':
        return 2;
      case 'SERVICE_UNKNOWN':
        return 3;
      default:
        return 0; // UNKNOWN
    }
  }

  shutdown(): void {
    logger.info('Shutting down enrichment handler');
    this.enrichmentService.shutdown();
  }
} 