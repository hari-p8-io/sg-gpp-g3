import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import * as xml2js from 'xml2js';

export interface ProcessorRequest {
  messageId: string;
  puid: string;
  messageType: string;
  xmlPayload: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface ValidationResult {
  businessRulesPassed: boolean;
  validationErrors: string[];
  warnings: string[];
  riskScore: string;
}

export interface EnrichmentData {
  receivedAcctId: string;
  lookupStatusCode: number;
  lookupStatusDesc: string;
  normalizedAcctId: string;
  matchedAcctId: string;
  partialMatch: string;
  isPhysical: string;
  authMethod: string;
  physicalAcctInfo?: any;
  referenceData?: {
    currencyValid: boolean;
    countryValid: boolean;
    bankValid: boolean;
    additionalData?: Record<string, string>;
  };
  mandateInfo?: {
    mandateId: string;
    mandateStatus: string;
    mandateType: string;
    maxAmount: string;
    frequency: string;
  };
}

export enum ResponseType {
  PACS002_ACCEPTANCE = 'PACS002_ACCEPTANCE',
  CAMT029_REJECTION = 'CAMT029_REJECTION',
  ERROR_RESPONSE = 'ERROR_RESPONSE',
}

export interface ResponseGenerationResult {
  success: boolean;
  responseXml: string;
  responseType: ResponseType;
  errorMessage?: string;
}

export class ResponseGenerationService {
  private xmlBuilder: xml2js.Builder;

  constructor() {
    this.xmlBuilder = new xml2js.Builder({
      rootName: 'Document',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    });
  }

  /**
   * Generate PACS002 acceptance response
   */
  async generatePacs002Response(
    request: ProcessorRequest,
    validationResult: ValidationResult,
    enrichmentData: EnrichmentData
  ): Promise<ResponseGenerationResult> {
    try {
      logger.info('Generating PACS002 acceptance response', {
        messageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
      });

      const responseId = uuidv4();
      const currentTimestamp = new Date().toISOString();

      const pacs002Document = {
        '$': {
          'xmlns': 'urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        },
        'FIToFIPmtStsRpt': {
          'GrpHdr': {
            'MsgId': responseId,
            'CreDtTm': currentTimestamp,
            'InstgAgt': {
              'FinInstnId': {
                'BICFI': enrichmentData.physicalAcctInfo?.bicfi || 'GPPSGSGXXXX',
              },
            },
            'InstdAgt': {
              'FinInstnId': {
                'BICFI': enrichmentData.physicalAcctInfo?.bicfi || 'GPPSGSGXXXX',
              },
            },
          },
          'TxInfAndSts': {
            'OrgnlInstrId': request.messageId,
            'OrgnlEndToEndId': request.puid,
            'TxSts': 'ACCP', // Accepted Customer Credit Transfer
            'StsRsnInf': {
              'Rsn': {
                'Cd': 'AC01', // Correct Account Number
              },
              'AddtlInf': [
                'Payment accepted for processing',
                `Account system: ${enrichmentData.physicalAcctInfo?.acctSys || 'Unknown'}`,
                `Auth method: ${enrichmentData.authMethod}`,
              ],
            },
            'AccptncDtTm': currentTimestamp,
            'InstgAgt': {
              'FinInstnId': {
                'BICFI': enrichmentData.physicalAcctInfo?.bicfi || 'GPPSGSGXXXX',
              },
            },
            'InstdAgt': {
              'FinInstnId': {
                'BICFI': enrichmentData.physicalAcctInfo?.bicfi || 'GPPSGSGXXXX',
              },
            },
          },
        },
      };

      const responseXml = this.xmlBuilder.buildObject(pacs002Document);

      logger.info('PACS002 response generated successfully', {
        messageId: request.messageId,
        responseId,
        responseLength: responseXml.length,
      });

      return {
        success: true,
        responseXml,
        responseType: ResponseType.PACS002_ACCEPTANCE,
      };
    } catch (error) {
      logger.error('Failed to generate PACS002 response', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        responseXml: '',
        responseType: ResponseType.ERROR_RESPONSE,
        errorMessage: `Failed to generate PACS002 response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate CAMT029 rejection response
   */
  async generateCamt029Response(
    request: ProcessorRequest,
    validationResult: ValidationResult,
    rejectionReason: string
  ): Promise<ResponseGenerationResult> {
    try {
      logger.info('Generating CAMT029 rejection response', {
        messageId: request.messageId,
        puid: request.puid,
        rejectionReason,
      });

      const responseId = uuidv4();
      const currentTimestamp = new Date().toISOString();

      const camt029Document = {
        '$': {
          'xmlns': 'urn:iso:std:iso:20022:tech:xsd:camt.029.001.09',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        },
        'RsltnOfInvstgtn': {
          'GrpHdr': {
            'MsgId': responseId,
            'CreDtTm': currentTimestamp,
            'InstgAgt': {
              'FinInstnId': {
                'BICFI': 'GPPSGSGXXXX',
              },
            },
            'InstdAgt': {
              'FinInstnId': {
                'BICFI': 'GPPSGSGXXXX',
              },
            },
          },
          'InvstgtnSts': {
            'ConfInstr': {
              'OrgnlInstrId': request.messageId,
              'OrgnlEndToEndId': request.puid,
              'OrgnlTxId': request.messageId,
            },
            'InvstgtnSts': 'RJCT', // Rejected
            'StsRsnInf': {
              'Rsn': {
                'Cd': this.mapRejectionReasonCode(rejectionReason),
              },
              'AddtlInf': [
                rejectionReason,
                ...validationResult.validationErrors.slice(0, 3), // Limit to 3 errors
              ],
            },
            'RjctdTxInf': {
              'OrgnlInstrId': request.messageId,
              'OrgnlEndToEndId': request.puid,
              'OrgnlTxId': request.messageId,
              'RjctdDtTm': currentTimestamp,
            },
          },
        },
      };

      const responseXml = this.xmlBuilder.buildObject(camt029Document);

      logger.info('CAMT029 response generated successfully', {
        messageId: request.messageId,
        responseId,
        rejectionReason,
        responseLength: responseXml.length,
      });

      return {
        success: true,
        responseXml,
        responseType: ResponseType.CAMT029_REJECTION,
      };
    } catch (error) {
      logger.error('Failed to generate CAMT029 response', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        responseXml: '',
        responseType: ResponseType.ERROR_RESPONSE,
        errorMessage: `Failed to generate CAMT029 response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate appropriate response based on validation result
   */
  async generateResponse(
    request: ProcessorRequest,
    validationResult: ValidationResult,
    enrichmentData: EnrichmentData
  ): Promise<ResponseGenerationResult> {
    try {
      if (validationResult.businessRulesPassed) {
        return await this.generatePacs002Response(request, validationResult, enrichmentData);
      } else {
        const rejectionReason = validationResult.validationErrors.length > 0
          ? validationResult.validationErrors[0]
          : 'Business validation failed';

        return await this.generateCamt029Response(request, validationResult, rejectionReason);
      }
    } catch (error) {
      logger.error('Failed to generate response', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        responseXml: '',
        responseType: ResponseType.ERROR_RESPONSE,
        errorMessage: `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Map rejection reason to ISO20022 reason code
   */
  private mapRejectionReasonCode(rejectionReason: string): string {
    const reasonMappings: Record<string, string> = {
      'invalid_account': 'AC01',
      'invalid_currency': 'CURR',
      'invalid_amount': 'AM01',
      'insufficient_funds': 'AM04',
      'account_blocked': 'AC04',
      'invalid_mandate': 'MD01',
      'mandate_expired': 'MD02',
      'duplicate_transaction': 'DUPL',
      'business_rule_violation': 'NARR',
      'reference_data_error': 'REGD',
    };

    // Try to find a matching reason code
    for (const [key, code] of Object.entries(reasonMappings)) {
      if (rejectionReason.toLowerCase().includes(key)) {
        return code;
      }
    }

    // Default to NARR (Narrative) for unrecognized reasons
    return 'NARR';
  }

  /**
   * Validate generated response XML
   */
  async validateResponseXml(responseXml: string, responseType: ResponseType): Promise<boolean> {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(responseXml);

      if (!result) {
        return false;
      }

      // Additional validation based on response type
      if (responseType === ResponseType.PACS002_ACCEPTANCE) {
        return responseXml.includes('FIToFIPmtStsRpt') && responseXml.includes('ACCP');
      } else if (responseType === ResponseType.CAMT029_REJECTION) {
        return responseXml.includes('RsltnOfInvstgtn') && responseXml.includes('RJCT');
      }

      return true;
    } catch (error) {
      logger.error('Failed to validate response XML', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseType,
      });
      return false;
    }
  }
} 