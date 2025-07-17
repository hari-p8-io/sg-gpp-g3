import { expect as playwrightExpect } from '@playwright/test';

export class SingaporeAssertions {
  static expectValidUUID(uuid: string, expect: typeof playwrightExpect): void {
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }

  static expectValidPUID(puid: string, expect: typeof playwrightExpect): void {
    expect(puid).toMatch(/^G3I[A-Z0-9]{13}$/);
  }

  static expectValidSingaporeMessage(response: any, expect: typeof playwrightExpect): void {
    expect(response.currency || response.expectedFields?.currency).toBe('SGD');
    expect(response.country || response.expectedFields?.country).toBe('SG');
    if (response.timezone) {
      expect(response.timezone).toMatch(/\+08:00/);
    }
  }

  static expectValidSingaporeXML(xmlPayload: string, expect: typeof playwrightExpect): void {
    expect(xmlPayload).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmlPayload).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs');
    expect(xmlPayload).toContain('Ccy="SGD"');
    expect(xmlPayload).toContain('<Ctry>SG</Ctry>');
  }

  static expectValidPacsStructure(xmlPayload: string, messageType: string, expect: typeof playwrightExpect): void {
    expect(xmlPayload).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmlPayload).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs');
    
    switch (messageType) {
      case 'PACS008':
        expect(xmlPayload).toContain('<FIToFICstmrCdtTrf>');
        expect(xmlPayload).toContain('<CdtTrfTxInf>');
        break;
      case 'PACS007':
        expect(xmlPayload).toContain('<FIToFIPmtRvsl>');
        expect(xmlPayload).toContain('<TxInf>');
        break;
      case 'PACS003':
        expect(xmlPayload).toContain('<FIToFICstmrDrctDbt>');
        expect(xmlPayload).toContain('<DrctDbtTxInf>');
        break;
      default:
        throw new Error(`Unknown message type: ${messageType}`);
    }
  }

  static expectHealthyService(healthResponse: any, expect: typeof playwrightExpect): void {
    expect(healthResponse.healthy).toBe(true);
    expect(healthResponse.status).toBe('healthy');
    expect(healthResponse.timestamp).toBeDefined();
  }

  static expectValidAccountLookup(enrichmentData: any, expect: typeof playwrightExpect): void {
    expect(enrichmentData.receivedAcctId).toBeTruthy();
    expect(enrichmentData.lookupStatusCode).toBe(200);
    expect(enrichmentData.normalizedAcctId).toBeTruthy();
  }

  static expectValidEnrichmentData(enrichmentData: any, expect: typeof playwrightExpect): void {
    expect(enrichmentData).toBeDefined();
    expect(enrichmentData.physicalAcctInfo).toBeDefined();
    expect(enrichmentData.physicalAcctInfo.acctSys).toBeDefined();
    expect(enrichmentData.authMethod).toBeDefined();
  }

  static expectValidValidationResult(validationResult: any, expect: typeof playwrightExpect): void {
    expect(validationResult).toBeDefined();
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.validationErrors).toBeDefined();
    expect(Array.isArray(validationResult.validationErrors)).toBe(true);
  }

  static expectValidOrchestrationStatus(orchestrationStatus: any, expect: typeof playwrightExpect): void {
    expect(orchestrationStatus).toBeDefined();
    expect(orchestrationStatus.messageId).toBeDefined();
    expect(orchestrationStatus.status).toBeDefined();
    expect(orchestrationStatus.currentStep).toBeDefined();
    expect(Array.isArray(orchestrationStatus.steps)).toBe(true);
  }

  static expectValidRouting(routingDecision: string, expectedRoute: string, expect: typeof playwrightExpect): void {
    expect(routingDecision).toBe(expectedRoute);
  }
} 