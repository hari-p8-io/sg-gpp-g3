// @ts-ignore - fast-xml-parser will be installed via npm
import { XMLParser } from 'fast-xml-parser';
import { logger } from './logger';

export interface ParsedXMLData {
  document: any;
  cdtrAcct?: string;
  currency?: string;
  country?: string;
  amount?: string;
  enrichmentData?: any;
}

export class XMLParserUtil {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true
    });
  }

  parseXML(xmlString: string): ParsedXMLData {
    try {
      const parsed = this.parser.parse(xmlString);
      logger.debug('XML parsed successfully', { hasDocument: !!parsed.Document });

      const result: ParsedXMLData = {
        document: parsed
      };

      // Extract common PACS fields
      if (parsed.Document) {
        const cdtrAcct = this.extractCdtrAcct(parsed.Document);
        const currency = this.extractCurrency(parsed.Document);
        const country = this.extractCountry(parsed.Document);
        const amount = this.extractAmount(parsed.Document);
        const enrichmentData = this.extractEnrichmentData(parsed.Document);
        
        if (cdtrAcct !== undefined) result.cdtrAcct = cdtrAcct;
        if (currency !== undefined) result.currency = currency;
        if (country !== undefined) result.country = country;
        if (amount !== undefined) result.amount = amount;
        if (enrichmentData !== undefined) result.enrichmentData = enrichmentData;
      }

      return result;
    } catch (error) {
      logger.error('Error parsing XML', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  convertToJSON(xmlString: string, enrichmentData?: any, messageId?: string, puid?: string, messageType?: string): any {
    try {
      const parsed = this.parseXML(xmlString);
      
      // Create JSON structure with enrichment data
      const jsonPayload = {
        messageId: messageId || this.generateMessageId(),
        puid: puid || undefined,
        messageType: messageType || undefined,
        timestamp: new Date().toISOString(),
        originalXML: xmlString,
        parsedData: parsed.document,
        extractedFields: {
          cdtrAcct: parsed.cdtrAcct,
          currency: parsed.currency,
          country: parsed.country,
          amount: parsed.amount
        },
        enrichmentData: enrichmentData || parsed.enrichmentData,
        validationTimestamp: new Date().toISOString(),
        service: 'fast-validation-service'
      };

      return jsonPayload;
    } catch (error) {
      logger.error('Error converting XML to JSON', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new Error(`XML to JSON conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractCdtrAcct(document: any): string | undefined {
    try {
      // Try different paths for CdtrAcct
      const paths = [
        // PACS008 paths
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAcct?.Id?.Othr?.Id',
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAcct?.Id?.IBAN',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.CdtrAcct?.Id?.Othr?.Id',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.CdtrAcct?.Id?.IBAN',
        // PACS007 reversal paths
        'FIToFIPmtRvsl?.TxInf?.OrgnlTxRef?.CdtrAcct?.Id?.Othr?.Id',
        'FIToFIPmtRvsl?.TxInf?.OrgnlTxRef?.CdtrAcct?.Id?.IBAN',
        // PACS003 direct debit paths
        'FIToFICstmrDrctDbt?.DrctDbtTxInf?.CdtrAcct?.Id?.Othr?.Id',
        'FIToFICstmrDrctDbt?.DrctDbtTxInf?.CdtrAcct?.Id?.IBAN'
      ];

      for (const path of paths) {
        const value = this.getNestedValue(document, path);
        if (value) {
          return value.toString();
        }
      }
    } catch (error) {
      logger.debug('Error extracting CdtrAcct', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return undefined;
  }

  private extractCurrency(document: any): string | undefined {
    try {
      const paths = [
        // PACS008 paths
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.IntrBkSttlmAmt?.@_Ccy',
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.InstdAmt?.@_Ccy',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.IntrBkSttlmAmt?.@_Ccy',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.InstdAmt?.@_Ccy',
        // PACS007 reversal paths
        'FIToFIPmtRvsl?.TxInf?.OrgnlTxRef?.IntrBkSttlmAmt?.@_Ccy',
        'FIToFIPmtRvsl?.TxInf?.OrgnlTxRef?.InstdAmt?.@_Ccy',
        // PACS003 direct debit paths
        'FIToFICstmrDrctDbt?.DrctDbtTxInf?.IntrBkSttlmAmt?.@_Ccy',
        'FIToFICstmrDrctDbt?.DrctDbtTxInf?.InstdAmt?.@_Ccy'
      ];

      for (const path of paths) {
        const value = this.getNestedValue(document, path);
        if (value) {
          return value.toString();
        }
      }
    } catch (error) {
      logger.debug('Error extracting currency', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return undefined;
  }

  private extractCountry(document: any): string | undefined {
    try {
      const paths = [
        // Check creditor postal address first
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.Cdtr?.PstlAdr?.Ctry',
        // Check debtor postal address
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.Dbtr?.PstlAdr?.Ctry',
        // Check agent addresses as fallback
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry',
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.DbtrAgt?.FinInstnId?.PstlAdr?.Ctry',
        // Check for other message types
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.Cdtr?.PstlAdr?.Ctry',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.Dbtr?.PstlAdr?.Ctry',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.DbtrAgt?.FinInstnId?.PstlAdr?.Ctry',
        // Check for PACS007 reversal messages
        'FIToFIPmtRvsl?.TxInf?.OrgnlTxRef?.Cdtr?.PstlAdr?.Ctry',
        'FIToFIPmtRvsl?.TxInf?.OrgnlTxRef?.Dbtr?.PstlAdr?.Ctry',
        // Check for PACS003 direct debit messages
        'FIToFICstmrDrctDbt?.DrctDbtTxInf?.Cdtr?.PstlAdr?.Ctry',
        'FIToFICstmrDrctDbt?.DrctDbtTxInf?.Dbtr?.PstlAdr?.Ctry'
      ];

      for (const path of paths) {
        const value = this.getNestedValue(document, path);
        if (value) {
          return value.toString();
        }
      }
    } catch (error) {
      logger.debug('Error extracting country', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return undefined;
  }

  private extractAmount(document: any): string | undefined {
    try {
      const paths = [
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.IntrBkSttlmAmt?.#text',
        'FIToFICstmrCdtTrf?.CdtTrfTxInf?.InstdAmt?.#text',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.IntrBkSttlmAmt?.#text',
        'CstmrCdtTrfInitn?.CdtTrfTxInf?.InstdAmt?.#text'
      ];

      for (const path of paths) {
        const value = this.getNestedValue(document, path);
        if (value) {
          return value.toString();
        }
      }
    } catch (error) {
      logger.debug('Error extracting amount', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return undefined;
  }

  private extractEnrichmentData(document: any): any {
    try {
      const enrichmentPath = 'EnrichmentData';
      return this.getNestedValue(document, enrichmentPath);
    } catch (error) {
      logger.debug('Error extracting enrichment data', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return undefined;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (key.includes('?')) {
        const cleanKey = key.replace('?', '');
        return current && current[cleanKey];
      }
      return current && current[key];
    }, obj);
  }

  private generateMessageId(): string {
    return `VAL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
}

export const xmlParser = new XMLParserUtil(); 