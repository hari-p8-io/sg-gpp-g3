import * as xml2js from 'xml2js';

export class XMLParser {
  /**
   * Parse XML string to JavaScript object
   */
  static async parseXML(xmlString: string): Promise<any> {
    try {
      const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
      });
      
      return await parser.parseStringPromise(xmlString);
    } catch (error) {
      throw new Error(`XML parsing failed: ${error}`);
    }
  }

  /**
   * Basic XML well-formedness check
   */
  static isWellFormedXML(xmlString: string): boolean {
    try {
      const trimmed = xmlString.trim();
      
      // Basic checks
      if (!trimmed.startsWith('<')) return false;
      if (!trimmed.endsWith('>')) return false;
      
      // Check for XML declaration or root element
      return trimmed.startsWith('<?xml') || trimmed.startsWith('<Document') || trimmed.startsWith('<');
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract message type from XML content
   */
  static extractMessageType(xmlString: string): string | null {
    try {
      // Look for PACS message type indicators in XML
      if (xmlString.includes('FIToFICstmrCdtTrf')) return 'PACS008';
      if (xmlString.includes('FIToFIPmtRvsl')) return 'PACS007';
      if (xmlString.includes('FIToFICstmrDrctDbt')) return 'PACS003';
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract basic message info for logging
   */
  static extractMessageInfo(xmlString: string): MessageInfo {
    try {
      const msgIdMatch = xmlString.match(/<MsgId>([^<]+)<\/MsgId>/);
      const creationTimeMatch = xmlString.match(/<CreDtTm>([^<]+)<\/CreDtTm>/);
      const transactionCountMatch = xmlString.match(/<NbOfTxs>([^<]+)<\/NbOfTxs>/);
      
      return {
        messageId: msgIdMatch?.[1] || null,
        creationTime: creationTimeMatch?.[1] || null,
        transactionCount: transactionCountMatch?.[1] ? parseInt(transactionCountMatch[1]) : null,
      };
    } catch (error) {
      return {
        messageId: null,
        creationTime: null,
        transactionCount: null,
      };
    }
  }
}

export interface MessageInfo {
  messageId: string | null;
  creationTime: string | null;
  transactionCount: number | null;
} 