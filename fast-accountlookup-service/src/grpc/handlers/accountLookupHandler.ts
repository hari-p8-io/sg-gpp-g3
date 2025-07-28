import * as grpc from '@grpc/grpc-js';
import { AccountLookupService } from '../../services/accountLookupService';
import { logger } from '../../utils/logger';

export class AccountLookupHandler {
  private accountLookupService: AccountLookupService;

  constructor() {
    this.accountLookupService = new AccountLookupService();
  }

  lookupAccount = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;
      
      // Validate required input fields
      const validationError = this.validateLookupAccountRequest(request);
      if (validationError) {
        logger.warn('gRPC LookupAccount request validation failed', {
          error: validationError,
          messageId: request.message_id,
          puid: request.puid,
          cdtrAcctId: request.cdtr_acct_id,
          messageType: request.message_type
        });

        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: validationError
        });
        return;
      }
      
      logger.info('gRPC LookupAccount request received', {
        messageId: request.message_id,
        puid: request.puid,
        cdtrAcctId: request.cdtr_acct_id,
        messageType: request.message_type
      });

      // Convert gRPC request to service request
      const serviceRequest = {
        messageId: request.message_id,
        puid: request.puid,
        cdtrAcctId: request.cdtr_acct_id,
        messageType: request.message_type,
        metadata: request.metadata || {},
        timestamp: request.timestamp || Date.now()
      };

      // Call the account lookup service
      const serviceResponse = await this.accountLookupService.lookupAccount(serviceRequest);

      // Convert service response to gRPC response
      const grpcResponse = {
        message_id: serviceResponse.messageId,
        puid: serviceResponse.puid,
        success: serviceResponse.success,
        error_message: serviceResponse.errorMessage || '',
        error_code: serviceResponse.errorCode || '',
        enrichment_data: serviceResponse.enrichmentData ? this.convertEnrichmentDataToGrpc(serviceResponse.enrichmentData) : undefined,
        processed_at: serviceResponse.processedAt,
        lookup_source: serviceResponse.lookupSource
      };

      logger.info('gRPC LookupAccount response sent', {
        messageId: serviceResponse.messageId,
        success: serviceResponse.success,
        lookupSource: serviceResponse.lookupSource
      });

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC LookupAccount error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error during account lookup'
      });
    }
  };

  healthCheck = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;
      
      logger.debug('gRPC HealthCheck request received', { service: request.service });

      const healthResult = await this.accountLookupService.healthCheck();

      const grpcResponse = {
        status: this.mapHealthStatus(healthResult.status),
        message: healthResult.message,
        timestamp: healthResult.timestamp
      };

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC HealthCheck error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      callback(null, {
        status: 2, // NOT_SERVING
        message: 'Health check failed',
        timestamp: Date.now()
      });
    }
  };

  getServiceInfo = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;
      
      logger.info('gRPC GetServiceInfo request received', { requester: request.requester });

      const serviceInfo = this.accountLookupService.getServiceInfo(request.requester);

      const grpcResponse = {
        service_name: serviceInfo.serviceName,
        version: serviceInfo.version,
        build_time: serviceInfo.buildTime,
        capabilities: serviceInfo.capabilities,
        is_stubbed: serviceInfo.isStubbed,
        environment: serviceInfo.environment
      };

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC GetServiceInfo error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error getting service info'
      });
    }
  };

  private validateLookupAccountRequest(request: any): string | null {
    // Check if request exists
    if (!request) {
      return 'Request is required';
    }

    // Validate message_id
    if (!request.message_id || typeof request.message_id !== 'string' || request.message_id.trim() === '') {
      return 'message_id is required and must be a non-empty string';
    }

    // Validate puid
    if (!request.puid || typeof request.puid !== 'string' || request.puid.trim() === '') {
      return 'puid is required and must be a non-empty string';
    }

    // Validate cdtr_acct_id
    if (!request.cdtr_acct_id || typeof request.cdtr_acct_id !== 'string' || request.cdtr_acct_id.trim() === '') {
      return 'cdtr_acct_id is required and must be a non-empty string';
    }

    // Validate message_type
    if (!request.message_type || typeof request.message_type !== 'string' || request.message_type.trim() === '') {
      return 'message_type is required and must be a non-empty string';
    }

    // Additional validation for message_id format (UUID-like)
    if (request.message_id.length < 8) {
      return 'message_id must be at least 8 characters long';
    }

    // Additional validation for puid format (UUID-like)
    if (request.puid.length < 8) {
      return 'puid must be at least 8 characters long';
    }

    // Additional validation for cdtr_acct_id format (account ID)
    if (request.cdtr_acct_id.length < 3) {
      return 'cdtr_acct_id must be at least 3 characters long';
    }

    // Additional validation for message_type (should be valid message type)
    const validMessageTypes = ['pacs.008.001.10', 'pacs.002.001.15', 'pacs.004.001.12', 'pain.001.001.11', 'pain.002.001.12'];
    if (!validMessageTypes.includes(request.message_type)) {
      return `message_type must be one of: ${validMessageTypes.join(', ')}`;
    }

    // All validations passed
    return null;
  }

  private convertEnrichmentDataToGrpc(enrichmentData: any): any {
    const grpcEnrichmentData: any = {
      received_acct_id: enrichmentData.receivedAcctId,
      lookup_status_code: enrichmentData.lookupStatusCode,
      lookup_status_desc: enrichmentData.lookupStatusDesc,
      normalized_acct_id: enrichmentData.normalizedAcctId,
      matched_acct_id: enrichmentData.matchedAcctId,
      partial_match: enrichmentData.partialMatch,
      is_physical: enrichmentData.isPhysical
    };

    if (enrichmentData.physicalAcctInfo) {
      grpcEnrichmentData.physical_acct_info = {
        acct_id: enrichmentData.physicalAcctInfo.acctId,
        acct_sys: enrichmentData.physicalAcctInfo.acctSys,
        acct_group: enrichmentData.physicalAcctInfo.acctGroup,
        country: enrichmentData.physicalAcctInfo.country,
        branch_id: enrichmentData.physicalAcctInfo.branchId || '',
        acct_attributes: {
          acct_type: enrichmentData.physicalAcctInfo.acctAttributes.acctType,
          acct_category: enrichmentData.physicalAcctInfo.acctAttributes.acctCategory,
          acct_purpose: enrichmentData.physicalAcctInfo.acctAttributes.acctPurpose
        },
        acct_ops_attributes: {
          is_active: enrichmentData.physicalAcctInfo.acctOpsAttributes.isActive,
          acct_status: enrichmentData.physicalAcctInfo.acctOpsAttributes.acctStatus,
          open_date: enrichmentData.physicalAcctInfo.acctOpsAttributes.openDate,
          expiry_date: enrichmentData.physicalAcctInfo.acctOpsAttributes.expiryDate,
          restraints: {
            stop_all: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.stopAll,
            stop_debits: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.stopDebits,
            stop_credits: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.stopCredits,
            stop_atm: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.stopAtm,
            stop_eft_pos: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.stopEftPos,
            stop_unknown: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.stopUnknown,
            warnings: enrichmentData.physicalAcctInfo.acctOpsAttributes.restraints.warnings
          }
        },
        bicfi: enrichmentData.physicalAcctInfo.bicfi,
        currency_code: enrichmentData.physicalAcctInfo.currencyCode
      };
    }

    return grpcEnrichmentData;
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
} 