// Note: expect is expected to be available in the test context where this is used
// Do not import expect to avoid circular dependency issues

export class GenericAssertions {
  
  /**
   * Validates that a string is a valid UUID
   */
  static expectValidUUID(value: string, expect: any): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(value).toMatch(uuidRegex);
  }

  /**
   * Validates that a string is valid XML
   */
  static expectValidXML(xmlContent: string, expect: any): void {
    expect(xmlContent).toContain('<?xml version="1.0"');
    expect(xmlContent).toContain('<Document xmlns="');
    expect(xmlContent).not.toContain('undefined');
    expect(xmlContent).not.toContain('null');
  }

  /**
   * Validates that XML contains required ISO 20022 structure
   */
  static expectValidISO20022Structure(xmlContent: string, expect: any): void {
    expect(xmlContent).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:');
    expect(xmlContent).toContain('<GrpHdr>');
    expect(xmlContent).toContain('<MsgId>');
    expect(xmlContent).toContain('<CreDtTm>');
  }

  /**
   * Validates that XML contains required PACS message structure
   */
  static expectValidPacsStructure(xmlContent: string, messageType: string, expect: any): void {
    this.expectValidISO20022Structure(xmlContent, expect);
    expect(xmlContent).toContain(`pacs.${messageType.toLowerCase().replace('pacs', '').padStart(3, '0')}`);
  }

  /**
   * Validates that a currency code is valid ISO 4217 format
   */
  static expectValidCurrencyCode(currencyCode: string, expect: any): void {
    expect(currencyCode).toMatch(/^[A-Z]{3}$/);
  }

  /**
   * Validates that a country code is valid ISO 3166-1 alpha-2 format
   */
  static expectValidCountryCode(countryCode: string, expect: any): void {
    expect(countryCode).toMatch(/^[A-Z]{2}$/);
  }

  /**
   * Validates that an amount is in valid decimal format
   */
  static expectValidAmount(amount: string | number, expect: any): void {
    if (typeof amount === 'string') {
      expect(amount).toMatch(/^\d+(\.\d{1,2})?$/);
    } else {
      expect(amount).toBeGreaterThan(0);
    }
  }

  /**
   * Validates that a BIC (Bank Identifier Code) is in valid format
   */
  static expectValidBIC(bic: string, expect: any): void {
    expect(bic).toMatch(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/);
  }

  /**
   * Validates that a message contains required financial message elements
   */
  static expectValidFinancialMessage(xmlContent: string, expect: any): void {
    this.expectValidXML(xmlContent, expect);
    expect(xmlContent).toContain('<IntrBkSttlmAmt');
    expect(xmlContent).toContain('Ccy="');
  }

  /**
   * Validates that a gRPC response is successful
   */
  static expectSuccessfulGrpcResponse(response: any, expect: any): void {
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.messageId).toBeDefined();
    this.expectValidUUID(response.messageId, expect);
  }

  /**
   * Validates that a health check response is healthy
   */
  static expectHealthyService(response: any, expect: any): void {
    expect(response).toBeDefined();
    expect(response.healthy).toBe(true);
    expect(response.service).toBeDefined();
  }
} 