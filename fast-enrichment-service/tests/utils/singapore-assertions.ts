import { expect } from '@playwright/test';
import { GenericAssertions } from '@gpp/pw-core';
import { SINGAPORE_BANK_CODES, SINGAPORE_TEST_CONFIG } from '../fixtures/singapore/test-accounts';

export class SingaporeAssertions extends GenericAssertions {
  
  /**
   * Validates that XML contains Singapore-specific elements
   */
  static expectValidSingaporeXML(xmlContent: string, expect: any): void {
    this.expectValidXML(xmlContent, expect);
    this.expectValidCurrencyCode('SGD', expect);
    this.expectValidCountryCode('SG', expect);
    expect(xmlContent).toContain('Ctry>SG</Ctry>');
    expect(xmlContent).toContain('Ccy="SGD"');
  }

  /**
   * Validates that XML contains valid Singapore bank codes
   */
  static expectValidSingaporeBankCode(xmlContent: string, expect: any): void {
    const bicPattern = /<BICFI>([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?)<\/BICFI>/g;
    const matches = xmlContent.match(bicPattern);
    
    expect(matches).toBeTruthy();
    if (matches) {
      for (const match of matches) {
        const bic = match.replace(/<\/?BICFI>/g, '');
        expect(SINGAPORE_BANK_CODES.some(code => bic.startsWith(code))).toBe(true);
      }
    }
  }

  /**
   * Validates Singapore currency and amount format
   */
  static expectValidSingaporeAmount(xmlContent: string, expect: any): void {
    expect(xmlContent).toContain('Ccy="SGD"');
    
    const amountPattern = /<IntrBkSttlmAmt Ccy="SGD">(\d+\.\d{2})<\/IntrBkSttlmAmt>/;
    const match = xmlContent.match(amountPattern);
    
    expect(match).toBeTruthy();
    if (match) {
      const amount = parseFloat(match[1]);
      expect(amount).toBeGreaterThan(0);
      expect(amount).toBeLessThanOrEqual(parseFloat(SINGAPORE_TEST_CONFIG.maxAmount));
    }
  }

  /**
   * Validates Singapore account ID format
   */
  static expectValidSingaporeAccountId(accountId: string, expect: any): void {
    // Singapore account IDs are typically 10-12 digits
    expect(accountId).toMatch(/^\d{10,12}$/);
  }

  /**
   * Validates enrichment service response for Singapore
   */
  static expectValidSingaporeEnrichmentResponse(response: any, expect: any): void {
    this.expectSuccessfulGrpcResponse(response, expect);
    expect(response.enrichedData).toBeDefined();
    expect(response.enrichedData.country).toBe('SG');
    expect(response.enrichedData.currency).toBe('SGD');
  }

  /**
   * Validates Singapore message structure
   */
  static expectValidSingaporeMessage(message: any, expect: any): void {
    expect(message.messageType).toMatch(/^PACS(003|007|008)$/);
    expect(message.metadata).toBeDefined();
    expect(message.metadata.country).toBe('SG');
    expect(message.metadata.currency).toBe('SGD');
    this.expectValidSingaporeXML(message.xmlPayload, expect);
  }

  /**
   * Validates Singapore timezone in timestamps
   */
  static expectValidSingaporeTimestamp(timestamp: string, expect: any): void {
    // Singapore uses UTC+8 (Asia/Singapore)
    const date = new Date(timestamp);
    expect(date.getTimezoneOffset()).toBe(-480); // UTC+8 = -480 minutes
  }
} 