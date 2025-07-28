import { logger } from '../utils/logger';
import { ReferenceDataRestClient } from '../clients/referenceDataRestClient';
import { ResponseGenerationService, ProcessorRequest, ValidationResult, EnrichmentData, ResponseType } from './responseGenerationService';
import { AccountLookupGrpcClient } from '../grpc/clients/accountLookupGrpcClient';
import { MandateLookupRestClient } from '../clients/mandateLookupRestClient';
import * as xml2js from 'xml2js';

export interface BusinessValidationRequest {
  messageId: string;
  puid: string;
  messageType: string;
  xmlPayload: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface BusinessValidationResponse {
  messageId: string;
  puid: string;
  success: boolean;
  responsePayload: string;
  errorMessage?: string;
  enrichmentData: EnrichmentData;
  validationResult: ValidationResult;
  processedAt: number;
  responseType: ResponseType;
}

export class BusinessValidationService {
  private referenceDataClient: ReferenceDataRestClient;
  private responseGenerationService: ResponseGenerationService;
  private accountLookupClient: AccountLookupGrpcClient;
  private mandateLookupClient: MandateLookupRestClient;

  constructor() {
    this.referenceDataClient = new ReferenceDataRestClient();
    this.responseGenerationService = new ResponseGenerationService();
    this.accountLookupClient = new AccountLookupGrpcClient();
    this.mandateLookupClient = new MandateLookupRestClient();
  }

  /**
   * Main business validation processing method
   */
  async processMessage(request: BusinessValidationRequest): Promise<BusinessValidationResponse> {
    const startTime = Date.now();
    
    logger.info('Starting business validation process', {
      messageId: request.messageId,
      puid: request.puid,
      messageType: request.messageType,
    });

    try {
      // Step 1: Parse XML and extract basic information
      const parsedData = await this.parseXmlMessage(request.xmlPayload);
      
      // Step 2: Perform account lookup via gRPC
      const enrichmentData = await this.performAccountLookup(request, parsedData);
      
      // Step 3: Validate reference data via REST API
      await this.validateReferenceData(enrichmentData, parsedData);
      
      // Step 4: Handle mandate validation for PACS003 (Direct Debit)
      if (request.messageType === 'PACS003') {
        await this.validateMandate(enrichmentData, parsedData);
      }
      
      // Step 5: Apply business rules
      const validationResult = await this.applyBusinessRules(request, enrichmentData, parsedData);
      
      // Step 6: Generate appropriate response (PACS002 or CAMT029)
      const responseGeneration = await this.responseGenerationService.generateResponse(
        request,
        validationResult,
        enrichmentData
      );

      if (!responseGeneration.success) {
        throw new Error(responseGeneration.errorMessage || 'Failed to generate response');
      }

      const processedAt = Date.now();
      const processingTime = processedAt - startTime;

      logger.info('Business validation completed successfully', {
        messageId: request.messageId,
        puid: request.puid,
        responseType: responseGeneration.responseType,
        processingTimeMs: processingTime,
        businessRulesPassed: validationResult.businessRulesPassed,
      });

      return {
        messageId: request.messageId,
        puid: request.puid,
        success: true,
        responsePayload: responseGeneration.responseXml,
        enrichmentData,
        validationResult,
        processedAt,
        responseType: responseGeneration.responseType,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const processedAt = Date.now();
      const processingTime = processedAt - startTime;

      logger.error('Business validation failed', {
        messageId: request.messageId,
        puid: request.puid,
        error: errorMessage,
        processingTimeMs: processingTime,
      });

      // Generate error response
      const errorValidationResult: ValidationResult = {
        businessRulesPassed: false,
        validationErrors: [errorMessage],
        warnings: [],
        riskScore: 'HIGH',
      };

      const errorEnrichmentData: EnrichmentData = {
        receivedAcctId: '',
        lookupStatusCode: 500,
        lookupStatusDesc: 'Internal Error',
        normalizedAcctId: '',
        matchedAcctId: '',
        partialMatch: 'N',
        isPhysical: 'N',
        authMethod: 'UNKNOWN',
      };

      try {
        const errorResponse = await this.responseGenerationService.generateCamt029Response(
          request,
          errorValidationResult,
          errorMessage
        );

        return {
          messageId: request.messageId,
          puid: request.puid,
          success: false,
          responsePayload: errorResponse.responseXml,
          errorMessage,
          enrichmentData: errorEnrichmentData,
          validationResult: errorValidationResult,
          processedAt,
          responseType: ResponseType.CAMT029_REJECTION,
        };
      } catch (responseError) {
        // Fallback if response generation fails
        return {
          messageId: request.messageId,
          puid: request.puid,
          success: false,
          responsePayload: '',
          errorMessage: `Validation failed: ${errorMessage}. Response generation also failed: ${responseError instanceof Error ? responseError.message : 'Unknown error'}`,
          enrichmentData: errorEnrichmentData,
          validationResult: errorValidationResult,
          processedAt,
          responseType: ResponseType.ERROR_RESPONSE,
        };
      }
    }
  }

  /**
   * Parse XML message and extract relevant data
   */
  private async parseXmlMessage(xmlPayload: string): Promise<any> {
    try {
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
      const result = await parser.parseStringPromise(xmlPayload);
      
      logger.debug('XML parsed successfully', {
        rootElement: Object.keys(result)[0],
      });

      return result;
    } catch (error) {
      logger.error('Failed to parse XML message', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform account lookup via gRPC client
   */
  private async performAccountLookup(request: BusinessValidationRequest, parsedData: any): Promise<EnrichmentData> {
    try {
      // Extract account information from parsed XML
      const accountId = this.extractAccountId(parsedData, request.messageType);
      
      if (!accountId) {
        throw new Error('No account ID found in message');
      }

      logger.info('Performing account lookup', {
        messageId: request.messageId,
        accountId,
        messageType: request.messageType,
      });

      // Call account lookup service via gRPC
      const lookupResult = await this.accountLookupClient.lookupAccount({
        accountId,
        messageType: request.messageType,
        requestId: request.messageId,
      });

      logger.info('Account lookup completed', {
        messageId: request.messageId,
        accountId,
        statusCode: lookupResult.statusCode,
        isPhysical: lookupResult.isPhysical,
      });

      const enrichmentData: EnrichmentData = {
        receivedAcctId: accountId,
        lookupStatusCode: lookupResult.statusCode,
        lookupStatusDesc: lookupResult.statusDescription,
        normalizedAcctId: lookupResult.normalizedAccountId,
        matchedAcctId: lookupResult.matchedAccountId,
        partialMatch: lookupResult.partialMatch ? 'Y' : 'N',
        isPhysical: lookupResult.isPhysical ? 'Y' : 'N',
        authMethod: lookupResult.authMethod,
        physicalAcctInfo: lookupResult.physicalAccountInfo,
      };

      return enrichmentData;

    } catch (error) {
      logger.error('Account lookup failed', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Account lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate reference data via REST API
   */
  private async validateReferenceData(enrichmentData: EnrichmentData, parsedData: any): Promise<void> {
    try {
      // Extract reference data from parsed XML
      const currencyCode = this.extractCurrencyCode(parsedData);
      const countryCode = this.extractCountryCode(parsedData);
      const bankCode = this.extractBankCode(parsedData);

      logger.info('Validating reference data', {
        currencyCode,
        countryCode,
        bankCode,
      });

      const validationResult = await this.referenceDataClient.validateReferenceData({
        currencyCode,
        countryCode,
        bankCode,
      });

      // Add reference data validation results to enrichment data
      enrichmentData.referenceData = {
        currencyValid: validationResult.currencyValid,
        countryValid: validationResult.countryValid,
        bankValid: validationResult.bankValid,
        additionalData: {
          validationErrors: validationResult.errors.join(', '),
        },
      };

      logger.info('Reference data validation completed', {
        allValid: validationResult.allValid,
        errors: validationResult.errors,
      });

      if (!validationResult.allValid) {
        throw new Error(`Reference data validation failed: ${validationResult.errors.join(', ')}`);
      }

    } catch (error) {
      logger.error('Reference data validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Reference data validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate mandate for PACS003 messages
   */
  private async validateMandate(enrichmentData: EnrichmentData, parsedData: any): Promise<void> {
    try {
      const mandateId = this.extractMandateId(parsedData);
      
      if (!mandateId) {
        throw new Error('No mandate ID found in PACS003 message');
      }

      logger.info('Validating mandate', { mandateId });

      const mandateResult = await this.mandateLookupClient.validateMandate(mandateId);

      enrichmentData.mandateInfo = {
        mandateId,
        mandateStatus: mandateResult.status,
        mandateType: mandateResult.type,
        maxAmount: mandateResult.maxAmount,
        frequency: mandateResult.frequency,
      };

      if (!mandateResult.valid) {
        throw new Error(`Mandate validation failed: ${mandateResult.reason}`);
      }

    } catch (error) {
      logger.error('Mandate validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Mandate validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply business rules validation
   */
  private async applyBusinessRules(
    request: BusinessValidationRequest,
    enrichmentData: EnrichmentData,
    parsedData: any
  ): Promise<ValidationResult> {
    try {
      const validationResult: ValidationResult = {
        businessRulesPassed: true,
        validationErrors: [],
        warnings: [],
        riskScore: 'LOW',
      };

      // Rule 1: Account must be physical and active
      if (enrichmentData.isPhysical !== 'Y') {
        validationResult.validationErrors.push('Account is not a physical account');
        validationResult.businessRulesPassed = false;
      }

      if (enrichmentData.physicalAcctInfo?.acctOpsAttributes?.isActive !== 'Yes') {
        validationResult.validationErrors.push('Account is not active');
        validationResult.businessRulesPassed = false;
      }

      // Rule 2: Reference data must be valid
      if (enrichmentData.referenceData && !enrichmentData.referenceData.currencyValid) {
        validationResult.validationErrors.push('Invalid currency code');
        validationResult.businessRulesPassed = false;
      }

      if (enrichmentData.referenceData && !enrichmentData.referenceData.countryValid) {
        validationResult.validationErrors.push('Invalid country code');
        validationResult.businessRulesPassed = false;
      }

      if (enrichmentData.referenceData && !enrichmentData.referenceData.bankValid) {
        validationResult.validationErrors.push('Invalid bank code');
        validationResult.businessRulesPassed = false;
      }

      // Rule 3: Check account restraints
      const restraints = enrichmentData.physicalAcctInfo?.acctOpsAttributes?.restraints;
      if (restraints) {
        if (restraints.stopAll === 'Y') {
          validationResult.validationErrors.push('Account has stop all restraint');
          validationResult.businessRulesPassed = false;
        }

        if (restraints.stopCredits === 'Y' && this.isCreditTransaction(request.messageType)) {
          validationResult.validationErrors.push('Account has stop credits restraint');
          validationResult.businessRulesPassed = false;
        }

        if (restraints.stopDebits === 'Y' && this.isDebitTransaction(request.messageType)) {
          validationResult.validationErrors.push('Account has stop debits restraint');
          validationResult.businessRulesPassed = false;
        }
      }

      // Rule 4: Mandate validation for PACS003
      if (request.messageType === 'PACS003' && enrichmentData.mandateInfo) {
        if (enrichmentData.mandateInfo.mandateStatus !== 'Active') {
          validationResult.validationErrors.push('Mandate is not active');
          validationResult.businessRulesPassed = false;
        }
      }

      // Calculate risk score
      validationResult.riskScore = this.calculateRiskScore(validationResult, enrichmentData);

      logger.info('Business rules validation completed', {
        messageId: request.messageId,
        businessRulesPassed: validationResult.businessRulesPassed,
        errorCount: validationResult.validationErrors.length,
        warningCount: validationResult.warnings.length,
        riskScore: validationResult.riskScore,
      });

      return validationResult;

    } catch (error) {
      logger.error('Business rules validation failed', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        businessRulesPassed: false,
        validationErrors: [`Business rules validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        riskScore: 'HIGH',
      };
    }
  }

  // Helper methods for data extraction
  private extractAccountId(parsedData: any, messageType: string): string {
    // Implementation depends on message type and XML structure
    try {
      if (messageType === 'PACS008') {
        return parsedData?.Document?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAcct?.Id?.IBAN ||
               parsedData?.Document?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAcct?.Id?.Othr?.Id || '';
      } else if (messageType === 'PACS003') {
        return parsedData?.Document?.FIToFICstmrDrctDbt?.DrctDbtTxInf?.CdtrAcct?.Id?.IBAN ||
               parsedData?.Document?.FIToFICstmrDrctDbt?.DrctDbtTxInf?.CdtrAcct?.Id?.Othr?.Id || '';
      }
      return '';
    } catch (error) {
      logger.warn('Failed to extract account ID', { messageType, error: error instanceof Error ? error.message : 'Unknown error' });
      return '';
    }
  }

  private extractCurrencyCode(parsedData: any): string {
    try {
      return parsedData?.Document?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.IntrBkSttlmAmt?.Ccy ||
             parsedData?.Document?.FIToFICstmrDrctDbt?.DrctDbtTxInf?.IntrBkSttlmAmt?.Ccy || '';
    } catch (error) {
      return '';
    }
  }

  private extractCountryCode(parsedData: any): string {
    try {
      return parsedData?.Document?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry ||
             parsedData?.Document?.FIToFICstmrDrctDbt?.DrctDbtTxInf?.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry || '';
    } catch (error) {
      return '';
    }
  }

  private extractBankCode(parsedData: any): string {
    try {
      return parsedData?.Document?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAgt?.FinInstnId?.BICFI ||
             parsedData?.Document?.FIToFICstmrDrctDbt?.DrctDbtTxInf?.CdtrAgt?.FinInstnId?.BICFI || '';
    } catch (error) {
      return '';
    }
  }

  private extractMandateId(parsedData: any): string {
    try {
      return parsedData?.Document?.FIToFICstmrDrctDbt?.DrctDbtTxInf?.DrctDbtTx?.MndtRltdInf?.MndtId || '';
    } catch (error) {
      return '';
    }
  }

  // Helper methods for business logic
  private isCreditTransaction(messageType: string): boolean {
    return ['PACS008', 'PACS007'].includes(messageType);
  }

  private isDebitTransaction(messageType: string): boolean {
    return ['PACS003'].includes(messageType);
  }

  private calculateRiskScore(validationResult: ValidationResult, enrichmentData: EnrichmentData): string {
    let score = 0;

    // Higher score = higher risk
    if (validationResult.validationErrors.length > 0) {
      score += validationResult.validationErrors.length * 30;
    }

    if (validationResult.warnings.length > 0) {
      score += validationResult.warnings.length * 10;
    }

    if (enrichmentData.partialMatch === 'Y') {
      score += 20;
    }

    if (enrichmentData.lookupStatusCode !== 200) {
      score += 25;
    }

    if (score >= 70) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }
} 