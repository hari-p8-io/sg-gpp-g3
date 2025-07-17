import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config/default';
import { MandateLookupService } from '../services/mandateLookupService';

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

export class MandateLookupController {
  private mandateLookupService: MandateLookupService;

  constructor() {
    this.mandateLookupService = new MandateLookupService();
  }

  async lookupMandate(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const mandateLookupRequest: MandateLookupRequest = req.body;
      
      logger.info('Mandate lookup request received', {
        messageId: mandateLookupRequest.messageId,
        puid: mandateLookupRequest.puid,
        messageType: mandateLookupRequest.messageType,
        debtorAccount: mandateLookupRequest.debtorAccount,
        mandateId: mandateLookupRequest.mandateId,
        userAgent: req.get('User-Agent'),
        clientIp: req.ip
      });

      // Call mandate lookup service
      const result = await this.mandateLookupService.lookupMandate(mandateLookupRequest);

      const processingTime = Date.now() - startTime;
      
      logger.info('Mandate lookup request completed', {
        messageId: mandateLookupRequest.messageId,
        success: result.success,
        processingTime,
        mandateReference: result.mandateReference,
        statusCode: result.mandateStatus.statusCode
      });

      // Always return 200 OK with business logic results
      res.status(200).json(result);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Mandate lookup request failed', {
        messageId: req.body?.messageId,
        error: errorMessage,
        processingTime,
        userAgent: req.get('User-Agent'),
        clientIp: req.ip
      });

      // Return business logic error response (not HTTP error)
      const errorResponse = {
        success: false,
        mandateReference: '',
        mandateStatus: {
          isValid: false,
          isActive: false,
          isExpired: false,
          statusCode: 'TECHNICAL_ERROR',
          statusDescription: 'Internal processing error'
        },
        mandateDetails: null,
        validationErrors: [`MND999: TECHNICAL_ERROR`, errorMessage],
        errorMessage: `Mandate lookup failed: ${errorMessage}`,
        processedAt: Date.now()
      };

      res.status(200).json(errorResponse);
    }
  }

  async getServiceInfo(req: Request, res: Response): Promise<void> {
    try {
      const serviceInfo = {
        serviceName: config.serviceName,
        serviceVersion: '1.0.0',
        environment: config.environment,
        port: config.port,
        mockMode: config.useMockMandates,
        supportedMandateTypes: config.supportedMandateTypes,
        supportedFrequencies: config.supportedFrequencies,
        maxMandateAmount: config.maxMandateAmount.toString(),
        defaultCurrency: config.defaultCurrency,
        regulationVersion: config.mandateRegulationVersion,
        complianceMode: config.complianceMode,
        api: {
          version: config.api.version,
          basePath: config.api.basePath,
          endpoints: [
            'POST /api/v1/mandates/lookup',
            'GET /api/v1/health',
            'GET /api/v1/info'
          ]
        }
      };

      logger.debug('Service info requested', {
        userAgent: req.get('User-Agent'),
        clientIp: req.ip
      });

      res.status(200).json(serviceInfo);

    } catch (error) {
      logger.error('Service info request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userAgent: req.get('User-Agent'),
        clientIp: req.ip
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: `Service info unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
        },
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
      });
    }
  }
} 