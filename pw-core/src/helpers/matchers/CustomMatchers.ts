import { expect } from '@playwright/test';

declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      toBeValidPUID(): R;
      toBeValidUUID(): R;
      toHaveValidSingaporeFields(): R;
      toHaveValidEnrichmentData(): R;
      toHaveValidValidationResult(): R;
      toBeHealthyService(): R;
      toHaveValidPacsStructure(messageType: string): R;
    }
  }
}

export const customMatchers = {
  toBeValidPUID(received: string) {
    const pass = /^G3I[A-Z0-9]{13}$/.test(received);
    return {
      pass,
      message: () => pass 
        ? `Expected ${received} not to be a valid PUID`
        : `Expected ${received} to be a valid PUID (format: G3I + 13 alphanumeric)`
    };
  },

  toBeValidUUID(received: string) {
    const pass = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(received);
    return {
      pass,
      message: () => pass 
        ? `Expected ${received} not to be a valid UUID`
        : `Expected ${received} to be a valid UUID`
    };
  },
  
  toHaveValidSingaporeFields(received: any) {
    const errors: string[] = [];
    
    if (received.currency !== 'SGD' && received.expectedFields?.currency !== 'SGD') {
      errors.push(`Expected currency to be SGD, got ${received.currency || received.expectedFields?.currency}`);
    }
    
    if (received.country !== 'SG' && received.expectedFields?.country !== 'SG') {
      errors.push(`Expected country to be SG, got ${received.country || received.expectedFields?.country}`);
    }
    
    return {
      pass: errors.length === 0,
      message: () => errors.length === 0
        ? `Expected object not to have valid Singapore fields`
        : `Singapore validation failed: ${errors.join(', ')}`
    };
  },

  toHaveValidEnrichmentData(received: any) {
    const errors: string[] = [];
    
    if (!received.receivedAcctId) {
      errors.push('Missing receivedAcctId');
    }
    
    if (!received.lookupStatusCode) {
      errors.push('Missing lookupStatusCode');
    } else if (received.lookupStatusCode !== 200) {
      errors.push(`Expected lookupStatusCode to be 200, got ${received.lookupStatusCode}`);
    }
    
    if (!received.isPhysical) {
      errors.push('Missing isPhysical');
    }
    
    return {
      pass: errors.length === 0,
      message: () => errors.length === 0
        ? `Expected object not to have valid enrichment data`
        : `Enrichment validation failed: ${errors.join(', ')}`
    };
  },

  toHaveValidValidationResult(received: any) {
    const errors: string[] = [];
    
    if (!received.isValid) {
      errors.push('Validation result is not valid');
    }
    
    if (received.currencyValidation && !received.currencyValidation.isValid) {
      errors.push('Currency validation failed');
    }
    
    if (received.countryValidation && !received.countryValidation.isValid) {
      errors.push('Country validation failed');
    }
    
    return {
      pass: errors.length === 0,
      message: () => errors.length === 0
        ? `Expected validation result not to be valid`
        : `Validation result failed: ${errors.join(', ')}`
    };
  },

  toBeHealthyService(received: any) {
    const errors: string[] = [];
    
    if (!received) {
      errors.push('Health response is undefined');
    } else {
      if (!received.status) {
        errors.push('Missing status in health response');
      } else {
        const status = received.status;
        const isHealthy = status === 'SERVING' || status === 1 || status === 'healthy';
        if (!isHealthy) {
          errors.push(`Expected service to be healthy, got status: ${status}`);
        }
      }
      
      if (!received.timestamp) {
        errors.push('Missing timestamp in health response');
      }
    }
    
    return {
      pass: errors.length === 0,
      message: () => errors.length === 0
        ? `Expected service not to be healthy`
        : `Health check failed: ${errors.join(', ')}`
    };
  },

  toHaveValidPacsStructure(received: string, messageType: string) {
    const errors: string[] = [];
    
    switch (messageType.toUpperCase()) {
      case 'PACS008':
        if (!received.includes('<FIToFICstmrCdtTrf>')) {
          errors.push('Missing PACS008 credit transfer structure');
        }
        if (!received.includes('<CdtTrfTxInf>')) {
          errors.push('Missing credit transfer transaction info');
        }
        break;
      case 'PACS007':
        if (!received.includes('<FIToFIPmtRvsl>')) {
          errors.push('Missing PACS007 payment reversal structure');
        }
        if (!received.includes('<RvslId>')) {
          errors.push('Missing reversal ID');
        }
        break;
      case 'PACS003':
        if (!received.includes('<FIToFICstmrDrctDbt>')) {
          errors.push('Missing PACS003 direct debit structure');
        }
        if (!received.includes('<DrctDbtTxInf>')) {
          errors.push('Missing direct debit transaction info');
        }
        break;
      default:
        errors.push(`Unknown PACS message type: ${messageType}`);
    }
    
    return {
      pass: errors.length === 0,
      message: () => errors.length === 0
        ? `Expected XML not to have valid ${messageType} structure`
        : `PACS structure validation failed: ${errors.join(', ')}`
    };
  }
};

// Export function to extend Playwright with custom matchers
export function extendPlaywrightMatchers() {
  expect.extend(customMatchers);
} 