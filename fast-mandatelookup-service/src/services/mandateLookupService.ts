import { logger } from '../utils/logger';
import { config } from '../config/default';

export interface MandateLookupRequest {
  messageId: string;
  puid: string;
  messageType: string;
  xmlPayload: string;
  debtorAccount: string;
  creditorAccount: string;
  mandateId?: string;
  amount: string;
  currency: string;
  metadata: { [key: string]: string };
}

export interface MandateLookupResponse {
  success: boolean;
  mandateReference: string;
  mandateStatus: MandateStatus;
  mandateDetails?: MandateDetails;
  validationErrors: string[];
  errorMessage: string;
  processedAt: number;
}

export interface MandateStatus {
  isValid: boolean;
  isActive: boolean;
  isExpired: boolean;
  statusCode: string;
  statusDescription: string;
}

export interface MandateDetails {
  mandateId: string;
  debtorAccount: string;
  creditorAccount: string;
  creationDate: string;
  expiryDate: string;
  maxAmount: string;
  frequency: string;
  mandateType: string;
  authorizationInfo: AuthorizationInfo;
}

export interface AuthorizationInfo {
  isAuthorized: boolean;
  authorizationMethod: string;
  authorizedBy: string;
  authorizationDate: string;
  restrictions: string[];
}

export class MandateLookupService {
  private useMockMode: boolean;

  constructor() {
    this.useMockMode = process.env.NODE_ENV === 'test' || process.env.USE_MOCK_MANDATES === 'true';
    
    logger.info('MandateLookupService initialized', {
      useMockMode: this.useMockMode
    });
  }

  async lookupMandate(request: MandateLookupRequest): Promise<MandateLookupResponse> {
    const startTime = Date.now();

    logger.info('Mandate lookup started', {
      messageId: request.messageId,
      puid: request.puid,
      debtorAccount: request.debtorAccount,
      mandateId: request.mandateId,
      useMockMode: this.useMockMode
    });

    try {
      // Validate request
      const validationError = this.validateRequest(request);
      if (validationError) {
        return this.createErrorResponse(request, validationError, 'VALIDATION_ERROR');
      }

      // Simulate processing delay
      if (this.useMockMode && config.mockResponseDelayMs > 0) {
        await this.delay(config.mockResponseDelayMs);
      }

      // Generate mandate decision based on account pattern
      const mandateDecision = this.generateMandateDecision(request);
      
      const processingTime = Date.now() - startTime;
      
      if (mandateDecision.isValid && mandateDecision.isActive && !mandateDecision.isExpired) {
        // Successful mandate validation
        const mandateDetails = this.createMandateDetails(request, mandateDecision);
        
        logger.info('Mandate lookup successful', {
          messageId: request.messageId,
          mandateReference: mandateDecision.mandateReference,
          mandateType: mandateDecision.mandateType,
          processingTime
        });

        return {
          success: true,
          mandateReference: mandateDecision.mandateReference,
          mandateStatus: {
            isValid: true,
            isActive: true,
            isExpired: false,
            statusCode: mandateDecision.statusCode,
            statusDescription: 'Mandate is valid and active'
          },
          mandateDetails,
          validationErrors: [],
          errorMessage: '',
          processedAt: Date.now()
        };
      } else {
        // Failed mandate validation
        const errorMessage = this.getErrorMessage(mandateDecision);
        
        logger.warn('Mandate lookup failed', {
          messageId: request.messageId,
          debtorAccount: request.debtorAccount,
          statusCode: mandateDecision.statusCode,
          errorMessage,
          processingTime
        });

        return {
          success: false,
          mandateReference: mandateDecision.mandateReference || '',
          mandateStatus: {
            isValid: mandateDecision.isValid,
            isActive: mandateDecision.isActive,
            isExpired: mandateDecision.isExpired,
            statusCode: mandateDecision.statusCode,
            statusDescription: errorMessage
          },
          validationErrors: [
            `${this.getErrorCode(mandateDecision.statusCode)}: ${mandateDecision.statusCode}`,
            errorMessage
          ],
          errorMessage,
          processedAt: Date.now()
        };
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Internal processing error';
      
      logger.error('Mandate lookup failed', {
        messageId: request.messageId,
        error: errorMessage,
        processingTime
      });

      return this.createErrorResponse(request, errorMessage, 'TECHNICAL_ERROR');
    }
  }

  private validateRequest(request: MandateLookupRequest): string | null {
    if (!request.messageId || request.messageId.trim().length === 0) {
      return 'Message ID is required';
    }

    if (!request.puid || request.puid.trim().length === 0) {
      return 'PUID is required';
    }

    if (!request.debtorAccount || request.debtorAccount.trim().length === 0) {
      return 'Debtor account is required';
    }

    if (!request.creditorAccount || request.creditorAccount.trim().length === 0) {
      return 'Creditor account is required';
    }

    if (!request.amount || parseFloat(request.amount) <= 0) {
      return 'Valid amount is required';
    }

    // For PACS.003 (DDI), mandate ID is required
    if (request.messageType === 'PACS.003' && (!request.mandateId || request.mandateId.trim().length === 0)) {
      return 'Mandate ID is required for Direct Debit Instructions';
    }

    return null;
  }

  private generateMandateDecision(request: MandateLookupRequest): MandateDecision {
    const accountPattern = request.debtorAccount.slice(-4);
    const mandateReference = this.generateMandateReference();
    
    switch (accountPattern) {
      case '1111':
        return {
          isValid: true,
          isActive: true,
          isExpired: false,
          statusCode: 'ACTIVE',
          mandateType: 'CORPORATE_DDI',
          authorizationMethod: 'DIGITAL_SIGNATURE',
          mandateReference
        };
        
      case '2222':
        return {
          isValid: true,
          isActive: true,
          isExpired: false,
          statusCode: 'ACTIVE',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT',
          mandateReference
        };
        
      case '3333':
        return {
          isValid: true,
          isActive: false,
          isExpired: false,
          statusCode: 'SUSPENDED',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT',
          mandateReference
        };
        
      case '4444':
        return {
          isValid: true,
          isActive: false,
          isExpired: true,
          statusCode: 'EXPIRED',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT',
          mandateReference
        };
        
      case '5555':
        return {
          isValid: false,
          isActive: false,
          isExpired: false,
          statusCode: 'NOT_FOUND',
          mandateType: null,
          authorizationMethod: null,
          mandateReference: ''
        };
        
      default:
        // Default to successful validation for other patterns
        return {
          isValid: true,
          isActive: true,
          isExpired: false,
          statusCode: 'ACTIVE',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT',
          mandateReference
        };
    }
  }

  private createMandateDetails(request: MandateLookupRequest, decision: MandateDecision): MandateDetails {
    const creationDate = new Date();
    creationDate.setFullYear(creationDate.getFullYear() - 1); // Created 1 year ago
    
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // Expires 1 year from now
    
    return {
      mandateId: request.mandateId || `DDI-${request.debtorAccount.slice(-6)}`,
      debtorAccount: request.debtorAccount,
      creditorAccount: request.creditorAccount,
      creationDate: this.formatDate(creationDate),
      expiryDate: this.formatDate(expiryDate),
      maxAmount: this.getMaxAmount(decision.mandateType),
      frequency: this.getFrequency(decision.mandateType),
      mandateType: decision.mandateType || 'CONSUMER_DDI',
      authorizationInfo: {
        isAuthorized: decision.isActive,
        authorizationMethod: decision.authorizationMethod || 'ELECTRONIC_CONSENT',
        authorizedBy: decision.mandateType === 'CORPORATE_DDI' ? 'COMPANY_DIRECTOR' : 'ACCOUNT_HOLDER',
        authorizationDate: this.formatDate(creationDate),
        restrictions: []
      }
    };
  }

  private getMaxAmount(mandateType: string | null): string {
    switch (mandateType) {
      case 'CORPORATE_DDI':
        return '50000.00';
      case 'CONSUMER_DDI':
        return '5000.00';
      default:
        return '1000.00';
    }
  }

  private getFrequency(mandateType: string | null): string {
    switch (mandateType) {
      case 'CORPORATE_DDI':
        return 'MONTHLY';
      case 'CONSUMER_DDI':
        return 'MONTHLY';
      default:
        return 'ON_DEMAND';
    }
  }

  private getErrorMessage(decision: MandateDecision): string {
    switch (decision.statusCode) {
      case 'NOT_FOUND':
        return 'No mandate found for the provided account';
      case 'EXPIRED':
        return 'Mandate has expired';
      case 'SUSPENDED':
        return 'Mandate is currently suspended';
      case 'INACTIVE':
        return 'Mandate is not active';
      default:
        return 'Mandate validation failed';
    }
  }

  private getErrorCode(statusCode: string): string {
    switch (statusCode) {
      case 'NOT_FOUND':
        return 'MND001';
      case 'EXPIRED':
        return 'MND002';
      case 'SUSPENDED':
        return 'MND003';
      case 'INACTIVE':
        return 'MND004';
      default:
        return 'MND999';
    }
  }

  private generateMandateReference(): string {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 14);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `MND-SG-${timestamp}-${random}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private createErrorResponse(request: MandateLookupRequest, errorMessage: string, errorCode: string): MandateLookupResponse {
    return {
      success: false,
      mandateReference: '',
      mandateStatus: {
        isValid: false,
        isActive: false,
        isExpired: false,
        statusCode: 'VALIDATION_ERROR',
        statusDescription: errorMessage
      },
      validationErrors: [`${errorCode}: ${errorMessage}`],
      errorMessage,
      processedAt: Date.now()
    };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      if (this.useMockMode) {
        return {
          status: 'SERVING',
          message: 'Mandate lookup service is healthy (mock mode)'
        };
      }

      // Future: Check database connectivity, etc.
      return {
        status: 'SERVING',
        message: 'Mandate lookup service is healthy'
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
    logger.info('Shutting down mandate lookup service');
  }
}

interface MandateDecision {
  isValid: boolean;
  isActive: boolean;
  isExpired: boolean;
  statusCode: string;
  mandateType: string | null;
  authorizationMethod: string | null;
  mandateReference: string;
} 