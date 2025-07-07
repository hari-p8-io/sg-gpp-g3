import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';

interface GrpcClient {
  ProcessPacsMessage: (request: any, callback: (error: any, response: any) => void) => void;
  GetMessageStatus: (request: any, callback: (error: any, response: any) => void) => void;
  HealthCheck: (request: any, callback: (error: any, response: any) => void) => void;
  GetAllMessages?: (request: any, callback: (error: any, response: any) => void) => void;
  ClearMockStorage?: (request: any, callback: (error: any, response: any) => void) => void;
  GetMockStorageSize?: (request: any, callback: (error: any, response: any) => void) => void;
}

interface ProcessPacsResponse {
  message_id: string;
  puid: string;
  success: boolean;
  error_message: string;
  timestamp: number;
  status: string;
}

interface MessageStatusResponse {
  message_id: string;
  puid: string;
  message_type: string;
  payload: string;
  status: string;
  created_at: string;
  processed_at?: string;
}

interface HealthCheckResponse {
  status: number | string;
  timestamp: number;
}

interface SafeStrRecord {
  message_id: string;
  puid: string;
  message_type: string;
  payload: string;
  created_at: Date;
  processed_at?: Date;
  status: string;
}

class GrpcClientHelper {
  private client: GrpcClient;
  private serverUrl: string;

  constructor(serverUrl: string = 'localhost:50051') {
    this.serverUrl = serverUrl;
    
    // Load proto definition
    const PROTO_PATH = path.join(__dirname, '../../proto/pacs_handler.proto');
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const pacsProto = grpc.loadPackageDefinition(packageDefinition) as any;
    this.client = new pacsProto.gpp.g3.requesthandler.PacsHandler(
      serverUrl,
      grpc.credentials.createInsecure()
    );
  }

  async processPacsMessage(
    messageType: string,
    xmlPayload: string,
    metadata: Record<string, string> = {}
  ): Promise<ProcessPacsResponse> {
    return new Promise((resolve, reject) => {
      const request = {
        message_type: messageType,
        xml_payload: xmlPayload,
        metadata: metadata,
      };

      this.client.ProcessPacsMessage(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  async getMessageStatus(
    messageId?: string,
    puid?: string
  ): Promise<MessageStatusResponse> {
    return new Promise((resolve, reject) => {
      const request = {
        message_id: messageId || '',
        puid: puid || '',
      };

      this.client.GetMessageStatus(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return new Promise((resolve, reject) => {
      this.client.HealthCheck({}, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Add method to get all messages from mock storage
  async getAllMessages(): Promise<SafeStrRecord[]> {
    return new Promise((resolve, reject) => {
      if (!this.client.GetAllMessages) {
        reject(new Error('GetAllMessages method not available'));
        return;
      }

      this.client.GetAllMessages({}, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.messages || []);
        }
      });
    });
  }

  // Add method to clear mock storage
  async clearMockStorage(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client.ClearMockStorage) {
        reject(new Error('ClearMockStorage method not available'));
        return;
      }

      this.client.ClearMockStorage({}, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // Add method to get mock storage size
  async getMockStorageSize(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.client.GetMockStorageSize) {
        reject(new Error('GetMockStorageSize method not available'));
        return;
      }

      this.client.GetMockStorageSize({}, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.size || 0);
        }
      });
    });
  }

  // Helper method to validate Singapore-specific fields
  static validateSingaporeFields(xmlPayload: string): {
    hasValidCurrency: boolean;
    hasValidCountry: boolean;
    hasValidPostalCode: boolean;
    hasValidBankCode: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    
    // Check for SGD currency
    const hasValidCurrency = xmlPayload.includes('SGD');
    if (!hasValidCurrency) {
      warnings.push('No SGD currency found in XML payload');
    }

    // Check for SG country code
    const hasValidCountry = xmlPayload.includes('SG');
    if (!hasValidCountry) {
      warnings.push('No SG country code found in XML payload');
    }

    // Check for Singapore postal code pattern (6 digits)
    const postalCodePattern = /\b\d{6}\b/;
    const hasValidPostalCode = postalCodePattern.test(xmlPayload);
    if (!hasValidPostalCode) {
      warnings.push('No valid Singapore postal code (6 digits) found in XML payload');
    }

    // Check for Singapore bank code patterns
    const bankCodePattern = /\b(7171|7375|7144|7339)\b/; // Common Singapore bank codes
    const hasValidBankCode = bankCodePattern.test(xmlPayload);
    if (!hasValidBankCode) {
      warnings.push('No recognized Singapore bank code found in XML payload');
    }

    return {
      hasValidCurrency,
      hasValidCountry,
      hasValidPostalCode,
      hasValidBankCode,
      warnings,
    };
  }

  // Helper method to validate UUID format
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Helper method to validate PUID format
  static isValidPUID(puid: string): boolean {
    const puidRegex = /^G3I[A-Z0-9]{13}$/;
    return puidRegex.test(puid);
  }

  // Helper method to load test XML files
  static loadTestXML(messageType: string, variant: string = 'singapore'): string {
    const filename = `sample_${messageType.toLowerCase()}_sg.xml`;
    const filePath = path.join(__dirname, '../fixtures', filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Test XML file not found: ${filePath}`);
    }
    
    return fs.readFileSync(filePath, 'utf8');
  }

  // Helper method to wait for async operations
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method to validate database record
  static validateDatabaseRecord(record: SafeStrRecord, expectedMessageType: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!record.message_id || !GrpcClientHelper.isValidUUID(record.message_id)) {
      errors.push('Invalid or missing message_id');
    }

    if (!record.puid || !GrpcClientHelper.isValidPUID(record.puid)) {
      errors.push('Invalid or missing PUID');
    }

    if (record.message_type !== expectedMessageType) {
      errors.push(`Expected message_type ${expectedMessageType}, got ${record.message_type}`);
    }

    if (!record.payload || record.payload.length === 0) {
      errors.push('Missing or empty payload');
    }

    if (!record.created_at) {
      errors.push('Missing created_at timestamp');
    }

    if (!record.status) {
      errors.push('Missing status');
    }

    const validStatuses = ['RECEIVED', 'VALIDATED', 'ENRICHED', 'FAILED'];
    if (!validStatuses.includes(record.status)) {
      errors.push(`Invalid status: ${record.status}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export default GrpcClientHelper; 