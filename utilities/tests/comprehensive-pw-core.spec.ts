import { test, expect } from '@playwright/test';
import { 
  ServiceTestHelper, 
  SingaporeFixtures, 
  SingaporeAssertions,
  SINGAPORE_TEST_ACCOUNTS,
  MessageBuilder,
  extendPlaywrightMatchers
} from '@gpp/pw-core';

// Extend Playwright with custom matchers
extendPlaywrightMatchers();

test.describe('Fast Request Handler Service - Comprehensive PW-Core Test', () => {
  let testHelper: ServiceTestHelper;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('fast-requesthandler-service');
    await testHelper.initialize();
  });

  test.beforeEach(async () => {
    await testHelper.setupTest();
  });

  test.afterEach(async () => {
    await testHelper.teardownTest();
  });

  test.afterAll(async () => {
    await testHelper.shutdown();
  });

  test.describe('Health Check with Custom Matchers', () => {
    test('should return healthy status using custom matcher', async () => {
      const response = await testHelper.healthCheck();
      expect(response).toBeHealthyService();
    });
  });

  test.describe('Message Processing with Fixtures', () => {
    test('should process PACS008 message from fixtures', async () => {
      const message = SingaporeFixtures.loadPacs008();
      
      const response = await testHelper.processMessage(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      expect(message.xmlPayload).toHaveValidPacsStructure('PACS008');
      expect(message).toHaveValidSingaporeFields();
    });

    test('should process PACS007 message from fixtures', async () => {
      const message = SingaporeFixtures.loadPacs007();
      
      const response = await testHelper.processMessage(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      expect(message.xmlPayload).toHaveValidPacsStructure('PACS007');
    });

    test('should process PACS003 message from fixtures', async () => {
      const message = SingaporeFixtures.loadPacs003();
      
      const response = await testHelper.processMessage(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      expect(message.xmlPayload).toHaveValidPacsStructure('PACS003');
    });
  });

  test.describe('Message Builder Pattern', () => {
    test('should build PACS008 message with MessageBuilder', async () => {
      const pacs008Template = SingaporeFixtures.loadPacs008();
      
      const message = new MessageBuilder()
        .withMessageType('PACS008')
        .withXmlPayload(pacs008Template.xmlPayload)
        .withAmount(2500.50)
        .withAccount(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId)
        .withSingaporeDefaults()
        .withMetadata({ source: 'test-builder' })
        .build();

      const response = await testHelper.processMessage(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      expect(message.xmlPayload).toHaveValidPacsStructure('PACS008');
      expect(message).toHaveValidSingaporeFields();
      expect(message.expectedFields.amount).toBe('2500.50');
      expect(message.expectedFields.accountId).toBe(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId);
    });

    test('should build VAM account message with MessageBuilder', async () => {
      const pacs008Template = SingaporeFixtures.loadPacs008();
      
      const message = new MessageBuilder()
        .withMessageType('PACS008')
        .withXmlPayload(pacs008Template.xmlPayload)
        .withAmount(50000.00)
        .withAccount(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId)
        .withSingaporeDefaults()
        .withMetadata({ 
          source: 'test-builder',
          expectedSystem: 'VAM',
          expectedAuth: 'GROUPLIMIT'
        })
        .build();

      const response = await testHelper.processMessage(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      expect(message.expectedFields.accountId).toBe(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId);
    });
  });

  test.describe('Complete Flow with Storage', () => {
    test('should process message and verify storage', async () => {
      const message = new MessageBuilder()
        .withMessageType('PACS008')
        .withXmlPayload(SingaporeFixtures.loadPacs008().xmlPayload)
        .withAmount(1500.00)
        .withAccount(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL.accountId)
        .withSingaporeDefaults()
        .build();

      const { response, storedMessage } = await testHelper.processMessageAndWait(message);
      
      expect(response.success).toBe(true);
      expect(response.messageId).toBeValidUUID();
      expect(response.puid).toBeValidPUID();
      
      expect(storedMessage).toBeDefined();
      expect(storedMessage.message_id).toBe(response.messageId);
      expect(storedMessage.puid).toBe(response.puid);
      expect(storedMessage.message_type).toBe('PACS008');
      expect(storedMessage.status).toBe('processed');
    });
  });

  test.describe('All Message Types Integration', () => {
    test('should handle all supported message types', async () => {
      const messageTypes = SingaporeFixtures.getAllMessageTypes();
      
      for (const messageType of messageTypes) {
        const fixture = SingaporeFixtures.loadMessage(messageType);
        
        const message = new MessageBuilder()
          .withMessageType(messageType)
          .withXmlPayload(fixture.xmlPayload)
          .withSingaporeDefaults()
          .build();

        const response = await testHelper.processMessage(message);
        
        expect(response.success).toBe(true);
        expect(response.messageId).toBeValidUUID();
        expect(response.puid).toBeValidPUID();
        expect(message.xmlPayload).toHaveValidPacsStructure(messageType);
        expect(message).toHaveValidSingaporeFields();
      }
    });
  });
}); 