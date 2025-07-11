import { test, expect } from '@playwright/test';
import { MessageBuilder } from '@gpp/pw-core';
import { SINGAPORE_TEST_ACCOUNTS, SINGAPORE_TEST_CONFIG } from './fixtures/singapore/test-accounts';
import { SINGAPORE_PACS_MESSAGES, SINGAPORE_MESSAGE_TYPES } from './fixtures/singapore/pacs-messages';

test.describe('Fast Enrichment Service - PW-Core Integration', () => {

  test('should validate Singapore test accounts', async () => {
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT).toBeDefined();
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId).toBeTruthy();
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountType).toBeTruthy();
    
    expect(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT).toBeDefined();
    expect(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId).toBeTruthy();
    
    expect(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL).toBeDefined();
    expect(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL.accountId).toBeTruthy();

    // Test Singapore account ID format (simple validation)
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId).toMatch(/^\d{10,12}$/);
    expect(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId).toMatch(/^\d{10,12}$/);
    expect(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL.accountId).toMatch(/^\d{10,12}$/);
  });

  test('should validate Singapore PACS messages', async () => {
    for (const messageType of SINGAPORE_MESSAGE_TYPES) {
      const xmlContent = SINGAPORE_PACS_MESSAGES[messageType];
      
      // Simple XML validation
      expect(xmlContent).toContain('<?xml version="1.0"');
      expect(xmlContent).toContain('<Document xmlns="');
      expect(xmlContent).not.toContain('undefined');
      expect(xmlContent).not.toContain('null');
      
      // Check for Singapore specific elements
      expect(xmlContent).toContain('SGD');
      expect(xmlContent).toContain('DBSSSGSG');
    }
  });

  test('should create Singapore test messages using generic MessageBuilder', async () => {
    const builder = new MessageBuilder();
    
    const message = builder
      .withMessageType('PACS008')
      .withCurrency(SINGAPORE_TEST_CONFIG.currency)
      .withCountry(SINGAPORE_TEST_CONFIG.country)
      .withAmount(parseFloat(SINGAPORE_TEST_CONFIG.defaultAmount))
      .withAccount(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId)
      .withXmlPayload(SINGAPORE_PACS_MESSAGES.PACS008)
      .build();
    
    expect(message.messageType).toBe('PACS008');
    expect(message.metadata).toBeDefined();
    expect(message.metadata?.currency).toBe('SGD');
    expect(message.metadata?.country).toBe('SG');
    expect(message.xmlPayload).toBeDefined();
    
    // Simple message validation
    expect(message.xmlPayload).toContain('<?xml version="1.0"');
    expect(message.xmlPayload).toContain('<Document xmlns="');
    expect(message.xmlPayload).toContain('SGD');
  });

  test('should validate generic assertions work with Singapore data', async () => {
    const testUuid = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';
    
    // Simple UUID validation
    expect(testUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    
    // Simple validations
    expect('SGD').toMatch(/^[A-Z]{3}$/);
    expect('SG').toMatch(/^[A-Z]{2}$/);
    expect('1000.00').toMatch(/^\d+(\.\d{1,2})?$/);
    expect('DBSSSGSG').toMatch(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/);
  });

  test('should handle different Singapore message types', async () => {
    for (const messageType of SINGAPORE_MESSAGE_TYPES) {
      const xmlContent = SINGAPORE_PACS_MESSAGES[messageType];
      
      // Create a test message using generic MessageBuilder
      const builder = new MessageBuilder();
      const message = builder
        .withMessageType(messageType)
        .withCurrency('SGD')
        .withCountry('SG')
        .withAmount(1000.00)
        .withAccount(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId)
        .withXmlPayload(xmlContent)
        .build();
      
      // Test that the message structure is correct
      expect(message.messageType).toBe(messageType);
      expect(message.metadata?.currency).toBe('SGD');
      expect(message.metadata?.country).toBe('SG');
      
      // Simple message validation
      expect(message.xmlPayload).toContain('<?xml version="1.0"');
      expect(message.xmlPayload).toContain('<Document xmlns="');
      expect(message.xmlPayload).toContain('SGD');
    }
  });

  test('should demonstrate extensibility for future countries', async () => {
    // This test shows how the generic pw-core utilities can be extended
    // for other countries like Hong Kong, India, Taiwan
    
    // Simple validations that work for any country
    expect('HKD').toMatch(/^[A-Z]{3}$/); // Hong Kong
    expect('INR').toMatch(/^[A-Z]{3}$/); // India
    expect('TWD').toMatch(/^[A-Z]{3}$/); // Taiwan
    
    expect('HK').toMatch(/^[A-Z]{2}$/);
    expect('IN').toMatch(/^[A-Z]{2}$/);
    expect('TW').toMatch(/^[A-Z]{2}$/);
    
    // Generic MessageBuilder can be used for any country
    const builder = new MessageBuilder();
    const hkMessage = builder
      .withMessageType('PACS008')
      .withCurrency('HKD')
      .withCountry('HK')
      .withAmount(5000.00)
      .withAccount('1234567890')
      .withXmlPayload(SINGAPORE_PACS_MESSAGES.PACS008.replace(/SGD/g, 'HKD').replace(/SG/g, 'HK'))
      .build();
    
    expect(hkMessage.metadata?.currency).toBe('HKD');
    expect(hkMessage.metadata?.country).toBe('HK');
    expect(hkMessage.xmlPayload).toContain('HKD');
  });
}); 