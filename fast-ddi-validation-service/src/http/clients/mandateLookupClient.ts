import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../../utils/logger';

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
  mandateStatus: {
    isValid: boolean;
    isActive: boolean;
    isExpired: boolean;
    statusCode: string;
    statusDescription: string;
  };
  mandateDetails?: {
    mandateId: string;
    debtorAccount: string;
    creditorAccount: string;
    creationDate: string;
    expiryDate: string;
    maxAmount: string;
    frequency: string;
    mandateType: string;
    authorizationInfo: {
      isAuthorized: boolean;
      authorizationMethod: string;
      authorizedBy: string;
      authorizationDate: string;
      restrictions: string[];
    };
  };
  validationErrors: string[];
  errorMessage: string;
  processedAt: number;
}

export class MandateLookupClient {
  private httpClient: AxiosInstance;
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'http://localhost:3005', timeout: number = 3000) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.timeout = timeout;
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'fast-ddi-validation-service/1.0.0'
      }
    });

    // Request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug('Mandate lookup HTTP request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          timeout: config.timeout
        });
        return config;
      },
      (error) => {
        logger.error('Mandate lookup HTTP request error', {
          error: error.message
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('Mandate lookup HTTP response', {
          status: response.status,
          statusText: response.statusText,
          responseTime: response.headers['x-response-time']
        });
        return response;
      },
      (error) => {
        logger.error('Mandate lookup HTTP response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        });
        return Promise.reject(error);
      }
    );

    logger.info('MandateLookupClient initialized', {
      baseUrl: this.baseUrl,
      timeout: this.timeout
    });
  }

  async lookupMandate(request: MandateLookupRequest): Promise<MandateLookupResponse> {
    try {
      logger.debug('Sending mandate lookup request', {
        messageId: request.messageId,
        puid: request.puid,
        debtorAccount: request.debtorAccount,
        mandateId: request.mandateId,
        url: `${this.baseUrl}/api/v1/mandates/lookup`
      });

      const response: AxiosResponse<MandateLookupResponse> = await this.httpClient.post(
        '/api/v1/mandates/lookup',
        request
      );

      logger.debug('Mandate lookup response received', {
        messageId: request.messageId,
        success: response.data.success,
        mandateReference: response.data.mandateReference,
        statusCode: response.data.mandateStatus?.statusCode,
        httpStatus: response.status
      });

      return response.data;

    } catch (error) {
      logger.error('Mandate lookup failed', {
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: `${this.baseUrl}/api/v1/mandates/lookup`
      });

      // Return a failure response instead of throwing
      return {
        success: false,
        mandateReference: '',
        mandateStatus: {
          isValid: false,
          isActive: false,
          isExpired: false,
          statusCode: 'SERVICE_ERROR',
          statusDescription: `Mandate lookup service error: ${error instanceof Error ? error.message : 'Unknown error'}`
        },
        validationErrors: ['MND999: TECHNICAL_ERROR', error instanceof Error ? error.message : 'Unknown error'],
        errorMessage: `Mandate lookup service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processedAt: Date.now()
      };
    }
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      const response: AxiosResponse<any> = await this.httpClient.get('/api/v1/health');
      
      const isHealthy = response.status === 200 && response.data.status === 'healthy';
      
      return {
        status: isHealthy ? 'SERVING' : 'NOT_SERVING',
        message: response.data.message || 'Health check completed'
      };

    } catch (error) {
      logger.error('Mandate lookup health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: `${this.baseUrl}/api/v1/health`
      });

      return {
        status: 'NOT_SERVING',
        message: `Mandate lookup service unhealthy: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getServiceInfo(): Promise<any> {
    try {
      const response: AxiosResponse<any> = await this.httpClient.get('/api/v1/info');
      return response.data;

    } catch (error) {
      logger.error('Failed to get mandate lookup service info', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  isClientConnected(): boolean {
    // For HTTP client, we consider it "connected" if the base URL is set
    return !!this.baseUrl;
  }

  getServiceUrl(): string {
    return this.baseUrl;
  }

  setTimeout(timeout: number): void {
    this.timeout = timeout;
    this.httpClient.defaults.timeout = timeout;
    logger.info('MandateLookupClient timeout updated', { timeout });
  }

  disconnect(): void {
    // For HTTP client, there's no persistent connection to close
    logger.info('MandateLookupClient disconnected (HTTP client)');
  }
} 