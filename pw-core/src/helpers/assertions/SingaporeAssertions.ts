import { expect } from '@playwright/test';

export class SingaporeAssertions {
  static expectValidSingaporeMessage(response: any): void {
    expect(response.currency || response.expectedFields?.currency).toBe('SGD');
    expect(response.country || response.expectedFields?.country).toBe('SG');
    
    // Check for Singapore timezone if present
    if (response.timezone) {
      expect(response.timezone).toMatch(/\+08:00|Asia\/Singapore/);
    }
  }

  static expectValidPUID(puid: string): void {
    expect(puid).toMatch(/^G3I[A-Z0-9]{13}$/);
  }

  static expectValidUUID(uuid: string): void {
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }

  static expectValidAccountLookup(enrichmentData: any): void {
    expect(enrichmentData.receivedAcctId).toBeTruthy();
    expect(enrichmentData.lookupStatusCode).toBe(200);
    expect(enrichmentData.normalizedAcctId).toBeTruthy();
    expect(enrichmentData.isPhysical).toBe('Y');
  }

  static expectValidSingaporeXML(xmlPayload: string): void {
    // Check for SGD currency
    expect(xmlPayload).toContain('SGD');
    
    // Check for Singapore country code
    expect(xmlPayload).toContain('<Ctry>SG</Ctry>');
    
    // Check for Singapore postal code pattern (6 digits)
    expect(xmlPayload).toMatch(/<PstCd>\d{6}<\/PstCd>/);
  }

  static expectValidSingaporeBankCode(xmlPayload: string): void {
    const singaporeBankCodes = [
      'ANZBSG3MXXX', 'OCBCSG3MXXX', 'UOBSG3MXXX', 'DBSSSG3MXXX',
      'CITISGSXXX', 'HSBCSG3MXXX', 'SCBLSG3MXXX'
    ];
    
    const hasSingaporeBankCode = singaporeBankCodes.some(code => 
      xmlPayload.includes(code)
    );
    
    expect(hasSingaporeBankCode).toBe(true);
  }

  static expectValidPacsStructure(xmlPayload: string, messageType: string): void {
    switch (messageType.toUpperCase()) {
      case 'PACS008':
        expect(xmlPayload).toContain('<FIToFICstmrCdtTrf>');
        expect(xmlPayload).toContain('<CdtTrfTxInf>');
        expect(xmlPayload).toContain('<Dbtr>');
        expect(xmlPayload).toContain('<Cdtr>');
        break;
      case 'PACS007':
        expect(xmlPayload).toContain('<FIToFIPmtRvsl>');
        expect(xmlPayload).toContain('<RvslId>');
        expect(xmlPayload).toContain('<OrgnlGrpInf>');
        expect(xmlPayload).toContain('<RvslRsnInf>');
        break;
      case 'PACS003':
        expect(xmlPayload).toContain('<FIToFICstmrDrctDbt>');
        expect(xmlPayload).toContain('<DrctDbtTxInf>');
        expect(xmlPayload).toContain('<Cdtr>');
        expect(xmlPayload).toContain('<Dbtr>');
        break;
      default:
        throw new Error(`PACS structure validation not implemented for: ${messageType}`);
    }
  }

  static expectValidEnrichmentData(enrichmentData: any): void {
    expect(enrichmentData).toBeDefined();
    expect(enrichmentData.receivedAcctId).toBeTruthy();
    expect(enrichmentData.lookupStatusCode).toBeTruthy();
    expect(enrichmentData.lookupStatusDesc).toBeTruthy();
    expect(enrichmentData.isPhysical).toBeTruthy();
    
    if (enrichmentData.physicalAcctInfo) {
      expect(enrichmentData.physicalAcctInfo.acctId).toBeTruthy();
      expect(enrichmentData.physicalAcctInfo.acctSys).toBeTruthy();
      expect(enrichmentData.physicalAcctInfo.country).toBeTruthy();
      expect(enrichmentData.physicalAcctInfo.currencyCode).toBeTruthy();
    }
  }

  static expectValidValidationResult(validationResult: any): void {
    expect(validationResult).toBeDefined();
    expect(validationResult.isValid).toBe(true);
    
    if (validationResult.currencyValidation) {
      expect(validationResult.currencyValidation.isValid).toBe(true);
      expect(validationResult.currencyValidation.currencyCode).toBe('SGD');
    }
    
    if (validationResult.countryValidation) {
      expect(validationResult.countryValidation.isValid).toBe(true);
      expect(validationResult.countryValidation.countryCode).toBe('SG');
    }
  }

  static expectHealthyService(healthResponse: any): void {
    expect(healthResponse).toBeDefined();
    expect(healthResponse.status).toBeTruthy();
    expect(healthResponse.timestamp).toBeTruthy();
    
    // Handle different health status formats
    if (typeof healthResponse.status === 'string') {
      expect(healthResponse.status).toBe('SERVING');
    } else if (typeof healthResponse.status === 'number') {
      expect(healthResponse.status).toBe(1); // SERVING = 1
    }
  }
} 