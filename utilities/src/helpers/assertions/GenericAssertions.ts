// Note: expect function is passed as parameter to avoid import conflicts

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
   * Validates that a string is a valid PACS message structure
   */
  static expectValidPacsStructure(xmlContent: string, messageType: string, expect: any): void {
    expect(xmlContent).toContain('<Document xmlns="');
    expect(xmlContent).toContain('FIToFI');
    expect(xmlContent).toContain('<GrpHdr>');
    expect(xmlContent).toContain('<MsgId>');
    expect(xmlContent).toContain('<CreDtTm>');
    
    // Check for specific message type patterns
    if (messageType === 'PACS008') {
      expect(xmlContent).toContain('CstmrCdtTrf');
    } else if (messageType === 'PACS007') {
      expect(xmlContent).toContain('FIToFIRvsl');
    } else if (messageType === 'PACS003') {
      expect(xmlContent).toContain('FIToFIDrctDbt');
    }
  }

  /**
   * Validates that a string is a valid financial message
   */
  static expectValidFinancialMessage(xmlContent: string, expect: any): void {
    this.expectValidXML(xmlContent, expect);
    expect(xmlContent).toContain('Document xmlns="urn:iso:std:iso:20022');
    expect(xmlContent).toContain('<GrpHdr>');
  }

  /**
   * Validates that a string is a valid currency code
   */
  static expectValidCurrencyCode(currencyCode: string, expect: any): void {
    expect(currencyCode).toMatch(/^[A-Z]{3}$/);
  }

  /**
   * Validates that a string is a valid country code
   */
  static expectValidCountryCode(countryCode: string, expect: any): void {
    expect(countryCode).toMatch(/^[A-Z]{2}$/);
  }

  /**
   * Validates that a string is a valid amount
   */
  static expectValidAmount(amount: string, expect: any): void {
    expect(amount).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(parseFloat(amount)).toBeGreaterThan(0);
  }

  /**
   * Validates that a string is a valid BIC code
   */
  static expectValidBIC(bic: string, expect: any): void {
    expect(bic).toMatch(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/);
  }

  /**
   * Validates that a string is a valid ISO20022 message
   */
  static expectValidISO20022(xmlContent: string, expect: any): void {
    expect(xmlContent).toContain('xmlns="urn:iso:std:iso:20022');
    expect(xmlContent).toContain('<Document');
    expect(xmlContent).toContain('</Document>');
  }

  /**
   * Validates successful gRPC response
   */
  static expectSuccessfulGrpcResponse(response: any, expect: any): void {
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.messageId).toBeDefined();
  }

  /**
   * Validates that a timestamp is valid
   */
  static expectValidTimestamp(timestamp: string, expect: any): void {
    const date = new Date(timestamp);
    expect(date.getTime()).not.toBeNaN();
    expect(date.getTime()).toBeGreaterThan(0);
  }

  /**
   * Validates that an account ID follows expected patterns
   */
  static expectValidAccountId(accountId: string, expect: any): void {
    expect(accountId).toBeDefined();
    expect(accountId.length).toBeGreaterThan(0);
    expect(accountId).toMatch(/^[A-Za-z0-9]+$/);
  }

  /**
   * Validates that a message ID is properly formatted
   */
  static expectValidMessageId(messageId: string, expect: any): void {
    expect(messageId).toBeDefined();
    expect(messageId.length).toBeGreaterThan(0);
    // Can be UUID or other format
    expect(messageId).toMatch(/^[A-Za-z0-9-_]+$/);
  }
} 