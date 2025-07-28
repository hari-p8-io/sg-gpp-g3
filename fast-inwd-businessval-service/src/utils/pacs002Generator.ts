import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export interface PACS002Request {
  originalMessageId: string;
  puid: string;
  messageType: string;
  status: 'COMPLETED' | 'FAILED' | 'REJECTED';
  amount?: string;
  currency?: string;
  debtorAccount?: string;
  creditorAccount?: string;
  errorCode?: string;
  errorMessage?: string;
  enrichmentData?: any;
  processingTimeMs?: number;
}

export interface PACS002Response {
  messageId: string;
  xmlPayload: string;
  status: string;
  createdAt: string;
}

export class PACS002Generator {
  private readonly namespace = 'urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15';

  /**
   * Generate PACS.002 Payment Status Report XML for successful transactions
   */
  generatePacs002Success(request: PACS002Request): PACS002Response {
    try {
      const messageId = this.generateMessageId();
      const creationDateTime = this.formatDateTime(new Date());
      
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.namespace}">
    <FIToFIPmtStsRpt>
        <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${creationDateTime}</CreDtTm>
            <InstgAgt>
                <FinInstnId>
                    <BICFI>PWSGSGSG</BICFI>
                    <Nm>PaymentWorks Singapore</Nm>
                </FinInstnId>
            </InstgAgt>
        </GrpHdr>
        <TxInfAndSts>
            <OrgnlInstrId>${request.originalMessageId}</OrgnlInstrId>
            <OrgnlEndToEndId>${request.puid}</OrgnlEndToEndId>
            <TxSts>${this.mapStatusCode(request.status)}</TxSts>
            <StsRsnInf>
                <Rsn>
                    <Cd>${this.getSuccessReasonCode()}</Cd>
                </Rsn>
                <AddtlInf>Transaction processed successfully by ${request.messageType} flow through G3 platform</AddtlInf>
            </StsRsnInf>
            <OrgnlTxRef>
                ${request.amount && request.currency ? `<IntrBkSttlmAmt Ccy="${request.currency}">${request.amount}</IntrBkSttlmAmt>` : ''}
                <IntrBkSttlmDt>${this.formatDate(new Date())}</IntrBkSttlmDt>
                <SttlmInf>
                    <SttlmMtd>CLRG</SttlmMtd>
                </SttlmInf>
                ${this.generateAccountInfo(request)}
                <RmtInf>
                    <Ustrd>Payment processed through G3 platform - ${request.enrichmentData?.physicalAcctInfo?.acctSys || 'FAST'} system</Ustrd>
                </RmtInf>
            </OrgnlTxRef>
        </TxInfAndSts>
    </FIToFIPmtStsRpt>
</Document>`;

      return {
        messageId,
        xmlPayload: xml,
        status: 'ACSC',
        createdAt: creationDateTime
      };

    } catch (error) {
      logger.error('Failed to generate PACS.002 success response', {
        originalMessageId: request.originalMessageId,
        puid: request.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate PACS.002 Payment Status Report XML for failed/rejected transactions
   */
  generatePacs002Failure(request: PACS002Request): PACS002Response {
    try {
      const messageId = this.generateMessageId();
      const creationDateTime = this.formatDateTime(new Date());
      
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.namespace}">
    <FIToFIPmtStsRpt>
        <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${creationDateTime}</CreDtTm>
            <InstgAgt>
                <FinInstnId>
                    <BICFI>PWSGSGSG</BICFI>
                    <Nm>PaymentWorks Singapore</Nm>
                </FinInstnId>
            </InstgAgt>
        </GrpHdr>
        <TxInfAndSts>
            <OrgnlInstrId>${request.originalMessageId}</OrgnlInstrId>
            <OrgnlEndToEndId>${request.puid}</OrgnlEndToEndId>
            <TxSts>${this.mapStatusCode(request.status)}</TxSts>
            <StsRsnInf>
                <Rsn>
                    <Cd>${this.getErrorReasonCode(request.errorCode)}</Cd>
                </Rsn>
                <AddtlInf>${request.errorMessage || 'Transaction processing failed'}</AddtlInf>
            </StsRsnInf>
            <OrgnlTxRef>
                ${request.amount && request.currency ? `<IntrBkSttlmAmt Ccy="${request.currency}">${request.amount}</IntrBkSttlmAmt>` : ''}
                <IntrBkSttlmDt>${this.formatDate(new Date())}</IntrBkSttlmDt>
                <SttlmInf>
                    <SttlmMtd>CLRG</SttlmMtd>
                </SttlmInf>
                <RmtInf>
                    <Ustrd>Payment rejected by G3 platform - ${request.errorCode || 'UNKNOWN_ERROR'}</Ustrd>
                </RmtInf>
            </OrgnlTxRef>
        </TxInfAndSts>
    </FIToFIPmtStsRpt>
</Document>`;

      return {
        messageId,
        xmlPayload: xml,
        status: 'RJCT',
        createdAt: creationDateTime
      };

    } catch (error) {
      logger.error('Failed to generate PACS.002 failure response', {
        originalMessageId: request.originalMessageId,
        puid: request.puid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate account information section for PACS.002 
   */
  private generateAccountInfo(request: PACS002Request): string {
    if (!request.debtorAccount && !request.creditorAccount) {
      return '';
    }

    let accountInfo = '';

    if (request.debtorAccount) {
      accountInfo += `
                <DbtrAgt>
                    <FinInstnId>
                        <BICFI>${this.getBICFI(request.enrichmentData?.physicalAcctInfo?.acctSys)}</BICFI>
                        <Nm>${this.getBankName(request.enrichmentData?.physicalAcctInfo?.acctSys)}</Nm>
                    </FinInstnId>
                </DbtrAgt>
                <Dbtr>
                    <Nm>Corporate Customer</Nm>
                </Dbtr>
                <DbtrAcct>
                    <Id>
                        <Othr>
                            <Id>${request.debtorAccount}</Id>
                            <SchmeNm>
                                <Prtry>ACCOUNT</Prtry>
                            </SchmeNm>
                        </Othr>
                    </Id>
                    <Ccy>${request.currency || 'SGD'}</Ccy>
                </DbtrAcct>`;
    }

    if (request.creditorAccount) {
      accountInfo += `
                <CdtrAgt>
                    <FinInstnId>
                        <BICFI>${this.getBICFI(request.enrichmentData?.physicalAcctInfo?.acctSys)}</BICFI>
                        <Nm>${this.getBankName(request.enrichmentData?.physicalAcctInfo?.acctSys)}</Nm>
                    </FinInstnId>
                </CdtrAgt>
                <Cdtr>
                    <Nm>Beneficiary Customer</Nm>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <Othr>
                            <Id>${request.creditorAccount}</Id>
                            <SchmeNm>
                                <Prtry>ACCOUNT</Prtry>
                            </SchmeNm>
                        </Othr>
                    </Id>
                    <Ccy>${request.currency || 'SGD'}</Ccy>
                </CdtrAcct>`;
    }

    return accountInfo;
  }

  /**
   * Map internal status to ISO 20022 transaction status codes
   */
  private mapStatusCode(status: string): string {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return 'ACSC'; // AcceptedSettlementCompleted
      case 'FAILED':
        return 'RJCT'; // Rejected
      case 'REJECTED':
        return 'RJCT'; // Rejected
      default:
        return 'RJCT'; // Default to rejected
    }
  }

  /**
   * Get success reason code
   */
  private getSuccessReasonCode(): string {
    return 'G000'; // Generic success code
  }

  /**
   * Get error reason code based on error type
   */
  private getErrorReasonCode(errorCode?: string): string {
    switch (errorCode?.toUpperCase()) {
      case 'INVALID_ACCOUNT':
        return 'AC01'; // IncorrectAccountNumber
      case 'INSUFFICIENT_FUNDS':
        return 'AM04'; // InsufficientFunds
      case 'VALIDATION_ERROR':
        return 'FF01'; // InvalidFileFormat
      case 'TIMEOUT':
        return 'TM01'; // CutOffTime
      case 'TECHNICAL_ERROR':
      default:
        return 'AG01'; // TransactionForbidden
    }
  }

  /**
   * Get BICFI based on account system
   */
  private getBICFI(accountSystem?: string): string {
    switch (accountSystem?.toUpperCase()) {
      case 'VAM':
        return 'VAMSGSG';
      case 'MDZ':
        return 'MDZSGSG';
      case 'FAST':
        return 'FASTSGSG';
      case 'MEPS':
        return 'MEPSSGSG';
      default:
        return 'DBSSSGSG'; // Default to DBS
    }
  }

  /**
   * Get bank name based on account system
   */
  private getBankName(accountSystem?: string): string {
    switch (accountSystem?.toUpperCase()) {
      case 'VAM':
        return 'VAM Singapore';
      case 'MDZ':
        return 'MDZ Singapore';
      case 'FAST':
        return 'FAST Singapore';
      case 'MEPS':
        return 'MEPS Singapore';
      default:
        return 'DBS Bank Ltd'; // Default to DBS
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 14);
    const random = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
    return `PACS002${timestamp}${random}`;
  }

  /**
   * Format date-time for ISO 20022
   */
  private formatDateTime(date: Date): string {
    return date.toISOString();
  }

  /**
   * Format date for ISO 20022
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
} 