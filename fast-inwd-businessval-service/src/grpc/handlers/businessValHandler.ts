import * as grpc from '@grpc/grpc-js';
import { logger } from '../../utils/logger';
import { BusinessValidationService, BusinessValidationRequest } from '../../services/businessValidationService';

export class BusinessValHandler {
  private businessValidationService: BusinessValidationService;

  // Private constructor to force use of factory method
  private constructor(businessValidationService: BusinessValidationService) {
    this.businessValidationService = businessValidationService;
  }

  /**
   * Static async factory method to create and initialize BusinessValHandler
   * @returns Promise<BusinessValHandler> - Fully initialized handler instance
   * @throws Error if initialization fails
   */
  static async create(): Promise<BusinessValHandler> {
    try {
      const businessValidationService = new BusinessValidationService();
      return new BusinessValHandler(businessValidationService);
    } catch (error) {
      throw new Error(`Failed to initialize BusinessValHandler: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process business validation message
   */
  async processMessage(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const request = call.request;
      
      logger.info('Processing business validation message', {
        messageId: request.message_id,
        puid: request.puid,
        messageType: request.message_type,
      });

      // Convert gRPC request to service request
      const businessValRequest: BusinessValidationRequest = {
        messageId: request.message_id,
        puid: request.puid,
        messageType: request.message_type,
        xmlPayload: request.xml_payload,
        metadata: request.metadata || {},
        timestamp: request.timestamp || Date.now(),
      };

      // Process the message
      const result = await this.businessValidationService.processMessage(businessValRequest);

      const processingTime = Date.now() - startTime;

      logger.info('Business validation completed', {
        messageId: request.message_id,
        puid: request.puid,
        success: result.success,
        responseType: result.responseType,
        processingTimeMs: processingTime,
      });

      // Convert service response to gRPC response
      const grpcResponse = {
        message_id: result.messageId,
        puid: result.puid,
        success: result.success,
        response_payload: result.responsePayload,
        error_message: result.errorMessage || '',
        enrichment_data: this.convertEnrichmentDataToGrpc(result.enrichmentData),
        validation_result: this.convertValidationResultToGrpc(result.validationResult),
        processed_at: result.processedAt,
        response_type: this.convertResponseTypeToGrpc(result.responseType),
      };

      callback(null, grpcResponse);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Business validation failed', {
        messageId: call.request?.message_id,
        puid: call.request?.puid,
        error: errorMessage,
        processingTimeMs: processingTime,
      });

      const errorResponse = {
        message_id: call.request?.message_id || '',
        puid: call.request?.puid || '',
        success: false,
        response_payload: '',
        error_message: errorMessage,
        enrichment_data: {
          received_acct_id: '',
          lookup_status_code: 500,
          lookup_status_desc: 'Internal Error',
          normalized_acct_id: '',
          matched_acct_id: '',
          partial_match: 'N',
          is_physical: 'N',
          auth_method: 'UNKNOWN',
        },
        validation_result: {
          business_rules_passed: false,
          validation_errors: [errorMessage],
          warnings: [],
          risk_score: 'HIGH',
        },
        processed_at: Date.now(),
        response_type: 2, // ERROR_RESPONSE
      };

      callback(null, errorResponse);
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      logger.debug('Health check requested', {
        service: call.request?.service || 'unknown',
      });

      const healthResponse = {
        status: 1, // SERVING
        message: 'fast-inwd-businessval-service is healthy',
      };

      callback(null, healthResponse);

    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorResponse = {
        status: 2, // NOT_SERVING
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };

      callback(null, errorResponse);
    }
  }

  /**
   * Convert enrichment data to gRPC format
   */
  private convertEnrichmentDataToGrpc(enrichmentData: any): any {
    return {
      received_acct_id: enrichmentData.receivedAcctId || '',
      lookup_status_code: enrichmentData.lookupStatusCode || 0,
      lookup_status_desc: enrichmentData.lookupStatusDesc || '',
      normalized_acct_id: enrichmentData.normalizedAcctId || '',
      matched_acct_id: enrichmentData.matchedAcctId || '',
      partial_match: enrichmentData.partialMatch || 'N',
      is_physical: enrichmentData.isPhysical || 'N',
      physical_acct_info: enrichmentData.physicalAcctInfo || {},
      auth_method: enrichmentData.authMethod || 'UNKNOWN',
      reference_data: enrichmentData.referenceData ? {
        currency_valid: enrichmentData.referenceData.currencyValid ? 'Y' : 'N',
        country_valid: enrichmentData.referenceData.countryValid ? 'Y' : 'N',
        bank_code_valid: enrichmentData.referenceData.bankValid ? 'Y' : 'N',
        additional_data: enrichmentData.referenceData.additionalData || {},
      } : undefined,
      mandate_info: enrichmentData.mandateInfo ? {
        mandate_id: enrichmentData.mandateInfo.mandateId || '',
        mandate_status: enrichmentData.mandateInfo.mandateStatus || '',
        mandate_type: enrichmentData.mandateInfo.mandateType || '',
        max_amount: enrichmentData.mandateInfo.maxAmount || '',
        frequency: enrichmentData.mandateInfo.frequency || '',
      } : undefined,
    };
  }

  /**
   * Convert validation result to gRPC format
   */
  private convertValidationResultToGrpc(validationResult: any): any {
    return {
      business_rules_passed: validationResult.businessRulesPassed || false,
      validation_errors: validationResult.validationErrors || [],
      warnings: validationResult.warnings || [],
      risk_score: validationResult.riskScore || 'HIGH',
    };
  }

  /**
   * Convert response type to gRPC enum value
   */
  private convertResponseTypeToGrpc(responseType: string): number {
    switch (responseType) {
      case 'PACS002_ACCEPTANCE':
        return 0;
      case 'CAMT029_REJECTION':
        return 1;
      case 'ERROR_RESPONSE':
      default:
        return 2;
    }
  }
} 