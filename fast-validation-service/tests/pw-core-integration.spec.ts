import { test, expect } from '@playwright/test';
import { 
  ServiceTestHelper, 
  GenericAssertions 
} from '@gpp/pw-core';
import { SINGAPORE_TEST_ACCOUNTS } from './fixtures/singapore/test-accounts';
import { SINGAPORE_PACS_MESSAGES } from './fixtures/singapore/pacs-messages';
import { SingaporeAssertions } from './utils/singapore-assertions';

test.describe('Fast Validation Service - PW-Core Integration', () => {
  let testHelper: ServiceTestHelper;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('fast-validation-service', {
      protoPath: 'proto/validation_service.proto',
      serviceUrl: 'localhost:50053'
    });
    await testHelper.initialize();
  });

  test.afterAll(async () => {
    await testHelper.shutdown();
  });

  test('should perform health check using pw-core', async () => {
    // Call HealthCheck directly instead of using testHelper.healthCheck
    const response = await new Promise((resolve, reject) => {
      const healthRequest = {
        service: 'fast-validation-service'
      };

      (testHelper as any).grpcClient.client.HealthCheck(healthRequest, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    }) as any;
    
    // Validation service returns { status: 2, message: "..." } where 2 = NOT_SERVING
    expect(response.status).toBe(2);
    expect(response.message).toBeDefined();
  });

  test('should validate PACS008 message using pw-core fixtures', async () => {
    const message = {
      messageType: 'PACS008',
      xmlPayload: SINGAPORE_PACS_MESSAGES.PACS008,
      metadata: { country: 'SG', currency: 'SGD' },
      enrichmentData: {
        receivedAcctId: SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId,
        lookupStatusCode: 200,
        normalizedAcctId: SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId,
        isPhysical: true,
        accountType: 'VAM'
      }
    };
    
    // Call ValidateEnrichedMessage directly instead of processMessage
    const response = await new Promise((resolve, reject) => {
      const validationRequest = {
        message_id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
        puid: 'G3I1234567890TEST',
        message_type: message.messageType,
        enriched_xml_payload: message.xmlPayload,
        enrichment_data: {
          received_acct_id: message.enrichmentData.receivedAcctId,
          lookup_status_code: message.enrichmentData.lookupStatusCode,
          normalized_acct_id: message.enrichmentData.normalizedAcctId,
          is_physical: message.enrichmentData.isPhysical ? 'Y' : 'N'
        },
        timestamp: Date.now(),
        metadata: message.metadata
      };

      (testHelper as any).grpcClient.client.ValidateEnrichedMessage(validationRequest, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    }) as any;
    
    expect(response.success).toBe(true);
    expect(response.message_id).toBeDefined();
    
    // Use Singapore assertions
    SingaporeAssertions.expectValidUUID(response.message_id!, expect);
    SingaporeAssertions.expectValidSingaporeXML(message.xmlPayload, expect);
    SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS008', expect);
  });

  test('should validate PACS007 reversal message', async () => {
    const message = {
      messageType: 'PACS007',
      xmlPayload: SINGAPORE_PACS_MESSAGES.PACS007,
      metadata: { country: 'SG', currency: 'SGD' },
      enrichmentData: {
        receivedAcctId: SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId,
        lookupStatusCode: 200,
        normalizedAcctId: SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId,
        isPhysical: true,
        accountType: 'VAM'
      }
    };
    
    // Call ValidateEnrichedMessage directly instead of processMessage
    const response = await new Promise((resolve, reject) => {
      const validationRequest = {
        message_id: 'b2c3d4e5-a6b7-4890-bcde-f12345678901',
        puid: 'G3I1234567890PACS7',
        message_type: message.messageType,
        enriched_xml_payload: message.xmlPayload,
        enrichment_data: {
          received_acct_id: message.enrichmentData.receivedAcctId,
          lookup_status_code: message.enrichmentData.lookupStatusCode,
          normalized_acct_id: message.enrichmentData.normalizedAcctId,
          is_physical: message.enrichmentData.isPhysical ? 'Y' : 'N'
        },
        timestamp: Date.now(),
        metadata: message.metadata
      };

      (testHelper as any).grpcClient.client.ValidateEnrichedMessage(validationRequest, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    }) as any;
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidUUID(response.message_id!, expect);
    SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS007', expect);
  });

  test('should validate PACS003 direct debit message', async () => {
    const message = {
      messageType: 'PACS003',
      xmlPayload: SINGAPORE_PACS_MESSAGES.PACS003,
      metadata: { country: 'SG', currency: 'SGD' },
      enrichmentData: {
        receivedAcctId: SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId,
        lookupStatusCode: 200,
        normalizedAcctId: SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId,
        isPhysical: true,
        accountType: 'CORPORATE'
      }
    };
    
    // Call ValidateEnrichedMessage directly instead of processMessage
    const response = await new Promise((resolve, reject) => {
      const validationRequest = {
        message_id: 'c3d4e5f6-a7b8-4890-adef-234567890123',
        puid: 'G3I1234567890PACS3',
        message_type: message.messageType,
        enriched_xml_payload: message.xmlPayload,
        enrichment_data: {
          received_acct_id: message.enrichmentData.receivedAcctId,
          lookup_status_code: message.enrichmentData.lookupStatusCode,
          normalized_acct_id: message.enrichmentData.normalizedAcctId,
          is_physical: message.enrichmentData.isPhysical ? 'Y' : 'N'
        },
        timestamp: Date.now(),
        metadata: message.metadata
      };

      (testHelper as any).grpcClient.client.ValidateEnrichedMessage(validationRequest, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    }) as any;
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidUUID(response.message_id!, expect);
    SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS003', expect);
  });

  test('should validate Singapore currency and country fields', async () => {
    const message = {
      messageType: 'PACS008',
      xmlPayload: SINGAPORE_PACS_MESSAGES.PACS008,
      metadata: { country: 'SG', currency: 'SGD' }
    };
    
    // Test Singapore-specific validations
    SingaporeAssertions.expectValidSingaporeXML(message.xmlPayload, expect);
    SingaporeAssertions.expectValidSingaporeBankCode(message.xmlPayload, expect);
    
    // Test generic assertions
    GenericAssertions.expectValidCurrencyCode('SGD', expect);
    GenericAssertions.expectValidCountryCode('SG', expect);
    GenericAssertions.expectValidAmount('1000.00', expect);
  });

  test('should handle validation with test accounts', async () => {
    // Use different test accounts
    const corporateAccountXml = SINGAPORE_PACS_MESSAGES.PACS008.replace(
      /<Id>.*?<\/Id>/,
      `<Id>${SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId}</Id>`
    );
    
    const testMessage = {
      messageType: 'PACS008',
      xmlPayload: corporateAccountXml,
      metadata: { country: 'SG', currency: 'SGD' },
      enrichmentData: {
        receivedAcctId: SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId,
        lookupStatusCode: 200,
        normalizedAcctId: SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId,
        isPhysical: true,
        accountType: 'CORPORATE'
      }
    };
    
    // Call ValidateEnrichedMessage directly instead of processMessage
    const response = await new Promise((resolve, reject) => {
      const validationRequest = {
        message_id: 'd4e5f6a7-b8c9-4890-befa-345678901234',
        puid: 'G3I1234567890CORP',
        message_type: testMessage.messageType,
        enriched_xml_payload: testMessage.xmlPayload,
        enrichment_data: {
          received_acct_id: testMessage.enrichmentData.receivedAcctId,
          lookup_status_code: testMessage.enrichmentData.lookupStatusCode,
          normalized_acct_id: testMessage.enrichmentData.normalizedAcctId,
          is_physical: testMessage.enrichmentData.isPhysical ? 'Y' : 'N'
        },
        timestamp: Date.now(),
        metadata: testMessage.metadata
      };

      (testHelper as any).grpcClient.client.ValidateEnrichedMessage(validationRequest, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    }) as any;
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidUUID(response.message_id!, expect);
  });
}); 