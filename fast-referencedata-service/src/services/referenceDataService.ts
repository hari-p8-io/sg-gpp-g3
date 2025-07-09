import { v4 as uuidv4 } from 'uuid';
import { logger, logAuthMethodRequest, logAuthMethodResponse, logError } from '../utils/logger';
import { config } from '../config/default';

export interface AuthMethodRequest {
  messageId: string;
  puid: string;
  acctSys: string;
  acctGrp: string;
  acctId: string;
  country: string;
  currencyCode: string;
  metadata: { [key: string]: string };
  timestamp: number;
}

export interface AuthMethodResponse {
  messageId: string;
  puid: string;
  success: boolean;
  authMethod?: string;
  errorMessage?: string;
  errorCode?: string;
  refDataDetails?: ReferenceDataDetails;
  processedAt: number;
  lookupSource: string;
}

export interface ReferenceDataDetails {
  acctSys: string;
  acctGrp: string;
  acctId: string;
  country: string;
  currencyCode: string;
  authMethod: string;
  riskLevel: string;
  limitProfile: string;
  requiresApproval: boolean;
  additionalAttributes: { [key: string]: string };
}

export class ReferenceDataService {
  private useMockData: boolean;

  constructor() {
    this.useMockData = config.useMockData;
  }

  async lookupAuthMethod(request: AuthMethodRequest): Promise<AuthMethodResponse> {
    const startTime = Date.now();

    logAuthMethodRequest(request.messageId, request.puid, request.acctId, request.acctSys);

    try {
      // Validate input
      const validationError = this.validateRequest(request);
      if (validationError) {
        return this.createErrorResponse(request, validationError);
      }

      // Determine authentication method based on account ID
      const authMethod = this.determineAuthMethod(request.acctId);
      
      // Create reference data details
      const refDataDetails = this.createReferenceDataDetails(request, authMethod);

      const processingTime = Date.now() - startTime;
      
      logAuthMethodResponse(request.messageId, authMethod, true, processingTime);

      return {
        messageId: request.messageId,
        puid: request.puid,
        success: true,
        authMethod,
        refDataDetails,
        processedAt: Date.now(),
        lookupSource: this.useMockData ? 'MOCK' : 'STUB'
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logError(request.messageId, error instanceof Error ? error : new Error('Unknown error'), {
        puid: request.puid,
        acctId: request.acctId,
        processingTime
      });

      return this.createErrorResponse(request, 
        error instanceof Error ? error.message : 'Internal processing error'
      );
    }
  }

  private validateRequest(request: AuthMethodRequest): string | null {
    if (!request.messageId?.trim()) {
      return 'messageId is required';
    }
    if (!request.puid?.trim()) {
      return 'puid is required';
    }
    if (!request.acctId?.trim()) {
      return 'acctId is required';
    }
    if (!request.acctSys?.trim()) {
      return 'acctSys is required';
    }
    if (!request.country?.trim()) {
      return 'country is required';
    }
    if (!request.currencyCode?.trim()) {
      return 'currencyCode is required';
    }
    return null;
  }

  private determineAuthMethod(acctId: string): string {
    // Business logic to determine authentication method based on account ID
    // This is a simplified implementation - in production, this would query a database
    
    // Remove any spaces and convert to uppercase for comparison
    const normalizedAcctId = acctId.trim().toUpperCase();
    
    // Pattern-based authentication method determination
    if (normalizedAcctId.startsWith('999') || normalizedAcctId.startsWith('VAM')) {
      // VAM accounts typically require group limits
      return 'GROUPLIMIT';
    }
    
    if (normalizedAcctId.startsWith('888') || normalizedAcctId.includes('CORP')) {
      // Corporate accounts use AFP then limits
      return 'AFPTHENLIMIT';
    }
    
    if (normalizedAcctId.startsWith('777') || normalizedAcctId.includes('PRIV')) {
      // Private accounts use AFP only
      return 'AFPONLY';
    }
    
    // Account ID length based rules
    if (normalizedAcctId.length >= 12) {
      // Long account IDs typically require group limits
      return 'GROUPLIMIT';
    }
    
    if (normalizedAcctId.length >= 8) {
      // Medium length accounts use AFP then limits
      return 'AFPTHENLIMIT';
    }
    
    // Default to AFP only for other cases
    return 'AFPONLY';
  }

  private createReferenceDataDetails(request: AuthMethodRequest, authMethod: string): ReferenceDataDetails {
    // Determine risk level based on authentication method
    const riskLevel = this.determineRiskLevel(authMethod);
    
    // Determine limit profile based on account system and group
    const limitProfile = this.determineLimitProfile(request.acctSys, request.acctGrp, authMethod);
    
    // Determine if approval is required
    const requiresApproval = authMethod === 'GROUPLIMIT';

    return {
      acctSys: request.acctSys,
      acctGrp: request.acctGrp,
      acctId: request.acctId,
      country: request.country,
      currencyCode: request.currencyCode,
      authMethod,
      riskLevel,
      limitProfile,
      requiresApproval,
      additionalAttributes: {
        evaluatedAt: new Date().toISOString(),
        evaluationRules: 'account_id_pattern_based',
        sourceSystem: 'fast-referencedata-service',
        ...request.metadata
      }
    };
  }

  private determineRiskLevel(authMethod: string): string {
    switch (authMethod) {
      case 'GROUPLIMIT':
        return 'HIGH';
      case 'AFPTHENLIMIT':
        return 'MEDIUM';
      case 'AFPONLY':
        return 'LOW';
      default:
        return 'MEDIUM';
    }
  }

  private determineLimitProfile(acctSys: string, acctGrp: string, authMethod: string): string {
    // Create limit profile based on account system, group, and auth method
    const base = `${acctSys}_${acctGrp}`;
    
    switch (authMethod) {
      case 'GROUPLIMIT':
        return `${base}_GROUP_LIMITS`;
      case 'AFPTHENLIMIT':
        return `${base}_AFP_THEN_LIMITS`;
      case 'AFPONLY':
        return `${base}_AFP_ONLY`;
      default:
        return `${base}_STANDARD`;
    }
  }

  private createErrorResponse(request: AuthMethodRequest, errorMessage: string, errorCode?: string): AuthMethodResponse {
    return {
      messageId: request.messageId,
      puid: request.puid,
      success: false,
      errorMessage,
      errorCode: errorCode || 'REFDATA_ERROR',
      processedAt: Date.now(),
      lookupSource: this.useMockData ? 'MOCK' : 'STUB'
    };
  }
} 