import { 
  AccountLookupRequest, 
  AccountLookupResponse, 
  EnrichmentData 
} from '../types/accountLookup';
import { MockDataGenerator } from './mockDataGenerator';
import { AccountUtils } from '../utils/accountUtils';
import { ERROR_CODES } from '../utils/constants';
import { logger } from '../utils/logger';
import { config } from '../config/default';

export class AccountLookupService {
  
  async lookupAccount(request: AccountLookupRequest): Promise<AccountLookupResponse> {
    const startTime = Date.now();
    
    logger.info('Account lookup request received', {
      messageId: request.messageId,
      puid: request.puid,
      cdtrAcctId: request.cdtrAcctId,
      messageType: request.messageType,
      timestamp: request.timestamp
    });

    try {
      // Validate input
      const validationError = this.validateRequest(request);
      if (validationError) {
        return this.createErrorResponse(request, validationError.code, validationError.message);
      }

      // Simulate processing delay if configured
      await MockDataGenerator.simulateDelay(config.mockResponseDelayMs);

      // Check if we should simulate an error based on account ID
      if (config.enableErrorScenarios && AccountUtils.shouldSimulateError(request.cdtrAcctId)) {
        return this.handleSimulatedError(request);
      }

      // Generate enrichment data
      const enrichmentData = this.generateEnrichmentData(request);

      const response: AccountLookupResponse = {
        messageId: request.messageId,
        puid: request.puid,
        success: true,
        enrichmentData,
        processedAt: Date.now(),
        lookupSource: config.isStubbed ? 'STUB' : 'DATABASE'
      };

      const processingTime = Date.now() - startTime;
      logger.info('Account lookup completed successfully', {
        messageId: request.messageId,
        puid: request.puid,
        processingTime,
        lookupSource: response.lookupSource,
        lookupStatusCode: enrichmentData.lookupStatusCode
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Account lookup failed with exception', {
        messageId: request.messageId,
        puid: request.puid,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      return this.createErrorResponse(
        request, 
        ERROR_CODES.PROCESSING_ERROR, 
        'Internal processing error occurred'
      );
    }
  }

  private validateRequest(request: AccountLookupRequest): { code: string; message: string } | null {
    if (!request.messageId || request.messageId.trim().length === 0) {
      return { code: ERROR_CODES.INVALID_INPUT, message: 'Message ID is required' };
    }

    if (!request.puid || request.puid.trim().length === 0) {
      return { code: ERROR_CODES.INVALID_INPUT, message: 'PUID is required' };
    }

    if (!request.cdtrAcctId || request.cdtrAcctId.trim().length === 0) {
      return { code: ERROR_CODES.INVALID_INPUT, message: 'CdtrAcct ID is required' };
    }

    if (!AccountUtils.validateAccountId(request.cdtrAcctId)) {
      return { 
        code: ERROR_CODES.INVALID_INPUT, 
        message: 'Invalid CdtrAcct ID format' 
      };
    }

    return null;
  }

  private handleSimulatedError(request: AccountLookupRequest): AccountLookupResponse {
    const errorType = AccountUtils.getErrorType(request.cdtrAcctId);
    
    switch (errorType) {
      case 'ACCOUNT_NOT_FOUND':
        return {
          messageId: request.messageId,
          puid: request.puid,
          success: false,
          errorCode: ERROR_CODES.ACCOUNT_NOT_FOUND,
          errorMessage: 'Account not found in system',
          enrichmentData: MockDataGenerator.generateAccountNotFoundResponse(request.cdtrAcctId),
          processedAt: Date.now(),
          lookupSource: 'STUB'
        };

      case 'ACCOUNT_INACTIVE':
        return {
          messageId: request.messageId,
          puid: request.puid,
          success: true, // Account found but inactive
          enrichmentData: MockDataGenerator.generateAccountInactiveResponse(request.cdtrAcctId),
          processedAt: Date.now(),
          lookupSource: 'STUB'
        };

      default:
        return this.createErrorResponse(
          request,
          ERROR_CODES.PROCESSING_ERROR,
          'Simulated processing error'
        );
    }
  }

  private generateEnrichmentData(request: AccountLookupRequest): EnrichmentData {
    // Use mock data generator to create Singapore banking data
    if (AccountUtils.isTestAccount(request.cdtrAcctId)) {
      return MockDataGenerator.generateVariedMockData(request.cdtrAcctId, request.messageType);
    } else {
      return MockDataGenerator.generateMockEnrichmentData(request.cdtrAcctId, request.messageType);
    }
  }

  private createErrorResponse(
    request: AccountLookupRequest, 
    errorCode: string, 
    errorMessage: string
  ): AccountLookupResponse {
    return {
      messageId: request.messageId,
      puid: request.puid,
      success: false,
      errorCode,
      errorMessage,
      processedAt: Date.now(),
      lookupSource: config.isStubbed ? 'STUB' : 'DATABASE'
    };
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; message: string; timestamp: number }> {
    try {
      // Simulate basic health checks
      const checks = [
        this.checkServiceConfiguration(),
        this.checkMockDataGeneration()
      ];

      const allHealthy = checks.every(check => check.healthy);

      return {
        status: allHealthy ? 'SERVING' : 'NOT_SERVING',
        message: allHealthy ? 'Service is healthy' : 'Service has issues',
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        status: 'NOT_SERVING',
        message: 'Health check failed',
        timestamp: Date.now()
      };
    }
  }

  private checkServiceConfiguration(): { healthy: boolean; message: string } {
    try {
      // Validate essential configuration
      if (!config.grpcPort || config.grpcPort <= 0) {
        return { healthy: false, message: 'Invalid gRPC port configuration' };
      }

      if (!config.country || !config.defaultCurrency) {
        return { healthy: false, message: 'Missing country or currency configuration' };
      }

      return { healthy: true, message: 'Configuration is valid' };
    } catch (error) {
      return { healthy: false, message: 'Configuration check failed' };
    }
  }

  private checkMockDataGeneration(): { healthy: boolean; message: string } {
    try {
      // Test mock data generation
      const testData = MockDataGenerator.generateMockEnrichmentData('TEST123', 'PACS008');
      
      if (!testData || !testData.receivedAcctId) {
        return { healthy: false, message: 'Mock data generation failed' };
      }

      return { healthy: true, message: 'Mock data generation working' };
    } catch (error) {
      return { healthy: false, message: 'Mock data generation check failed' };
    }
  }

  // Service info method
  getServiceInfo(requester: string): any {
    logger.info('Service info requested', { requester });
    
    return {
      serviceName: config.serviceName,
      version: '1.0.0',
      buildTime: new Date().toISOString(),
      capabilities: [
        'account-lookup',
        'singapore-banking-data',
        'mock-data-generation',
        'error-simulation'
      ],
      isStubbed: config.isStubbed,
      environment: config.environment
    };
  }
} 