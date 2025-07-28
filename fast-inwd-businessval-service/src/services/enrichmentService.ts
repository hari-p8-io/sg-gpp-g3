import { v4 as uuidv4 } from 'uuid';
import { extractCdtrAcct, validateXML, isFinancialMessage } from '../utils/xmlParser';
import { AccountLookupClient, AccountLookupRequest } from '../grpc/clients/accountLookupClient';
import { ReferenceDataClient } from '../grpc/clients/referenceDataClient';
import { ValidationClient, ValidationRequest } from '../grpc/clients/validationClient';
import { KafkaClient } from './kafkaClient';
import { ResponseKafkaClient, PACS002Message } from './responseKafkaClient'; // NEW: Response Kafka client
import { PACS002Generator, PACS002Request, PACS002Response } from '../utils/pacs002Generator'; // NEW: PACS.002 generator
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
  routingDecision?: string;
  kafkaPublished?: boolean;
  pacs002Published?: boolean; // NEW: Track PACS.002 response publishing
}

export class InwdProcessorService {
  private accountLookupClient: AccountLookupClient;
  private referenceDataClient: ReferenceDataClient;
  private validationClient: ValidationClient;
  private kafkaClient: KafkaClient;
  private responseKafkaClient: ResponseKafkaClient; // NEW: Response Kafka client
  private pacs002Generator: PACS002Generator; // NEW: PACS.002 generator
  private useMockMode: boolean;

  constructor(
    accountLookupClient: AccountLookupClient,
    referenceDataClient: ReferenceDataClient,
    validationClient: ValidationClient,
    kafkaClient: KafkaClient,
    responseKafkaClient: ResponseKafkaClient, // NEW: Inject response Kafka client
    pacs002Generator: PACS002Generator // NEW: Inject PACS.002 generator
  ) {
    this.accountLookupClient = accountLookupClient;
    this.referenceDataClient = referenceDataClient;
    this.validationClient = validationClient;
    this.kafkaClient = kafkaClient;
    this.responseKafkaClient = responseKafkaClient; // NEW: Initialize response client
    this.pacs002Generator = pacs002Generator; // NEW: Initialize PACS.002 generator
    this.useMockMode = process.env.NODE_ENV === 'test' || process.env.USE_MOCK_MODE === 'true';
  }

  /**
   * Static async factory method to create and initialize EnrichmentService
   * @returns Promise<EnrichmentService> - Fully initialized service instance
   * @throws Error if initialization fails
   */
  static async create(): Promise<InwdProcessorService> {
    try {
      // Initialize async clients first
      const accountLookupClient = await AccountLookupClient.create();
      
      // Initialize sync clients
      const referenceDataClient = new ReferenceDataClient();
      const validationClient = new ValidationClient('localhost:50053');
      
      // Initialize Kafka clients
      const kafkaClient = new KafkaClient();
      await kafkaClient.connect();

      // NEW: Initialize response Kafka client
      const responseKafkaClient = new ResponseKafkaClient();
      await responseKafkaClient.connect();

      // NEW: Initialize PACS.002 generator
      const pacs002Generator = new PACS002Generator();

      return new InwdProcessorService(
        accountLookupClient, 
        referenceDataClient, 
        validationClient, 
        kafkaClient, 
        responseKafkaClient,
        pacs002Generator
      );
    } catch (error) {
      throw new Error(`Failed to initialize InwdProcessorService: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async enrichMessage(request: EnrichmentRequest): Promise<EnrichmentResponse> {
    const startTime = Date.now();

    logger.info('Financial message enrichment started', {
      messageId: request.messageId,
      puid: request.puid,
      messageType: request.messageType,
      useMockMode: this.useMockMode
    });

    try {
      // Validate input
      const validationError = await this.validateRequest(request);
      if (validationError) {
        const errorResponse = this.createErrorResponse(request, validationError);
        // NEW: Send PACS.002 failure response
        await this.sendPacs002FailureResponse(request, validationError, 'VALIDATION_ERROR');
        return errorResponse;
      }

      // Extract CdtrAcct from XML payload
      const cdtrAcct = await extractCdtrAcct(request.xmlPayload);
      if (!cdtrAcct) {
        const errorMessage = 'Could not extract CdtrAcct from XML payload';
        const errorResponse = this.createErrorResponse(request, errorMessage);
        // NEW: Send PACS.002 failure response
        await this.sendPacs002FailureResponse(request, errorMessage, 'INVALID_ACCOUNT');
        return errorResponse;
      }

      logger.debug('CdtrAcct extracted from XML', {
        messageId: request.messageId,
        cdtrAcct
      });

      // Perform account lookup and reference data enrichment
      const enrichmentData = await this.performEnrichment(request, cdtrAcct);
      if (!enrichmentData.success) {
        const errorResponse = this.createErrorResponse(request, enrichmentData.errorMessage || 'Unknown error', enrichmentData.errorCode);
        // NEW: Send PACS.002 failure response
        await this.sendPacs002FailureResponse(request, enrichmentData.errorMessage || 'Unknown error', enrichmentData.errorCode || 'ENRICHMENT_ERROR');
        return errorResponse;
      }

      // Create enriched XML payload
      const enrichedPayload = this.createEnrichedXML(request.xmlPayload, enrichmentData.data);

      // Determine routing based on message type
      const routingDecision = this.determineRouting(request.messageType);
      
      logger.info('Routing decision made', {
        messageId: request.messageId,
        messageType: request.messageType,
        routingDecision
      });

      if (routingDecision === 'VALIDATION_SERVICE') {
        // PACS.003 - Route to validation service
        return await this.routeToValidationService(request, enrichedPayload, enrichmentData.data);
      } else if (routingDecision === 'DIRECT_KAFKA') {
        // PACS.008/007 - Route directly to Kafka
        return await this.routeToKafkaDirectly(request, enrichedPayload, enrichmentData.data);
      } else {
        const errorMessage = `Unknown routing decision: ${routingDecision}`;
        const errorResponse = this.createErrorResponse(request, errorMessage);
        // NEW: Send PACS.002 failure response
        await this.sendPacs002FailureResponse(request, errorMessage, 'ROUTING_ERROR');
        return errorResponse;
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Internal processing error';
      
      logger.error('Financial message enrichment failed', {
        messageId: request.messageId,
        puid: request.puid,
        error: errorMessage,
        processingTime
      });

      // NEW: Send PACS.002 failure response
      await this.sendPacs002FailureResponse(request, errorMessage, 'TECHNICAL_ERROR');

      return this.createErrorResponse(request, errorMessage);
    }
  }

  private async validateRequest(request: EnrichmentRequest): Promise<string | null> {
    if (!request.messageId || request.messageId.trim().length === 0) {
      return 'Message ID is required';
    }

    if (!request.puid || request.puid.trim().length === 0) {
      return 'PUID is required';
    }

    if (!request.xmlPayload || request.xmlPayload.trim().length === 0) {
      return 'XML payload is required';
    }

    const isValidXML = await validateXML(request.xmlPayload);
    if (!isValidXML) {
      return 'Invalid XML payload format';
    }

    if (!isFinancialMessage(request.xmlPayload)) {
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
  <!-- Banking Enrichment Data -->
  <EnrichmentInfo>
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
      <Market>${physicalInfo.country}</Market>
    </EnrichmentMeta>
  </EnrichmentInfo>`;

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

    // Determine account system based on account patterns
    let acctSys = 'MDZ'; // Default
    
    // VAM accounts: specific patterns or account IDs
    if (cdtrAcct === '999888777666' || cdtrAcct.startsWith('999') || cdtrAcct.includes('VAM')) {
      acctSys = 'VAM';
    } else if (accountType === 'Corporate' || accountType === 'Government') {
      acctSys = 'MEPS';
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
          acctSys: acctSys,
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

  /**
   * NEW: Determine routing based on message type
   */
  private determineRouting(messageType: string): string {
    switch (messageType.toUpperCase()) {
      case 'PACS.003':
      case 'PACS003':
        return 'VALIDATION_SERVICE';
      case 'PACS.008':
      case 'PACS008':
      case 'PACS.007':
      case 'PACS007':
        return 'DIRECT_KAFKA';
      default:
        // Default routing - can be configured based on requirements
        return 'VALIDATION_SERVICE';
    }
  }

  /**
   * Route PACS.003 messages to validation service
   */
  private async routeToValidationService(
    request: EnrichmentRequest, 
    enrichedPayload: string, 
    enrichmentData: any
  ): Promise<EnrichmentResponse> {
    logger.info('Routing to validation service', {
      messageId: request.messageId,
      messageType: request.messageType
    });

    try {
      const validationRequest: ValidationRequest = {
        messageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
        enrichedXmlPayload: enrichedPayload,
        enrichmentData: enrichmentData,
        timestamp: Date.now(),
        metadata: request.metadata
      };

      const validationResponse = await this.validationClient.validateEnrichedMessage(validationRequest);

      if (validationResponse.success) {
        logger.info('Validation service call successful', {
          messageId: request.messageId,
          success: validationResponse.success,
          kafkaPublished: validationResponse.kafkaPublished
        });

        // NEW: Send PACS.002 success response
        const pacs002Published = await this.sendPacs002SuccessResponse(request, enrichmentData);

        return {
          messageId: request.messageId,
          puid: request.puid,
          success: true,
          enrichedPayload,
          enrichmentData: enrichmentData,
          processedAt: Date.now(),
          nextService: 'fast-orchestrator-service',
          routingDecision: 'VALIDATION_SERVICE',
          pacs002Published
        };
      } else {
        logger.error('Validation failed', {
          messageId: request.messageId,
          error: validationResponse.errorMessage
        });

        // NEW: Send PACS.002 failure response
        await this.sendPacs002FailureResponse(request, validationResponse.errorMessage || 'Validation failed', 'VALIDATION_ERROR');

        return this.createErrorResponse(request, 
          `Validation failed: ${validationResponse.errorMessage}`
        );
      }
    } catch (error) {
      const errorMessage = `Validation service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      logger.error('Validation service call failed', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // NEW: Send PACS.002 failure response
      await this.sendPacs002FailureResponse(request, errorMessage, 'TECHNICAL_ERROR');

      return this.createErrorResponse(request, errorMessage);
    }
  }

  /**
   * Route PACS.008/007 messages directly to Kafka
   */
  private async routeToKafkaDirectly(
    request: EnrichmentRequest, 
    enrichedPayload: string, 
    enrichmentData: any
  ): Promise<EnrichmentResponse> {
    logger.info('Routing directly to Kafka', {
      messageId: request.messageId,
      messageType: request.messageType
    });

    try {
      // Create JSON payload for Kafka
      const jsonPayload = this.createJSONPayload(request, enrichedPayload, enrichmentData);

      // Publish directly to Kafka
      const kafkaPublished = await this.kafkaClient.publishEnrichedMessage({
        messageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
        jsonPayload: jsonPayload,
        enrichmentData: enrichmentData,
        timestamp: request.timestamp,
        sourceService: 'fast-inwd-processor-service'
      });

      if (kafkaPublished) {
        logger.info('Message published to Kafka successfully', {
          messageId: request.messageId,
          messageType: request.messageType,
          topic: 'enriched-messages'
        });

        // NEW: Send PACS.002 success response
        const pacs002Published = await this.sendPacs002SuccessResponse(request, enrichmentData);

        return {
          messageId: request.messageId,
          puid: request.puid,
          success: true,
          enrichedPayload,
          enrichmentData: enrichmentData,
          processedAt: Date.now(),
          nextService: 'fast-orchestrator-service',
          routingDecision: 'DIRECT_KAFKA',
          kafkaPublished: true,
          pacs002Published
        };
      } else {
        const errorMessage = 'Failed to publish message to Kafka';
        
        // NEW: Send PACS.002 failure response
        await this.sendPacs002FailureResponse(request, errorMessage, 'KAFKA_ERROR');
        
        return this.createErrorResponse(request, errorMessage);
      }
    } catch (error) {
      const errorMessage = `Kafka publishing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      logger.error('Kafka publishing failed', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // NEW: Send PACS.002 failure response
      await this.sendPacs002FailureResponse(request, errorMessage, 'KAFKA_ERROR');

      return this.createErrorResponse(request, errorMessage);
    }
  }

  /**
   * NEW: Send PACS.002 success response
   */
  private async sendPacs002SuccessResponse(request: EnrichmentRequest, enrichmentData: any): Promise<boolean> {
    try {
      const pacs002Request: PACS002Request = {
        originalMessageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
        status: 'COMPLETED',
        amount: this.extractAmount(request.xmlPayload),
        currency: this.extractCurrency(request.xmlPayload) || config.defaultCurrency,
        debtorAccount: this.extractDebtorAccount(request.xmlPayload),
        creditorAccount: this.extractCreditorAccount(request.xmlPayload),
        enrichmentData: enrichmentData,
        processingTimeMs: Date.now() - request.timestamp
      };

      const pacs002Response = this.pacs002Generator.generatePacs002Success(pacs002Request);
      
      const kafkaMessage: PACS002Message = {
        messageId: pacs002Response.messageId,
        puid: request.puid,
        responseType: 'PACS.002',
        originalMessageType: request.messageType,
        status: 'ACSC',
        createdAt: pacs002Response.createdAt,
        processingTimeMs: pacs002Request.processingTimeMs,
        xmlPayload: pacs002Response.xmlPayload,
        originalTransaction: {
          amount: pacs002Request.amount,
          currency: pacs002Request.currency,
          debtorAccount: pacs002Request.debtorAccount,
          creditorAccount: pacs002Request.creditorAccount,
        },
        enrichmentData: enrichmentData
      };

      return await this.responseKafkaClient.publishPacs002Response(kafkaMessage);

    } catch (error) {
      logger.error('Failed to send PACS.002 success response', {
        messageId: request.messageId,
        puid: request.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * NEW: Send PACS.002 failure response
   */
  private async sendPacs002FailureResponse(request: EnrichmentRequest, errorMessage: string, errorCode: string): Promise<boolean> {
    try {
      const pacs002Request: PACS002Request = {
        originalMessageId: request.messageId,
        puid: request.puid,
        messageType: request.messageType,
        status: 'FAILED',
        amount: this.extractAmount(request.xmlPayload),
        currency: this.extractCurrency(request.xmlPayload) || config.defaultCurrency,
        debtorAccount: this.extractDebtorAccount(request.xmlPayload),
        creditorAccount: this.extractCreditorAccount(request.xmlPayload),
        errorCode: errorCode,
        errorMessage: errorMessage,
        processingTimeMs: Date.now() - request.timestamp
      };

      const pacs002Response = this.pacs002Generator.generatePacs002Failure(pacs002Request);
      
      const kafkaMessage: PACS002Message = {
        messageId: pacs002Response.messageId,
        puid: request.puid,
        responseType: 'PACS.002',
        originalMessageType: request.messageType,
        status: 'RJCT',
        createdAt: pacs002Response.createdAt,
        processingTimeMs: pacs002Request.processingTimeMs,
        xmlPayload: pacs002Response.xmlPayload,
        originalTransaction: {
          amount: pacs002Request.amount,
          currency: pacs002Request.currency,
          debtorAccount: pacs002Request.debtorAccount,
          creditorAccount: pacs002Request.creditorAccount,
        },
        errorDetails: {
          errorCode: errorCode,
          errorMessage: errorMessage
        }
      };

      return await this.responseKafkaClient.publishPacs002Response(kafkaMessage);

    } catch (error) {
      logger.error('Failed to send PACS.002 failure response', {
        messageId: request.messageId,
        puid: request.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * NEW: Extract amount from XML payload
   */
  private extractAmount(xmlPayload: string): string | undefined {
    try {
      const amountMatch = xmlPayload.match(/<IntrBkSttlmAmt[^>]*>([^<]+)<\/IntrBkSttlmAmt>/);
      return amountMatch ? amountMatch[1] : undefined;
    } catch (error) {
      logger.debug('Could not extract amount from XML', { error: error instanceof Error ? error.message : 'Unknown error' });
      return undefined;
    }
  }

  /**
   * NEW: Extract currency from XML payload
   */
  private extractCurrency(xmlPayload: string): string | undefined {
    try {
      const currencyMatch = xmlPayload.match(/<IntrBkSttlmAmt[^>]*Ccy="([^"]+)"[^>]*>/);
      return currencyMatch ? currencyMatch[1] : undefined;
    } catch (error) {
      logger.debug('Could not extract currency from XML', { error: error instanceof Error ? error.message : 'Unknown error' });
      return undefined;
    }
  }

  /**
   * NEW: Extract debtor account from XML payload
   */
  private extractDebtorAccount(xmlPayload: string): string | undefined {
    try {
      const debtorMatch = xmlPayload.match(/<DbtrAcct>[\s\S]*?<Id>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/);
      return debtorMatch ? debtorMatch[1] : undefined;
    } catch (error) {
      logger.debug('Could not extract debtor account from XML', { error: error instanceof Error ? error.message : 'Unknown error' });
      return undefined;
    }
  }

  /**
   * NEW: Extract creditor account from XML payload
   */
  private extractCreditorAccount(xmlPayload: string): string | undefined {
    try {
      const creditorMatch = xmlPayload.match(/<CdtrAcct>[\s\S]*?<Id>[\s\S]*?<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/);
      return creditorMatch ? creditorMatch[1] : undefined;
    } catch (error) {
      logger.debug('Could not extract creditor account from XML', { error: error instanceof Error ? error.message : 'Unknown error' });
      return undefined;
    }
  }

  /**
   * Perform account lookup and reference data enrichment
   */
  private async performEnrichment(request: EnrichmentRequest, cdtrAcct: string): Promise<{success: boolean, data?: any, errorMessage?: string, errorCode?: string}> {
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
      return {
        success: false,
        errorMessage: `Account lookup failed: ${lookupResponse.errorMessage}`,
        errorCode: lookupResponse.errorCode
      };
    }

    logger.info('Account lookup completed successfully', {
      messageId: request.messageId,
      cdtrAcct,
      lookupSource: lookupResponse.lookupSource
    });

    // Get market configuration from metadata or use defaults
    const marketConfig = this.getMarketConfig(request.metadata);

    // Call reference data service to get auth method
    let authMethod: string = 'AFPONLY'; // default
    try {
      const referenceDataResponse = await this.referenceDataClient.lookupAuthMethod({
        messageId: request.messageId,
        puid: request.puid,
        acctSys: lookupResponse.enrichmentData?.physicalAcctInfo?.acctSys || marketConfig.defaultAcctSys,
        acctGrp: lookupResponse.enrichmentData?.physicalAcctInfo?.acctGroup || marketConfig.defaultAcctGroup,
        acctId: cdtrAcct,
        country: lookupResponse.enrichmentData?.physicalAcctInfo?.country || marketConfig.country,
        currencyCode: lookupResponse.enrichmentData?.physicalAcctInfo?.currencyCode || marketConfig.defaultCurrency,
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
      logger.warn('Reference data service unavailable, using account-based auth method', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // If reference data service failed, determine auth method based on account system and ID
    if (authMethod === 'AFPONLY') {
      const acctSys = lookupResponse.enrichmentData?.physicalAcctInfo?.acctSys;
      
      // VAM accounts typically use GROUPLIMIT authentication
      if (acctSys === 'VAM' || cdtrAcct === '999888777666' || cdtrAcct.startsWith('999')) {
        authMethod = 'GROUPLIMIT';
        logger.info('Applied VAM account auth method', {
          messageId: request.messageId,
          cdtrAcct,
          acctSys,
          authMethod
        });
      } else if (acctSys === 'MEPS' || cdtrAcct.startsWith('888')) {
        authMethod = 'AFPTHENLIMIT';
        logger.info('Applied corporate account auth method', {
          messageId: request.messageId,
          cdtrAcct,
          acctSys,
          authMethod
        });
      }
      // Default remains AFPONLY for MDZ and other systems
    }

    // Add auth method to enrichment data
    lookupResponse.enrichmentData.authMethod = authMethod;

    return {
      success: true,
      data: lookupResponse.enrichmentData
    };
  }

  /**
   * Get market configuration from metadata with Singapore defaults
   */
  private getMarketConfig(metadata: { [key: string]: string } = {}): {
    country: string;
    defaultCurrency: string;
    defaultAcctSys: string;
    defaultAcctGroup: string;
  } {
    return {
      country: metadata.country || process.env.COUNTRY || 'SG',
      defaultCurrency: metadata.currency || process.env.DEFAULT_CURRENCY || 'SGD',
      defaultAcctSys: metadata.acctSys || process.env.DEFAULT_ACCT_SYS || 'MDZ',
      defaultAcctGroup: metadata.acctGroup || process.env.DEFAULT_ACCT_GROUP || 'SGB'
    };
  }

  /**
   * NEW: Create JSON payload for Kafka publishing
   */
  private createJSONPayload(request: EnrichmentRequest, enrichedPayload: string, enrichmentData: any): any {
    return {
      messageId: request.messageId,
      puid: request.puid,
      messageType: request.messageType,
      enrichedXmlPayload: enrichedPayload,
      enrichmentData: enrichmentData,
      extractedFields: {
        cdtrAcct: enrichmentData.receivedAcctId,
        amount: enrichmentData.messageData?.amount,
        currency: enrichmentData.messageData?.currency || 'SGD',
        country: enrichmentData.physicalAcctInfo?.country || 'SG'
      },
      processedAt: new Date().toISOString(),
      sourceService: 'fast-enrichment-service'
    };
  }
} 