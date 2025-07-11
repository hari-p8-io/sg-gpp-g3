import { parseString } from 'xml2js';
import { logger } from './logger';

/**
 * Extracts CdtrAcct (creditor account) from XML payload
 */
export async function extractCdtrAcct(xmlPayload: string): Promise<string | null> {
  try {
    const result = await new Promise<any>((resolve, reject) => {
      parseString(xmlPayload, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Try to extract CdtrAcct from various PACS message types
    const cdtrAcct = findCdtrAcctInObject(result);
    
    if (cdtrAcct) {
      logger.debug('CdtrAcct extracted successfully', { cdtrAcct });
      return cdtrAcct;
    } else {
      logger.warn('CdtrAcct not found in XML payload');
      return null;
    }

  } catch (error) {
    logger.error('Error parsing XML payload', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return null;
  }
}

/**
 * Internal function to find CdtrAcct in parsed object structure
 */
function findCdtrAcctInObject(obj: any): string | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  // Check if this object contains CdtrAcct structure
  if (obj.CdtrAcct) {
    return extractAccountId(obj.CdtrAcct);
  }

  // Recursively search through the object
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findCdtrAcctInObject(obj[key]);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Internal function to extract account ID from CdtrAcct structure
 */
function extractAccountId(cdtrAcct: any): string | null {
  try {
    // Handle array case (xml2js may wrap single elements in arrays)
    const cdtrAcctData = Array.isArray(cdtrAcct) ? cdtrAcct[0] : cdtrAcct;

    // Try different account ID structures
    if (cdtrAcctData.Id) {
      const idData = Array.isArray(cdtrAcctData.Id) ? cdtrAcctData.Id[0] : cdtrAcctData.Id;
      
      // Try <Id><Othr><Id>ACCOUNT_ID</Id></Othr></Id>
      if (idData.Othr) {
        const othrData = Array.isArray(idData.Othr) ? idData.Othr[0] : idData.Othr;
        if (othrData.Id) {
          const accountId = Array.isArray(othrData.Id) ? othrData.Id[0] : othrData.Id;
          return typeof accountId === 'string' ? accountId : accountId._;
        }
      }

      // Try <Id><IBAN>ACCOUNT_ID</IBAN></Id>
      if (idData.IBAN) {
        const iban = Array.isArray(idData.IBAN) ? idData.IBAN[0] : idData.IBAN;
        return typeof iban === 'string' ? iban : iban._;
      }

      // Try direct ID value
      if (typeof idData === 'string') {
        return idData;
      }

      if (idData._) {
        return idData._;
      }
    }

    return null;
  } catch (error) {
    logger.error('Error extracting account ID from CdtrAcct', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return null;
  }
}

/**
 * Validates XML payload structure asynchronously
 */
export async function validateXML(xmlPayload: string): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      parseString(xmlPayload, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    return true;
  } catch (error) {
    logger.error('XML validation failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return false;
  }
}

/**
 * Checks if XML payload contains financial message elements
 */
export function isFinancialMessage(xmlPayload: string): boolean {
  // Check if the XML contains financial message elements (PACS, CAMT, etc.)
  return xmlPayload.includes('pacs.') || 
         xmlPayload.includes('PACS') ||
         xmlPayload.includes('camt.') ||
         xmlPayload.includes('CAMT') ||
         xmlPayload.includes('FIToFICstmrCdtTrf') ||
         xmlPayload.includes('FIToFIPmtStsRpt') ||
         xmlPayload.includes('FIToFICstmrDrctDbt') ||
         xmlPayload.includes('BkToCstmrStmt') ||
         xmlPayload.includes('BkToCstmrDbtCdtNtfctn');
}

/**
 * Determines the message type from XML payload
 */
export function getMessageType(xmlPayload: string): string {
  // PACS messages
  if (xmlPayload.includes('pacs.008') || xmlPayload.includes('FIToFICstmrCdtTrf')) {
    return 'PACS008';
  } else if (xmlPayload.includes('pacs.007') || xmlPayload.includes('FIToFIPmtStsRpt')) {
    return 'PACS007';
  } else if (xmlPayload.includes('pacs.003') || xmlPayload.includes('FIToFICstmrDrctDbt')) {
    return 'PACS003';
  }
  // CAMT messages
  else if (xmlPayload.includes('camt.053') || xmlPayload.includes('BkToCstmrStmt')) {
    return 'CAMT053';
  } else if (xmlPayload.includes('camt.054') || xmlPayload.includes('BkToCstmrDbtCdtNtfctn')) {
    return 'CAMT054';
  } else {
    return 'UNKNOWN';
  }
} 