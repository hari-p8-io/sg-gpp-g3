import { test, expect } from '@playwright/test';
import { GenericAssertions, MessageBuilder } from '@gpp/pw-core';
import { SINGAPORE_TEST_ACCOUNTS, SINGAPORE_TEST_CONFIG } from './fixtures/singapore/test-accounts';
import { SINGAPORE_PACS_MESSAGES, SINGAPORE_MESSAGE_TYPES } from './fixtures/singapore/pacs-messages';
import { SingaporeAssertions } from './utils/singapore-assertions';

test.describe('Fast Enrichment Service - PW-Core Integration', () => {

  test('should validate Singapore test accounts', async () => {
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT).toBeDefined();
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId).toBeTruthy();
    expect(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountType).toBeTruthy();
    
    expect(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT).toBeDefined();
    expect(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId).toBeTruthy();
    
    expect(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL).toBeDefined();
    expect(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL.accountId).toBeTruthy();

    // Test Singapore account ID format
    SingaporeAssertions.expectValidSingaporeAccountId(SINGAPORE_TEST_ACCOUNTS.VAM_ACCOUNT.accountId, expect);
    SingaporeAssertions.expectValidSingaporeAccountId(SINGAPORE_TEST_ACCOUNTS.CORPORATE_ACCOUNT.accountId, expect);
    SingaporeAssertions.expectValidSingaporeAccountId(SINGAPORE_TEST_ACCOUNTS.STANDARD_RETAIL.accountId, expect);
  }, expect);

  test('should validate Singapore PACS messages', async () => {
    for (const messageType of SINGAPORE_MESSAGE_TYPES) {
      const xmlContent = SINGAPORE_PACS_MESSAGES[messageType];
      
      // Use generic assertions
      GenericAssertions.expectValidXML(xmlContent, expect);
      GenericAssertions.expectValidPacsStructure(xmlContent, messageType, expect);
      GenericAssertions.expectValidFinancialMessage(xmlContent, expect);
      
      // Use Singapore-specific assertions
      SingaporeAssertions.expectValidSingaporeXML(xmlContent, expect);
      SingaporeAssertions.expectValidSingaporeBankCode(xmlContent, expect);
      SingaporeAssertions.expectValidSingaporeAmount(xmlContent, expect);
    }
  }, expect);

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
    
    expect(message.messageType).toBe('PACS008', expect);
    expect(message.metadata).toBeDefined();
    expect(message.metadata?.currency).toBe('SGD', expect);
    expect(message.metadata?.country).toBe('SG', expect);
    expect(message.xmlPayload).toBeDefined();
    
    // Validate using Singapore assertions
    SingaporeAssertions.expectValidSingaporeMessage(message, expect);
  }, expect);

  test('should validate generic assertions work with Singapore data', async () => {
    const testUuid = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';
    GenericAssertions.expectValidUUID(testUuid, expect);
    
    GenericAssertions.expectValidCurrencyCode('SGD', expect);
    GenericAssertions.expectValidCountryCode('SG', expect);
    GenericAssertions.expectValidAmount('1000.00', expect);
    GenericAssertions.expectValidBIC('DBSSSGSG', expect);
  }, expect);

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
      expect(message.messageType).toBe(messageType, expect);
      expect(message.metadata?.currency).toBe('SGD', expect);
      expect(message.metadata?.country).toBe('SG', expect);
      
      // Validate using Singapore assertions
      SingaporeAssertions.expectValidSingaporeMessage(message, expect);
    }
  }, expect);

  test('should demonstrate extensibility for future countries', async () => {
    // This test shows how the generic pw-core utilities can be extended
    // for other countries like Hong Kong, India, Taiwan
    
    // Generic assertions that work for any country
    GenericAssertions.expectValidCurrencyCode('HKD', expect); // Hong Kong
    GenericAssertions.expectValidCurrencyCode('INR', expect); // India
    GenericAssertions.expectValidCurrencyCode('TWD', expect); // Taiwan
    
    GenericAssertions.expectValidCountryCode('HK', expect);
    GenericAssertions.expectValidCountryCode('IN', expect);
    GenericAssertions.expectValidCountryCode('TW', expect);
    
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
    
    expect(hkMessage.metadata?.currency).toBe('HKD', expect);
    expect(hkMessage.metadata?.country).toBe('HK', expect);
  }, expect);
}, expect); 