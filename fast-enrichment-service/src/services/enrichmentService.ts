import { v4 as uuidv4 } from 'uuid';
import { XMLParser } from '../utils/xmlParser';
import { AccountLookupClient, AccountLookupRequest } from '../grpc/clients/accountLookupClient';
import { ReferenceDataClient } from '../grpc/clients/referenceDataClient';
import { ValidationClient, ValidationRequest } from '../grpc/clients/validationClient';
import { logger } from '../utils/logger';
import { config } from '../config/default';

export interface EnrichmentRequest {
  messageId: string;
  puid: string;
  messageType: string;
  xmlPayload: string;
  metadata: { [key: string]: string };
  timestamp: number;
}

export interface EnrichmentResponse {
  messageId: string;
  puid: string;
  success: boolean;
  enrichedPayload?: string;
  errorMessage?: string;
  enrichmentData?: any;
  processedAt: number;
  nextService: string;
}

export class EnrichmentService {
  private accountLookupClient: AccountLookupClient;
  private referenceDataClient: ReferenceDataClient;
  private validationClient: ValidationClient;
  private useMockMode: boolean;

  constructor() {
    this.accountLookupClient = new AccountLookupClient();
    this.referenceDataClient = new ReferenceDataClient();
    this.validationClient = new ValidationClient('localhost:50053');
    this.useMockMode = process.env.NODE_ENV === 'test' || process.env.USE_MOCK_MODE === 'true';
  }

  async enrichPacsMessage(request: EnrichmentRequest): Promise<EnrichmentResponse> {
    const startTime = Date.now();

    logger.info('PACS message enrichment started', {
      messageId: request.messageId,
      puid: request.puid,
      messageType: request.messageType,
      useMockMode: this.useMockMode
    });

    try {
      // Validate input
      const validationError = this.validateRequest(request);
      if (validationError) {
        return this.createErrorResponse(request, validationError);
      }

      // Extract CdtrAcct from XML payload
      const cdtrAcct = await XMLParser.extractCdtrAcct(request.xmlPayload);
      if (!cdtrAcct) {
        return this.createErrorResponse(request, 'Could not extract CdtrAcct from XML payload');
      }

      logger.debug('CdtrAcct extracted from XML', {
        messageId: request.messageId,
        cdtrAcct
      });

      let lookupResponse;

      if (this.useMockMode) {
        // Use mock data when in test mode or when account lookup service is not available
        lookupResponse = this.createMockLookupResponse(request, cdtrAcct);
        logger.debug('Using mock account lookup data', {
          messageId: request.messageId,
          cdtrAcct
        });
      } else {
        // Try to call account lookup service
        try {
          const lookupRequest: AccountLookupRequest = {
            messageId: request.messageId,
            puid: request.puid,
            cdtrAcctId: cdtrAcct,
            messageType: request.messageType,
            metadata: {
              ...request.metadata,
              extractedFrom: 'xml_payload',
              enrichmentService: 'fast-enrichment-service'
            },
            timestamp: Date.now()
          };

          lookupResponse = await this.accountLookupClient.lookupAccount(lookupRequest);
        } catch (error) {
          logger.warn('Account lookup service unavailable, falling back to mock data', {
            messageId: request.messageId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Fallback to mock data if account lookup service is unavailable
          lookupResponse = this.createMockLookupResponse(request, cdtrAcct);
        }
      }

      if (!lookupResponse.success) {
        return this.createErrorResponse(request, 
          `Account lookup failed: ${lookupResponse.errorMessage}`,
          lookupResponse.errorCode
        );
      }

      logger.info('Account lookup completed successfully', {
        messageId: request.messageId,
        cdtrAcct,
        lookupSource: lookupResponse.lookupSource
      });

      // Call reference data service to get auth method
      let authMethod: string = 'AFPONLY'; // default
      try {
        const referenceDataResponse = await this.referenceDataClient.lookupAuthMethod({
          messageId: request.messageId,
          puid: request.puid,
          acctSys: lookupResponse.enrichmentData?.physicalAcctInfo?.acctSys || 'MDZ',
          acctGrp: lookupResponse.enrichmentData?.physicalAcctInfo?.acctGroup || 'SGB',
          acctId: cdtrAcct,
          country: lookupResponse.enrichmentData?.physicalAcctInfo?.country || 'SG',
          currencyCode: lookupResponse.enrichmentData?.physicalAcctInfo?.currencyCode || 'SGD',
          metadata: request.metadata || {},
          timestamp: Date.now()
        });

        if (referenceDataResponse.success && referenceDataResponse.authMethod) {
          authMethod = referenceDataResponse.authMethod;
          logger.info('Reference data lookup completed', {
            messageId: request.messageId,
            authMethod
          });
        } else {
          logger.warn('Reference data lookup failed, using default auth method', {
            messageId: request.messageId,
            error: referenceDataResponse.errorMessage
          });
        }
      } catch (error) {
        logger.warn('Reference data service unavailable, using default auth method', {
          messageId: request.messageId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Add auth method to enrichment data
      lookupResponse.enrichmentData.authMethod = authMethod;

      // Create enriched XML payload
      const enrichedPayload = this.createEnrichedXML(request.xmlPayload, lookupResponse.enrichmentData);

      logger.info('Enrichment completed, calling validation service', {
        messageId: request.messageId,
        puid: request.puid,
        authMethod
      });

      // Call validation service as per the flow specification
      try {
        const validationRequest: ValidationRequest = {
          messageId: request.messageId,
          puid: request.puid,
          messageType: request.messageType,
          enrichedXmlPayload: enrichedPayload,
          enrichmentData: lookupResponse.enrichmentData,
          timestamp: Date.now(),
          metadata: request.metadata
        };

        const validationResponse = await this.validationClient.validateEnrichedMessage(validationRequest);

        if (validationResponse.success) {
          logger.info('Validation completed successfully, message published to Kafka', {
            messageId: request.messageId,
            puid: request.puid,
            kafkaPublished: validationResponse.kafkaPublished
          });

          return {
            messageId: request.messageId,
            puid: request.puid,
            success: true,
            enrichedPayload,
            enrichmentData: lookupResponse.enrichmentData,
            processedAt: Date.now(),
            nextService: 'fast-orchestrator-service'
          };
        } else {
          logger.error('Validation failed', {
            messageId: request.messageId,
            error: validationResponse.errorMessage
          });

          return this.createErrorResponse(request, 
            `Validation failed: ${validationResponse.errorMessage}`
          );
        }
      } catch (error) {
        logger.error('Validation service call failed', {
          messageId: request.messageId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        return this.createErrorResponse(request, 
          `Validation service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('PACS message enrichment failed', {
        messageId: request.messageId,
        puid: request.puid,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      return this.createErrorResponse(request, 
        error instanceof Error ? error.message : 'Internal processing error'
      );
    }
  }

  private validateRequest(request: EnrichmentRequest): string | null {
    if (!request.messageId || request.messageId.trim().length === 0) {
      return 'Message ID is required';
    }

    if (!request.puid || request.puid.trim().length === 0) {
      return 'PUID is required';
    }

    if (!request.xmlPayload || request.xmlPayload.trim().length === 0) {
      return 'XML payload is required';
    }

    if (!XMLParser.validateXML(request.xmlPayload)) {
      return 'Invalid XML payload format';
    }

    if (!XMLParser.isPACSMessage(request.xmlPayload)) {
      return 'XML payload is not a valid PACS message';
    }

    return null;
  }

  private createEnrichedXML(originalXML: string, enrichmentData: any): string {
    try {
      if (!enrichmentData || !enrichmentData.physicalAcctInfo) {
        // Return original XML if no enrichment data
        return originalXML;
      }

      const physicalInfo = enrichmentData.physicalAcctInfo;

      // Create enrichment XML block
      const enrichmentBlock = `
  <!-- Singapore Banking Enrichment Data -->
  <SgEnrichmentInfo>
    <AcctLookupData>
      <ReceivedAcctId>${enrichmentData.receivedAcctId}</ReceivedAcctId>
      <NormalizedAcctId>${enrichmentData.normalizedAcctId}</NormalizedAcctId>
      <LookupStatus>
        <Code>${enrichmentData.lookupStatusCode}</Code>
        <Description>${enrichmentData.lookupStatusDesc}</Description>
      </LookupStatus>
    </AcctLookupData>
    <PhysicalAcctInfo>
      <AcctId>${physicalInfo.acctId}</AcctId>
      <AcctSys>${physicalInfo.acctSys}</AcctSys>
      <AcctGroup>${physicalInfo.acctGroup}</AcctGroup>
      <Country>${physicalInfo.country}</Country>
      ${physicalInfo.branchId ? `<BranchId>${physicalInfo.branchId}</BranchId>` : ''}
      <AcctAttributes>
        <AcctType>${physicalInfo.acctAttributes.acctType}</AcctType>
        <AcctCategory>${physicalInfo.acctAttributes.acctCategory}</AcctCategory>
        <AcctPurpose>${physicalInfo.acctAttributes.acctPurpose}</AcctPurpose>
      </AcctAttributes>
      <AcctOpsAttributes>
        <IsActive>${physicalInfo.acctOpsAttributes.isActive}</IsActive>
        <AcctStatus>${physicalInfo.acctOpsAttributes.acctStatus}</AcctStatus>
        <OpenDate>${physicalInfo.acctOpsAttributes.openDate}</OpenDate>
        <ExpiryDate>${physicalInfo.acctOpsAttributes.expiryDate}</ExpiryDate>
        <Restraints>
          <StopAll>${physicalInfo.acctOpsAttributes.restraints.stopAll}</StopAll>
          <StopDebits>${physicalInfo.acctOpsAttributes.restraints.stopDebits}</StopDebits>
          <StopCredits>${physicalInfo.acctOpsAttributes.restraints.stopCredits}</StopCredits>
          <Warnings>${Array.isArray(physicalInfo.acctOpsAttributes.restraints.warnings) ? physicalInfo.acctOpsAttributes.restraints.warnings.join(', ') : physicalInfo.acctOpsAttributes.restraints.warnings}</Warnings>
        </Restraints>
      </AcctOpsAttributes>
      <Bicfi>${physicalInfo.bicfi}</Bicfi>
      <CurrencyCode>${physicalInfo.currencyCode}</CurrencyCode>
    </PhysicalAcctInfo>
    <EnrichmentMeta>
      <ProcessedAt>${new Date().toISOString()}</ProcessedAt>
      <ServiceVersion>1.0.0</ServiceVersion>
      <Timezone>Asia/Singapore</Timezone>
    </EnrichmentMeta>
  </SgEnrichmentInfo>`;

      // Insert enrichment data before closing Document tag
      const enrichedXML = originalXML.replace(
        /<\/Document>/,
        `${enrichmentBlock}
</Document>`
      );

      return enrichedXML;

    } catch (error) {
      logger.error('Error creating enriched XML', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return originalXML;
    }
  }

  private createErrorResponse(request: EnrichmentRequest, errorMessage: string, errorCode?: string): EnrichmentResponse {
    return {
      messageId: request.messageId,
      puid: request.puid,
      success: false,
      errorMessage,
      processedAt: Date.now(),
      nextService: ''
    };
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      // When in mock mode, return healthy regardless of external dependencies
      if (this.useMockMode) {
        return {
          status: 'SERVING',
          message: 'Enrichment service is healthy (mock mode)'
        };
      }

      // Check account lookup service health
      const accountLookupHealth = await this.accountLookupClient.healthCheck();
      
      if (accountLookupHealth.status !== 'SERVING') {
        return {
          status: 'NOT_SERVING',
          message: `Account lookup service not available: ${accountLookupHealth.message}`
        };
      }

      return {
        status: 'SERVING',
        message: 'Enrichment service is healthy'
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
    logger.info('Shutting down enrichment service');
    this.accountLookupClient.disconnect();
  }

  private createMockLookupResponse(request: EnrichmentRequest, cdtrAcct: string): any {
    // Generate mock enrichment data based on account ID patterns
    const accountType = this.determineMockAccountType(cdtrAcct);
    const accountCategory = this.determineMockAccountCategory(accountType);
    
    // Handle error scenarios first
    if (cdtrAcct.includes('NOTFOUND')) {
      return {
        messageId: request.messageId,
        puid: request.puid,
        success: true,
        enrichmentData: {
          receivedAcctId: cdtrAcct,
          lookupStatusCode: 404,
          lookupStatusDesc: 'Account not found in system',
          normalizedAcctId: cdtrAcct.toUpperCase(),
          matchedAcctId: cdtrAcct,
          partialMatch: "N",
          isPhysical: "UNKNOWN"
        },
        processedAt: Date.now(),
        lookupSource: 'MOCK'
      };
    }

    if (cdtrAcct.includes('ERROR')) {
      return {
        messageId: request.messageId,
        puid: request.puid,
        success: true, // Service succeeded but account lookup had an error
        enrichmentData: {
          receivedAcctId: cdtrAcct,
          lookupStatusCode: 500,
          lookupStatusDesc: 'Internal processing error',
          normalizedAcctId: cdtrAcct.toUpperCase(),
          matchedAcctId: cdtrAcct,
          partialMatch: "N",
          isPhysical: "UNKNOWN"
        },
        processedAt: Date.now(),
        lookupSource: 'MOCK'
      };
    }

    // Standard successful response
    return {
      messageId: request.messageId,
      puid: request.puid,
      success: true,
      enrichmentData: {
        receivedAcctId: cdtrAcct,
        lookupStatusCode: 200,
        lookupStatusDesc: "Success",
        normalizedAcctId: cdtrAcct.toUpperCase(),
        matchedAcctId: cdtrAcct,
        partialMatch: "N",
        isPhysical: "Y",
        physicalAcctInfo: {
          acctId: cdtrAcct,
          acctSys: accountType === 'Corporate' || accountType === 'Government' ? 'MEPS' : 'MDZ',
          acctGroup: accountCategory,
          country: 'SG',
          branchId: '001',
          acctAttributes: {
            acctType: accountType,
            acctCategory: accountCategory,
            acctPurpose: this.getMockAccountPurpose(accountType)
          },
          acctOpsAttributes: {
            isActive: cdtrAcct.includes('INACTIVE') ? false : true,
            acctStatus: cdtrAcct.includes('INACTIVE') ? 'Suspended' : 'Active',
            openDate: '01/01/2020',
            expiryDate: '31/12/2030',
            restraints: {
              stopAll: cdtrAcct.includes('INACTIVE') ? true : false,
              stopDebits: false,
              stopCredits: false,
              stopAtm: false,
              stopEftPos: false,
              stopUnknown: false,
              warnings: cdtrAcct.includes('INACTIVE') ? ['Account suspended'] : []
            }
          },
          bicfi: 'ANZBSG3MXXX',
          currencyCode: 'SGD'
        }
      },
      processedAt: Date.now(),
      lookupSource: 'MOCK'
    };
  }

  private determineMockAccountType(cdtrAcct: string): string {
    const normalizedId = cdtrAcct.toUpperCase();
    if (normalizedId.startsWith('CORP')) return 'Corporate';
    if (normalizedId.startsWith('GOVT')) return 'Government';
    if (normalizedId.startsWith('UTIL')) return 'Utility';
    return 'Physical';
  }

  private determineMockAccountCategory(accountType: string): string {
    switch (accountType) {
      case 'Corporate': return 'CORPORATE';
      case 'Government': return 'GOVERNMENT';
      case 'Utility': return 'UTILITY';
      default: return 'RETAIL';
    }
  }

  private getMockAccountPurpose(accountType: string): string {
    switch (accountType) {
      case 'Corporate': return 'BUSINESS_OPERATIONS';
      case 'Government': return 'GOVERNMENT_SERVICES';
      case 'Utility': return 'UTILITY_SERVICES';
      default: return 'GENERAL_BANKING';
    }
  }
} 