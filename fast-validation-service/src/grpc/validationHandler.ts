import * as grpc from '@grpc/grpc-js';
import { ValidationService } from '../services/validationService';
import { logger } from '../utils/logger';

export class ValidationHandler {
  private validationService: ValidationService;

  constructor() {
    this.validationService = new ValidationService();
  }

  validateEnrichedMessage = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;

      logger.info('gRPC ValidateEnrichedMessage request received', {
        messageId: request.message_id,
        puid: request.puid,
        messageType: request.message_type,
        hasEnrichmentData: !!request.enrichment_data,
        enrichmentDataKeys: request.enrichment_data ? Object.keys(request.enrichment_data) : [],
        rawEnrichmentData: request.enrichment_data
      });

      // Convert gRPC request to service request
      const serviceRequest = {
        messageId: request.message_id,
        puid: request.puid,
        messageType: request.message_type,
        enrichedXmlPayload: request.enriched_xml_payload,
        enrichmentData: request.enrichment_data ? this.convertEnrichmentDataFromGrpc(request.enrichment_data) : undefined,
        timestamp: request.timestamp || Date.now(),
        metadata: request.metadata || {}
      };

      logger.info('Converted service request', {
        messageId: serviceRequest.messageId,
        hasEnrichmentData: !!serviceRequest.enrichmentData,
        convertedEnrichmentData: serviceRequest.enrichmentData
      });

      // Call the validation service
      const serviceResponse = await this.validationService.validateEnrichedMessage(serviceRequest);

      // Convert service response to gRPC response
      const grpcResponse = {
        message_id: serviceResponse.messageId,
        puid: serviceResponse.puid,
        success: serviceResponse.success,
        error_message: serviceResponse.errorMessage || '',
        validation_result: this.convertValidationResultToGrpc(serviceResponse.validationResult),
        json_payload: serviceResponse.jsonPayload ? JSON.stringify(serviceResponse.jsonPayload) : '',
        kafka_published: serviceResponse.kafkaPublished,
        processed_at: serviceResponse.processedAt,
        next_service: serviceResponse.nextService
      };

      logger.info('gRPC ValidateEnrichedMessage response sent', {
        messageId: serviceResponse.messageId,
        success: serviceResponse.success,
        kafkaPublished: serviceResponse.kafkaPublished
      });

      callback(null, grpcResponse);

    } catch (error) {
      logger.error('gRPC ValidateEnrichedMessage error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error during validation'
      });
    }
  };

  healthCheck = async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;

      logger.debug('gRPC HealthCheck request received', { service: request.service });

      const healthResult = await this.validationService.healthCheck();

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

  private convertEnrichmentDataFromGrpc(grpcData: any): any {
    const enrichmentData: any = {
      receivedAcctId: grpcData.received_acct_id,
      lookupStatusCode: grpcData.lookup_status_code,
      lookupStatusDesc: grpcData.lookup_status_desc,
      normalizedAcctId: grpcData.normalized_acct_id,
      matchedAcctId: grpcData.matched_acct_id,
      partialMatch: grpcData.partial_match,
      isPhysical: grpcData.is_physical
    };

    if (grpcData.physical_acct_info) {
      const physicalInfo = grpcData.physical_acct_info;
      enrichmentData.physicalAcctInfo = {
        acctId: physicalInfo.acct_id,
        acctSys: physicalInfo.acct_sys,
        acctGroup: physicalInfo.acct_group,
        country: physicalInfo.country,
        branchId: physicalInfo.branch_id,
        acctAttributes: {
          acctType: physicalInfo.acct_attributes?.acct_type,
          acctCategory: physicalInfo.acct_attributes?.acct_category,
          acctPurpose: physicalInfo.acct_attributes?.acct_purpose
        },
        acctOpsAttributes: {
          isActive: physicalInfo.acct_ops_attributes?.is_active,
          acctStatus: physicalInfo.acct_ops_attributes?.acct_status,
          openDate: physicalInfo.acct_ops_attributes?.open_date,
          expiryDate: physicalInfo.acct_ops_attributes?.expiry_date,
          restraints: {
            stopAll: physicalInfo.acct_ops_attributes?.restraints?.stop_all,
            stopDebits: physicalInfo.acct_ops_attributes?.restraints?.stop_debits,
            stopCredits: physicalInfo.acct_ops_attributes?.restraints?.stop_credits,
            stopAtm: physicalInfo.acct_ops_attributes?.restraints?.stop_atm,
            stopEftPos: physicalInfo.acct_ops_attributes?.restraints?.stop_eft_pos,
            stopUnknown: physicalInfo.acct_ops_attributes?.restraints?.stop_unknown,
            warnings: physicalInfo.acct_ops_attributes?.restraints?.warnings || []
          }
        },
        bicfi: physicalInfo.bicfi,
        currencyCode: physicalInfo.currency_code
      };
    }

    return enrichmentData;
  }

  private convertValidationResultToGrpc(validationResult: any): any {
    return {
      is_valid: validationResult.isValid,
      errors: validationResult.errors.map((error: any) => ({
        field: error.field,
        error_code: error.errorCode,
        error_message: error.errorMessage,
        severity: error.severity
      })),
      currency_validation: {
        currency_code: validationResult.currencyValidation.currencyCode || '',
        is_valid: validationResult.currencyValidation.isValid,
        expected_currency: validationResult.currencyValidation.expectedCurrency,
        validation_message: validationResult.currencyValidation.validationMessage
      },
      country_validation: {
        country_code: validationResult.countryValidation.countryCode || '',
        is_valid: validationResult.countryValidation.isValid,
        expected_country: validationResult.countryValidation.expectedCountry,
        validation_message: validationResult.countryValidation.validationMessage
      },
      validation_metadata: validationResult.validationMetadata || {}
    };
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
    logger.info('Shutting down validation handler');
    this.validationService.shutdown();
  }
} 