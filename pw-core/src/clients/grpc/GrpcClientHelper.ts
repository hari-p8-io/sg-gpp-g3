import { GrpcTestClient, ServiceConfig } from './GrpcTestClient';
import path from 'path';
import fs from 'fs';

export interface ValidationResult {
  hasValidCurrency: boolean;
  hasValidCountry: boolean;
  hasValidPostalCode: boolean;
  hasValidBankCode: boolean;
  warnings: string[];
}

export class GrpcClientHelper {
  static createClient<T>(config: ServiceConfig): GrpcTestClient<T> {
    return new GrpcTestClient<T>(config);
  }

  static loadFixture(fixturePath: string): string {
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture not found: ${fixturePath}`);
    }
    return fs.readFileSync(fixturePath, 'utf8');
  }

  static validateSingaporeFields(xmlPayload: string): ValidationResult {
    const result: ValidationResult = {
      hasValidCurrency: false,
      hasValidCountry: false,
      hasValidPostalCode: false,
      hasValidBankCode: false,
      warnings: []
    };

    // Check for SGD currency
    if (xmlPayload.includes('SGD')) {
      result.hasValidCurrency = true;
    } else {
      result.warnings.push('SGD currency not found in XML payload');
    }

    // Check for Singapore country code
    if (xmlPayload.includes('<Ctry>SG</Ctry>')) {
      result.hasValidCountry = true;
    } else {
      result.warnings.push('Singapore country code (SG) not found in XML payload');
    }

    // Check for Singapore postal code pattern (6 digits)
    const postalCodePattern = /<PstCd>(\d{6})<\/PstCd>/;
    if (postalCodePattern.test(xmlPayload)) {
      result.hasValidPostalCode = true;
    } else {
      result.warnings.push('Valid Singapore postal code (6 digits) not found');
    }

    // Check for Singapore bank codes (common ones)
    const singaporeBankCodes = [
      'ANZBSG3MXXX', 'OCBCSG3MXXX', 'UOBSG3MXXX', 'DBSSSG3MXXX',
      'CITISGSXXX', 'HSBCSG3MXXX', 'SCBLSG3MXXX'
    ];
    
    const hasSingaporeBankCode = singaporeBankCodes.some(code => 
      xmlPayload.includes(code)
    );
    
    if (hasSingaporeBankCode) {
      result.hasValidBankCode = true;
    } else {
      result.warnings.push('Singapore bank code not found in XML payload');
    }

    return result;
  }

  static validateMarketFields(xmlPayload: string, market: string = 'SG'): ValidationResult {
    switch (market.toUpperCase()) {
      case 'SG':
        return this.validateSingaporeFields(xmlPayload);
      default:
        throw new Error(`Market validation not implemented for: ${market}`);
    }
  }

  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  static isValidPUID(puid: string): boolean {
    // PUID format: G3I + 13 alphanumeric characters
    const puidRegex = /^G3I[A-Z0-9]{13}$/;
    return puidRegex.test(puid);
  }

  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static validateDatabaseRecord(record: any, expectedMessageType: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!record.message_id) {
      errors.push('Missing message_id');
    }

    if (!record.puid) {
      errors.push('Missing puid');
    }

    if (!record.message_type) {
      errors.push('Missing message_type');
    } else if (record.message_type !== expectedMessageType) {
      errors.push(`Expected message_type ${expectedMessageType}, got ${record.message_type}`);
    }

    if (!record.payload) {
      errors.push('Missing payload');
    }

    if (!record.status) {
      errors.push('Missing status');
    }

    if (!record.created_at) {
      errors.push('Missing created_at timestamp');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
} 