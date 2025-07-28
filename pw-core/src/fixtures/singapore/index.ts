import path from 'path';
import fs from 'fs';

export interface PacsMessage {
  messageType: string;
  xmlPayload: string;
  expectedFields: {
    currency: string;
    country: string;
    amount?: string;
    [key: string]: any;
  };
}

export class SingaporeFixtures {
  private static fixturesPath = __dirname;

  static loadPacs008(): PacsMessage {
    const xmlPayload = fs.readFileSync(
      path.join(this.fixturesPath, 'sample_pacs008.xml'),
      'utf8'
    );

    return {
      messageType: 'PACS008',
      xmlPayload,
      expectedFields: {
        currency: 'SGD',
        country: 'SG',
        amount: '1000.00'
      }
    };
  }

  static loadPacs007(): PacsMessage {
    const xmlPayload = fs.readFileSync(
      path.join(this.fixturesPath, 'sample_pacs007.xml'),
      'utf8'
    );

    return {
      messageType: 'PACS007',
      xmlPayload,
      expectedFields: {
        currency: 'SGD',
        country: 'SG'
      }
    };
  }

  static loadPacs003(): PacsMessage {
    const xmlPayload = fs.readFileSync(
      path.join(this.fixturesPath, 'sample_pacs003.xml'),
      'utf8'
    );

    return {
      messageType: 'PACS003',
      xmlPayload,
      expectedFields: {
        currency: 'SGD',
        country: 'SG'
      }
    };
  }

  static loadMessage(messageType: string): PacsMessage {
    switch (messageType.toUpperCase()) {
      case 'PACS008':
        return this.loadPacs008();
      case 'PACS007':
        return this.loadPacs007();
      case 'PACS003':
        return this.loadPacs003();
      default:
        throw new Error(`Unsupported message type: ${messageType}`);
    }
  }

  static getAllMessageTypes(): string[] {
    return ['PACS008', 'PACS007', 'PACS003'];
  }
}

// Export test account data
export const SINGAPORE_TEST_ACCOUNTS = {
  STANDARD_RETAIL: {
    accountId: '123456789',
    accountType: 'RETAIL',
    expectedAuthMethod: 'AFPONLY',
    expectedSystem: 'MDZ'
  },
  VAM_ACCOUNT: {
    accountId: '999888777',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'GROUPLIMIT',
    expectedSystem: 'VAM'
  },
  CORPORATE_ACCOUNT: {
    accountId: '888777666',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedSystem: 'MEPS'
  },
  GOVERNMENT_ACCOUNT: {
    accountId: '777666555',
    accountType: 'GOVERNMENT',
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedSystem: 'MEPS'
  }
}; 