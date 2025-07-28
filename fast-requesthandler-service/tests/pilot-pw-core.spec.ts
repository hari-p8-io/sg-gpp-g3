import { test, expect } from '@playwright/test';
import { 
  ServiceTestHelper, 
  SingaporeFixtures, 
  SingaporeAssertions,
  SINGAPORE_TEST_ACCOUNTS 
} from '@gpp/pw-core';

test.describe('Fast Request Handler Service - PW-Core Pilot', () => {
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

  test('should perform health check using pw-core', async () => {
    const response = await testHelper.healthCheck();
    SingaporeAssertions.expectHealthyService(response);
  });

  test('should process PACS008 message using pw-core fixtures', async () => {
    const message = SingaporeFixtures.loadPacs008();
    
    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    expect(response.messageId).toBeDefined();
    expect(response.puid).toBeDefined();
    
    SingaporeAssertions.expectValidUUID(response.messageId!);
    SingaporeAssertions.expectValidPUID(response.puid!);
    SingaporeAssertions.expectValidSingaporeXML(message.xmlPayload);
    SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS008');
  });

  test('should process PACS007 message using pw-core fixtures', async () => {
    const message = SingaporeFixtures.loadPacs007();
    
    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidUUID(response.messageId!);
    SingaporeAssertions.expectValidPUID(response.puid!);
    SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS007');
  });

  test('should process PACS003 message using pw-core fixtures', async () => {
    const message = SingaporeFixtures.loadPacs003();
    
    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidUUID(response.messageId!);
    SingaporeAssertions.expectValidPUID(response.puid!);
    SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, 'PACS003');
  });

  test('should process message and wait for storage using pw-core', async () => {
    const message = SingaporeFixtures.loadPacs008();
    
    const { response, storedMessage } = await testHelper.processMessageAndWait(message);
    
    expect(response.success).toBe(true);
    expect(storedMessage).toBeDefined();
    expect(storedMessage.message_id).toBe(response.messageId);
    expect(storedMessage.puid).toBe(response.puid);
    expect(storedMessage.message_type).toBe('PACS008');
  });

  test('should validate Singapore fields using pw-core utilities', async () => {
    const message = SingaporeFixtures.loadPacs008();
    
    // Test Singapore-specific validations
    SingaporeAssertions.expectValidSingaporeXML(message.xmlPayload);
    SingaporeAssertions.expectValidSingaporeBankCode(message.xmlPayload);
    
    // Test expected fields
    expect(message.expectedFields.currency).toBe('SGD');
    expect(message.expectedFields.country).toBe('SG');
    expect(message.expectedFields.amount).toBe('1000.00');
  });

  test('should work with test account data from pw-core', async () => {
    const message = SingaporeFixtures.loadPacs008();
    
    // Modify XML to use test account
    const modifiedXml = message.xmlPayload.replace(
      '<Id>123456789</Id>',
      `<Id>${SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId}</Id>`
    );
    
    const testMessage = {
      messageType: 'PACS008',
      xmlPayload: modifiedXml,
      metadata: { country: 'SG', currency: 'SGD' }
    };
    
    const response = await testHelper.processMessage(testMessage);
    
    expect(response.success).toBe(true);
    SingaporeAssertions.expectValidUUID(response.messageId!);
    SingaporeAssertions.expectValidPUID(response.puid!);
  });

  test('should handle all message types from pw-core', async () => {
    const messageTypes = SingaporeFixtures.getAllMessageTypes();
    
    expect(messageTypes).toContain('PACS008');
    expect(messageTypes).toContain('PACS007');
    expect(messageTypes).toContain('PACS003');
    
    for (const messageType of messageTypes) {
      const message = SingaporeFixtures.loadMessage(messageType);
      
      expect(message.messageType).toBe(messageType);
      expect(message.xmlPayload).toBeTruthy();
      expect(message.expectedFields.currency).toBe('SGD');
      expect(message.expectedFields.country).toBe('SG');
      
      SingaporeAssertions.expectValidSingaporeXML(message.xmlPayload);
      SingaporeAssertions.expectValidPacsStructure(message.xmlPayload, messageType);
    }
  });
}); 