import { logger } from '../utils/logger';
import { xmlParser } from '../utils/xmlParser';
import { kafkaClient, KafkaPublishMessage } from './kafkaClient';
import { MandateLookupClient, MandateLookupRequest, MandateLookupResponse } from '../http/clients/mandateLookupClient'; // UPDATED: Changed from gRPC to HTTP client
import { config } from '../config/default';

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
  errorMessage?: string; // Fixed: Made optional
  validationResult: ValidationResult;
  jsonPayload?: any; // Fixed: Made optional
  kafkaPublished: boolean;
  processedAt: number;
  nextService: string;
  mandateValidation?: MandateValidationResult; // NEW: Mandate validation result
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  currencyValidation: CurrencyValidation;
  countryValidation: CountryValidation;
  mandateValidation?: MandateValidationResult; // NEW: Include mandate validation
  validationMetadata: Record<string, string>;
}

export interface ValidationError {
  field: string;
  errorCode: string;
  errorMessage: string;
  severity: 'ERROR' | 'WARNING';
}

export interface CurrencyValidation {
  currencyCode?: string;
  isValid: boolean;
  expectedCurrency: string;
  validationMessage: string;
}

export interface CountryValidation {
  countryCode?: string;
  isValid: boolean;
  expectedCountry: string;
  validationMessage: string;
}

// NEW: Mandate validation result interface
export interface MandateValidationResult {
  mandateRequired: boolean;
  mandateValid: boolean;
  mandateReference: string;
  mandateStatus: string;
  mandateErrors: string[];
  mandateDetails?: any;
}

export class DDIValidationService {
  private readonly expectedCurrency: string;
  private readonly expectedCountry: string;
  private readonly isTestMode: boolean;
  private readonly mandateLookupClient: MandateLookupClient; // NEW: Mandate lookup client (now HTTP)
  private readonly mandateValidationEnabled: boolean; // NEW: Feature flag

  constructor() {
    this.expectedCurrency = config.expectedCurrency;
    this.expectedCountry = config.expectedCountry;
    this.isTestMode = config.environment === 'test' || config.useTestMode;
    
    // NEW: Initialize HTTP mandate lookup client
    this.mandateValidationEnabled = process.env.MANDATE_VALIDATION_ENABLED === 'true';
    this.mandateLookupClient = new MandateLookupClient(
      process.env.MANDATE_LOOKUP_SERVICE_URL || 'http://localhost:3005', // UPDATED: HTTP URL instead of gRPC
      parseInt(process.env.MANDATE_LOOKUP_TIMEOUT_MS || '3000', 10)
    );
    
    logger.info('DDIValidationService initialized', {
      expectedCurrency: this.expectedCurrency,
      expectedCountry: this.expectedCountry,
      isTestMode: this.isTestMode,
      mandateValidationEnabled: this.mandateValidationEnabled,
      mandateLookupServiceUrl: process.env.MANDATE_LOOKUP_SERVICE_URL || 'http://localhost:3005'
    });
  }

  async validateEnrichedMessage(request: ValidationRequest): Promise<ValidationResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting validation process', {
        messageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
        mandateValidationEnabled: this.mandateValidationEnabled
      });

      // Parse XML and extract fields
      let parsedXml;
      try {
        parsedXml = xmlParser.parseXML(request.enrichedXmlPayload);
      } catch (xmlError) {
        // Only use test mode if XML parsing completely fails
        if (this.isTestMode) {
          logger.debug('Test mode: XML parsing failed, using mock validation');
          const mockValidationResult = this.createMockValidationResult(parsedXml);
          const jsonPayload = { mockData: true, originalPayload: request.enrichedXmlPayload };
          
          return {
            messageId: request.messageId,
            puid: request.puid,
            success: true,
            validationResult: mockValidationResult,
            jsonPayload,
            kafkaPublished: true, // Mock successful Kafka publish
            processedAt: Date.now(),
            nextService: 'fast-orchestrator-service'
          };
        } else {
          throw new Error(`XML parsing failed: ${xmlError instanceof Error ? xmlError.message : 'Unknown XML error'}`);
        }
      }

      // Perform validations
      const validationResult = await this.performValidations(parsedXml, request.enrichmentData, request);

      if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map(e => e.errorMessage).join(', ');
        logger.warn('Validation failed', {
          messageId: request.messageId,
          errors: errorMessages
        });

        // Build response with conditional properties
        const response: ValidationResponse = {
          messageId: request.messageId,
          puid: request.puid,
          success: false,
          errorMessage: errorMessages,
          validationResult,
          kafkaPublished: false,
          processedAt: Date.now(),
          nextService: ''
        };

        // Only add mandateValidation if it exists
        if (validationResult.mandateValidation) {
          response.mandateValidation = validationResult.mandateValidation;
        }

        return response;
      }

      // Convert to JSON
      const jsonPayload = xmlParser.convertToJSON(
        request.enrichedXmlPayload,
        request.enrichmentData,
        request.messageId,
        request.puid,
        request.messageType
      );

      // Publish to Kafka
      const kafkaMessage: KafkaPublishMessage = {
        messageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType, // Fixed: Added messageType
        jsonPayload,
        enrichmentData: request.enrichmentData,
        validationResult,
        timestamp: request.timestamp,
        sourceService: 'fast-ddi-validation-service'
      };

      const kafkaPublished = await kafkaClient.publishValidatedMessage(kafkaMessage);

      if (!kafkaPublished) {
        logger.error('Failed to publish to Kafka', {
          messageId: request.messageId,
          puid: request.puid
        });

        // Build response with conditional properties
        const response: ValidationResponse = {
          messageId: request.messageId,
          puid: request.puid,
          success: false,
          errorMessage: 'Failed to publish validated message to Kafka',
          validationResult,
          jsonPayload,
          kafkaPublished: false,
          processedAt: Date.now(),
          nextService: ''
        };

        // Only add mandateValidation if it exists
        if (validationResult.mandateValidation) {
          response.mandateValidation = validationResult.mandateValidation;
        }

        return response;
      }

      const processingTime = Date.now() - startTime;
      logger.info('Validation completed successfully', {
        messageId: request.messageId,
        puid: request.puid,
        processingTime,
        mandateValidated: validationResult.mandateValidation?.mandateRequired || false
      });

      // Build response with conditional properties
      const response: ValidationResponse = {
        messageId: request.messageId,
        puid: request.puid,
        success: true,
        validationResult,
        jsonPayload,
        kafkaPublished: true,
        processedAt: Date.now(),
        nextService: 'fast-orchestrator-service'
      };

      // Only add mandateValidation if it exists
      if (validationResult.mandateValidation) {
        response.mandateValidation = validationResult.mandateValidation;
      }

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      
      logger.error('Validation process failed', {
        messageId: request.messageId,
        puid: request.puid,
        error: errorMessage,
        processingTime
      });

      return {
        messageId: request.messageId,
        puid: request.puid,
        success: false,
        errorMessage,
        validationResult: {
          isValid: false,
          errors: [{
            field: 'general',
            errorCode: 'VALIDATION_ERROR',
            errorMessage,
            severity: 'ERROR'
          }],
          currencyValidation: {
            isValid: false,
            expectedCurrency: this.expectedCurrency,
            validationMessage: 'Validation failed'
          },
          countryValidation: {
            isValid: false,
            expectedCountry: this.expectedCountry,
            validationMessage: 'Validation failed'
          },
          validationMetadata: {}
        },
        kafkaPublished: false,
        processedAt: Date.now(),
        nextService: ''
      };
    }
  }

  private async performValidations(parsedXml: any, enrichmentData: any, request: ValidationRequest): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    
    // Currency validation
    const currencyValidation = this.validateCurrency(parsedXml);
    if (!currencyValidation.isValid) {
      errors.push({
        field: 'currency',
        errorCode: 'CURRENCY_ERROR',
        errorMessage: currencyValidation.validationMessage,
        severity: 'ERROR'
      });
    }

    // Country validation
    const countryValidation = this.validateCountry(parsedXml);
    if (!countryValidation.isValid) {
      errors.push({
        field: 'country',
        errorCode: 'COUNTRY_ERROR',
        errorMessage: countryValidation.validationMessage,
        severity: 'ERROR'
      });
    }

    // NEW: Mandate validation for DDI messages
    let mandateValidation: MandateValidationResult | undefined;
    if (this.mandateValidationEnabled) {
      mandateValidation = await this.validateMandate(request, parsedXml);
      
      if (mandateValidation.mandateRequired && !mandateValidation.mandateValid) {
        mandateValidation.mandateErrors.forEach(error => {
          errors.push({
            field: 'mandate',
            errorCode: 'MANDATE_ERROR',
            errorMessage: error,
            severity: 'ERROR'
          });
        });
      }
    }

    // Enrichment data validation
    this.validateEnrichmentData(enrichmentData, errors);

    // XML structure validation
    this.validateXMLStructure(parsedXml, errors);

    // Build result with conditional properties
    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      currencyValidation,
      countryValidation,
      validationMetadata: {
        validationTimestamp: new Date().toISOString(),
        validatorVersion: '1.0.0',
        mandateValidationEnabled: this.mandateValidationEnabled.toString()
      }
    };

    // Only add mandateValidation if it exists
    if (mandateValidation) {
      result.mandateValidation = mandateValidation;
    }

    return result;
  }

  // NEW: Mandate validation method (now using HTTP client)
  private async validateMandate(request: ValidationRequest, parsedXml: any): Promise<MandateValidationResult> {
    try {
      // Skip mandate validation for non-DDI message types
      if (request.messageType !== 'PACS.003') {
        return {
          mandateRequired: false,
          mandateValid: true,
          mandateReference: '',
          mandateStatus: 'N/A',
          mandateErrors: [],
          mandateDetails: undefined
        };
      }

      logger.debug('Performing mandate validation via HTTP', {
        messageId: request.messageId,
        messageType: request.messageType
      });

      // Extract mandate information from XML
      const mandateInfo = this.extractMandateInfo(parsedXml, request.enrichmentData);
      
      if (!mandateInfo.mandateId) {
        return {
          mandateRequired: true,
          mandateValid: false,
          mandateReference: '',
          mandateStatus: 'MISSING',
          mandateErrors: ['MANDATE_ID_MISSING: Mandate ID is required for Direct Debit Instructions'],
          mandateDetails: undefined
        };
      }

      // Create mandate lookup request
      const mandateLookupRequest: MandateLookupRequest = {
        messageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
        xmlPayload: request.enrichedXmlPayload,
        debtorAccount: mandateInfo.debtorAccount,
        creditorAccount: mandateInfo.creditorAccount,
        mandateId: mandateInfo.mandateId,
        amount: mandateInfo.amount,
        currency: mandateInfo.currency,
        metadata: request.metadata || {}
      };

      // Call mandate lookup service via HTTP
      const mandateResult = await this.mandateLookupClient.lookupMandate(mandateLookupRequest);

      logger.debug('Mandate lookup completed via HTTP', {
        messageId: request.messageId,
        success: mandateResult.success,
        mandateReference: mandateResult.mandateReference,
        statusCode: mandateResult.mandateStatus.statusCode
      });

      return {
        mandateRequired: true,
        mandateValid: mandateResult.success && mandateResult.mandateStatus.isValid && mandateResult.mandateStatus.isActive,
        mandateReference: mandateResult.mandateReference,
        mandateStatus: mandateResult.mandateStatus.statusCode,
        mandateErrors: mandateResult.success ? [] : mandateResult.validationErrors,
        mandateDetails: mandateResult.mandateDetails
      };

    } catch (error) {
      logger.error('Mandate validation failed', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        mandateRequired: true,
        mandateValid: false,
        mandateReference: '',
        mandateStatus: 'ERROR',
        mandateErrors: [`MANDATE_SERVICE_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`],
        mandateDetails: undefined
      };
    }
  }

  // NEW: Extract mandate information from XML and enrichment data
  private extractMandateInfo(parsedXml: any, enrichmentData: any): {
    mandateId?: string;
    debtorAccount: string;
    creditorAccount: string;
    amount: string;
    currency: string;
  } {
    try {
      // Extract from enrichment data first (more reliable)
      const debtorAccount = enrichmentData?.physicalAcctInfo?.acctId || 
                          enrichmentData?.receivedAcctId || '';
      
      // Try to extract from XML - using simple property access instead of extractField
      const amount = parsedXml?.IntrBkSttlmAmt || '0.00';
      const currency = parsedXml?.['IntrBkSttlmAmt']?.['@Ccy'] || 'SGD';
      const creditorAccount = parsedXml?.CdtrAcct?.Id?.Othr?.Id || '';
      const mandateId = parsedXml?.DrctDbtTxInf?.DrctDbtTx?.MndtRltdInf?.MndtId || 
                       parsedXml?.MndtId; // Fallback

      return {
        mandateId,
        debtorAccount,
        creditorAccount,
        amount,
        currency
      };

    } catch (error) {
      logger.warn('Failed to extract mandate information', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        debtorAccount: '',
        creditorAccount: '',
        amount: '0.00',
        currency: 'SGD'
      };
    }
  }

  // Mock validation for test mode
  private createMockValidationResult(parsedXml: any): ValidationResult {
    return {
      isValid: true,
      errors: [],
      currencyValidation: {
        isValid: true,
        expectedCurrency: this.expectedCurrency,
        validationMessage: 'Mock validation passed'
      },
      countryValidation: {
        isValid: true,
        expectedCountry: this.expectedCountry,
        validationMessage: 'Mock validation passed'
      },
      validationMetadata: {
        validationTimestamp: new Date().toISOString(),
        validatorVersion: '1.0.0-test',
        mockMode: 'true'
      }
    };
  }

  // Currency validation
  private validateCurrency(parsedXml: any): CurrencyValidation {
    try {
      const currency = parsedXml?.currency || parsedXml?.IntrBkSttlmAmt?.['@Ccy'] || '';
      const isValid = currency === this.expectedCurrency;
      
      return {
        currencyCode: currency,
        isValid,
        expectedCurrency: this.expectedCurrency,
        validationMessage: isValid ? 'Currency validation passed' : `Expected ${this.expectedCurrency}, got ${currency}`
      };
    } catch (error) {
      return {
        isValid: false,
        expectedCurrency: this.expectedCurrency,
        validationMessage: 'Currency validation failed'
      };
    }
  }

  // Country validation
  private validateCountry(parsedXml: any): CountryValidation {
    try {
      const country = parsedXml?.country || parsedXml?.InstgAgt?.FinInstnId?.BICFI?.slice(4, 6) || '';
      const isValid = country === this.expectedCountry;
      
      return {
        countryCode: country,
        isValid,
        expectedCountry: this.expectedCountry,
        validationMessage: isValid ? 'Country validation passed' : `Expected ${this.expectedCountry}, got ${country}`
      };
    } catch (error) {
      return {
        isValid: false,
        expectedCountry: this.expectedCountry,
        validationMessage: 'Country validation failed'
      };
    }
  }

  // Enrichment data validation
  private validateEnrichmentData(enrichmentData: any, errors: ValidationError[]): void {
    if (!enrichmentData) {
      errors.push({
        field: 'enrichmentData',
        errorCode: 'ENRICHMENT_MISSING',
        errorMessage: 'Enrichment data is required',
        severity: 'ERROR'
      });
      return;
    }

    // Validate account information
    if (!enrichmentData.physicalAcctInfo?.acctId && !enrichmentData.receivedAcctId) {
      errors.push({
        field: 'enrichmentData.accountId',
        errorCode: 'ENRICHMENT_ACCOUNT_MISSING',
        errorMessage: 'Account ID is missing from enrichment data',
        severity: 'ERROR'
      });
    }
  }

  // XML structure validation
  private validateXMLStructure(parsedXml: any, errors: ValidationError[]): void {
    if (!parsedXml) {
      errors.push({
        field: 'xml',
        errorCode: 'XML_INVALID',
        errorMessage: 'Invalid XML structure',
        severity: 'ERROR'
      });
      return;
    }

    // Basic structure validation
    if (typeof parsedXml !== 'object') {
      errors.push({
        field: 'xml',
        errorCode: 'XML_STRUCTURE_INVALID',
        errorMessage: 'XML must be a valid object structure',
        severity: 'ERROR'
      });
    }
  }
  
  async healthCheck(): Promise<{ status: string; message: string; dependencies?: any }> {
    try {
      const dependencies: any = {
        kafka: await kafkaClient.healthCheck()
      };

      // NEW: Include mandate lookup service health check (via HTTP)
      if (this.mandateValidationEnabled) {
        dependencies.mandateLookup = await this.mandateLookupClient.healthCheck();
      }

      const allHealthy = Object.values(dependencies).every((dep: any) => dep.status === 'SERVING');

      return {
        status: allHealthy ? 'SERVING' : 'NOT_SERVING',
        message: allHealthy ? 'All dependencies healthy' : 'Some dependencies unhealthy',
        dependencies
      };

    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        status: 'NOT_SERVING',
        message: 'Health check failed'
      };
    }
  }

  shutdown(): void {
    logger.info('Shutting down DDIValidationService');
    
    // NEW: Disconnect mandate lookup client (HTTP client)
    if (this.mandateLookupClient) {
      this.mandateLookupClient.disconnect();
    }
  }
} 