import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

export interface ReferenceDataRequest {
  currencyCode?: string;
  countryCode?: string;
  bankCode?: string;
  dataType: 'currency' | 'country' | 'bank';
}

export interface ReferenceDataResponse {
  valid: boolean;
  validationMessage: string;
  additionalData?: Record<string, string>;
}

export interface AuthMethodResponse {
  authMethod: string;
  valid: boolean;
  description: string;
}

export class ReferenceDataRestClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = process.env.REFERENCE_DATA_REST_URL || 'http://localhost:8080') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: parseInt(process.env.REST_CLIENT_TIMEOUT || '5000'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info('Making REST request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('REST request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.info('REST response received', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('REST response error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Validate currency code via REST API
   */
  async validateCurrency(currencyCode: string): Promise<ReferenceDataResponse> {
    try {
      const request: ReferenceDataRequest = {
        currencyCode,
        dataType: 'currency',
      };

      const response: AxiosResponse<ReferenceDataResponse> = await this.client.post(
        '/api/v1/reference-data/validate/currency',
        request
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to validate currency', {
        currencyCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        valid: false,
        validationMessage: `Currency validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate country code via REST API
   */
  async validateCountry(countryCode: string): Promise<ReferenceDataResponse> {
    try {
      const request: ReferenceDataRequest = {
        countryCode,
        dataType: 'country',
      };

      const response: AxiosResponse<ReferenceDataResponse> = await this.client.post(
        '/api/v1/reference-data/validate/country',
        request
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to validate country', {
        countryCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        valid: false,
        validationMessage: `Country validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate bank code via REST API
   */
  async validateBank(bankCode: string): Promise<ReferenceDataResponse> {
    try {
      const request: ReferenceDataRequest = {
        bankCode,
        dataType: 'bank',
      };

      const response: AxiosResponse<ReferenceDataResponse> = await this.client.post(
        '/api/v1/reference-data/validate/bank',
        request
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to validate bank', {
        bankCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        valid: false,
        validationMessage: `Bank validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get authentication method for account via REST API
   */
  async getAuthMethod(accountId: string): Promise<AuthMethodResponse> {
    try {
      const response: AxiosResponse<AuthMethodResponse> = await this.client.get(
        `/api/v1/reference-data/auth-method/${accountId}`
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to get auth method', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        authMethod: 'UNKNOWN',
        valid: false,
        description: `Auth method lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Perform comprehensive reference data validation
   */
  async validateReferenceData(data: {
    currencyCode?: string;
    countryCode?: string;
    bankCode?: string;
  }): Promise<{
    currencyValid: boolean;
    countryValid: boolean;
    bankValid: boolean;
    allValid: boolean;
    errors: string[];
  }> {
    const results = {
      currencyValid: true,
      countryValid: true,
      bankValid: true,
      allValid: true,
      errors: [] as string[],
    };

    try {
      const validationPromises: Promise<any>[] = [];

      if (data.currencyCode) {
        validationPromises.push(
          this.validateCurrency(data.currencyCode).then((result) => {
            results.currencyValid = result.valid;
            if (!result.valid) {
              results.errors.push(result.validationMessage);
            }
          })
        );
      }

      if (data.countryCode) {
        validationPromises.push(
          this.validateCountry(data.countryCode).then((result) => {
            results.countryValid = result.valid;
            if (!result.valid) {
              results.errors.push(result.validationMessage);
            }
          })
        );
      }

      if (data.bankCode) {
        validationPromises.push(
          this.validateBank(data.bankCode).then((result) => {
            results.bankValid = result.valid;
            if (!result.valid) {
              results.errors.push(result.validationMessage);
            }
          })
        );
      }

      await Promise.all(validationPromises);

      results.allValid = results.currencyValid && results.countryValid && results.bankValid;

      return results;
    } catch (error) {
      logger.error('Failed to validate reference data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        currencyValid: false,
        countryValid: false,
        bankValid: false,
        allValid: false,
        errors: [`Reference data validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Health check for the REST client
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v1/health');
      return response.status === 200;
    } catch (error) {
      logger.error('Reference data service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
} 