import * as grpc from '@grpc/grpc-js';
import { ReferenceDataService } from '../../services/referenceDataService';
import { logger } from '../../utils/logger';

export class ReferenceDataHandler {
  private referenceDataService: ReferenceDataService;

  constructor() {
    this.referenceDataService = new ReferenceDataService();
  }

  lookupAuthMethod = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;

      logger.info('gRPC LookupAuthMethod request received', {
        messageId: request.message_id,
        puid: request.puid,
        acctId: request.acct_id,
        acctSys: request.acct_sys
      });

      // Convert gRPC request to service request
      const serviceRequest = {
        messageId: request.message_id,
        puid: request.puid,
        acctSys: request.acct_sys,
        acctGrp: request.acct_grp,
        acctId: request.acct_id,
        country: request.country,
        currencyCode: request.currency_code,
        metadata: request.metadata || {},
        timestamp: request.timestamp || Date.now()
      };

      // Call the reference data service
      const serviceResponse = await this.referenceDataService.lookupAuthMethod(serviceRequest);

      // Convert service response to gRPC response
      const grpcResponse = {
        message_id: serviceResponse.messageId,
        puid: serviceResponse.puid,
        success: serviceResponse.success,
        auth_method: serviceResponse.authMethod || '',
        error_message: serviceResponse.errorMessage || '',
        error_code: serviceResponse.errorCode || '',
        ref_data_details: serviceResponse.refDataDetails ? this.convertRefDataDetailsToGrpc(serviceResponse.refDataDetails) : null,
        processed_at: serviceResponse.processedAt,
        lookup_source: serviceResponse.lookupSource
      };

      logger.info('gRPC LookupAuthMethod response sent', {
        messageId: serviceResponse.messageId,
        success: serviceResponse.success,
        authMethod: serviceResponse.authMethod,
        lookupSource: serviceResponse.lookupSource
      });

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC LookupAuthMethod error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error during auth method lookup'
      });
    }
  };

  healthCheck = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;

      logger.debug('gRPC HealthCheck request received', {
        service: request.service || 'unknown'
      });

      const response = {
        status: 'SERVING',
        message: 'fast-referencedata-service is healthy and ready to serve requests',
        timestamp: Date.now()
      };

      callback(null, response);

    } catch (error) {
      logger.error('gRPC HealthCheck error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      callback({
        code: grpc.status.INTERNAL,
        message: 'Health check failed'
      });
    }
  };

  private convertRefDataDetailsToGrpc(refDataDetails: any): any {
    return {
      acct_sys: refDataDetails.acctSys,
      acct_grp: refDataDetails.acctGrp,
      acct_id: refDataDetails.acctId,
      country: refDataDetails.country,
      currency_code: refDataDetails.currencyCode,
      auth_method: refDataDetails.authMethod,
      risk_level: refDataDetails.riskLevel,
      limit_profile: refDataDetails.limitProfile,
      requires_approval: refDataDetails.requiresApproval,
      additional_attributes: refDataDetails.additionalAttributes || {}
    };
  }
} 