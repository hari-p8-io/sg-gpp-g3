const { v4: uuidv4 } = require('uuid');

/**
 * PACS.002 Payment Status Report Generator
 * Based on ISO 20022 pacs.002.001.15 standard
 */
class PACS002Generator {
    constructor() {
        this.namespace = 'urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15';
        this.messageId = null;
        this.originalMessageId = null;
        this.transactionStatus = null;
        this.statusReason = null;
        this.processingTime = null;
    }

    /**
     * Generate PACS.002 Payment Status Report XML
     * @param {Object} completionData - Transaction completion data from accounting service
     * @returns {string} Generated PACS.002 XML
     */
    generatePacs002(completionData) {
        const messageId = this.generateMessageId();
        const creationDateTime = this.formatDateTime(new Date());
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.namespace}">
    <FIToFIPmtStsRpt>
        <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${creationDateTime}</CreDtTm>
        </GrpHdr>
        <TxInfAndSts>
            <OrgnlInstrId>${completionData.originalMessageData.originalMessageId}</OrgnlInstrId>
            <OrgnlEndToEndId>${completionData.puid}</OrgnlEndToEndId>
            <TxSts>${this.mapStatusCode(completionData.status)}</TxSts>
            <StsRsnInf>
                <Rsn>
                    <Cd>${this.getStatusReasonCode(completionData.status)}</Cd>
                </Rsn>
                <AddtlInf>Transaction processed successfully by ${completionData.messageType} flow</AddtlInf>
            </StsRsnInf>
            <OrgnlTxRef>
                <IntrBkSttlmAmt Ccy="${completionData.currency}">${completionData.amount}</IntrBkSttlmAmt>
                <IntrBkSttlmDt>${this.formatDate(new Date())}</IntrBkSttlmDt>
                <SttlmInf>
                    <SttlmMtd>CLRG</SttlmMtd>
                </SttlmInf>
                <DbtrAgt>
                    <FinInstnId>
                        <BICFI>DBSSSGSG</BICFI>
                        <Nm>DBS Bank Ltd</Nm>
                    </FinInstnId>
                </DbtrAgt>
                <CdtrAgt>
                    <FinInstnId>
                        <BICFI>OCBCSGSG</BICFI>
                        <Nm>Oversea-Chinese Banking Corporation</Nm>
                    </FinInstnId>
                </CdtrAgt>
                <Dbtr>
                    <Nm>Corporate Customer</Nm>
                    <Id>
                        <OrgId>
                            <Othr>
                                <Id>${completionData.debtorAccount}</Id>
                                <SchmeNm>
                                    <Prtry>ACCOUNT</Prtry>
                                </SchmeNm>
                            </Othr>
                        </OrgId>
                    </Id>
                </Dbtr>
                <DbtrAcct>
                    <Id>
                        <Othr>
                            <Id>${completionData.debtorAccount}</Id>
                            <SchmeNm>
                                <Prtry>ACCOUNT</Prtry>
                            </SchmeNm>
                        </Othr>
                    </Id>
                    <Ccy>${completionData.currency}</Ccy>
                </DbtrAcct>
                <Cdtr>
                    <Nm>Beneficiary Customer</Nm>
                    <Id>
                        <OrgId>
                            <Othr>
                                <Id>${completionData.creditorAccount}</Id>
                                <SchmeNm>
                                    <Prtry>ACCOUNT</Prtry>
                                </SchmeNm>
                            </Othr>
                        </OrgId>
                    </Id>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <Othr>
                            <Id>${completionData.creditorAccount}</Id>
                            <SchmeNm>
                                <Prtry>ACCOUNT</Prtry>
                            </SchmeNm>
                        </Othr>
                    </Id>
                    <Ccy>${completionData.currency}</Ccy>
                </CdtrAcct>
                <RmtInf>
                    <Ustrd>Payment processed through G3 platform - ${completionData.enrichmentData?.physicalAcctInfo?.acctSys || 'MDZ'} system</Ustrd>
                </RmtInf>
            </OrgnlTxRef>
        </TxInfAndSts>
    </FIToFIPmtStsRpt>
</Document>`;
        
        return xml;
    }

    /**
     * Generate PACS.002 for failed transactions
     * @param {Object} failureData - Transaction failure data
     * @returns {string} Generated PACS.002 XML with error status
     */
    generatePacs002Failure(failureData) {
        const messageId = this.generateMessageId();
        const creationDateTime = this.formatDateTime(new Date());
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.namespace}">
    <FIToFIPmtStsRpt>
        <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${creationDateTime}</CreDtTm>
        </GrpHdr>
        <TxInfAndSts>
            <OrgnlInstrId>${failureData.originalMessageId}</OrgnlInstrId>
            <OrgnlEndToEndId>${failureData.puid}</OrgnlEndToEndId>
            <TxSts>RJCT</TxSts>
            <StsRsnInf>
                <Rsn>
                    <Cd>${this.getErrorReasonCode(failureData.errorCode)}</Cd>
                </Rsn>
                <AddtlInf>${failureData.errorMessage || 'Transaction rejected'}</AddtlInf>
            </StsRsnInf>
            <OrgnlTxRef>
                <IntrBkSttlmAmt Ccy="${failureData.currency}">${failureData.amount}</IntrBkSttlmAmt>
                <IntrBkSttlmDt>${this.formatDate(new Date())}</IntrBkSttlmDt>
                <SttlmInf>
                    <SttlmMtd>CLRG</SttlmMtd>
                </SttlmInf>
                <RmtInf>
                    <Ustrd>Payment rejected by G3 platform</Ustrd>
                </RmtInf>
            </OrgnlTxRef>
        </TxInfAndSts>
    </FIToFIPmtStsRpt>
</Document>`;
        
        return xml;
    }

    /**
     * Generate unique message ID
     * @returns {string} Message ID
     */
    generateMessageId() {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `MSG${timestamp}${random}`;
    }

    /**
     * Format date for XML (ISO date)
     * @param {Date} date - Date to format
     * @returns {string} Formatted date
     */
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Format datetime for XML (ISO datetime)
     * @param {Date} date - Date to format
     * @returns {string} Formatted datetime
     */
    formatDateTime(date) {
        return date.toISOString();
    }

    /**
     * Map internal status to PACS.002 status codes
     * @param {string} internalStatus - Internal status code
     * @returns {string} PACS.002 status code
     */
    mapStatusCode(internalStatus) {
        const statusMap = {
            'COMPLETED': 'ACSC',    // AcceptedSettlementCompleted
            'FAILED': 'RJCT',       // Rejected
            'PENDING': 'ACSP',      // AcceptedSettlementInProcess
            'CANCELLED': 'CANC'     // Cancelled
        };
        
        return statusMap[internalStatus] || 'PDNG'; // Pending as default
    }

    /**
     * Get status reason code for successful transactions
     * @param {string} status - Transaction status
     * @returns {string} Reason code
     */
    getStatusReasonCode(status) {
        const reasonMap = {
            'COMPLETED': 'G000',    // Success
            'FAILED': 'G004',       // Rejected
            'PENDING': 'G003',      // Pending
            'CANCELLED': 'G002'     // Cancelled
        };
        
        return reasonMap[status] || 'G001'; // Generic code
    }

    /**
     * Get error reason code for failed transactions
     * @param {string} errorCode - Error code
     * @returns {string} PACS.002 error reason code
     */
    getErrorReasonCode(errorCode) {
        const errorMap = {
            'INSUFFICIENT_FUNDS': 'AM04',       // Insufficient funds
            'INVALID_ACCOUNT': 'AC01',          // Invalid account
            'INVALID_AMOUNT': 'AM01',           // Invalid amount
            'ACCOUNT_BLOCKED': 'AC06',          // Account blocked
            'LIMIT_EXCEEDED': 'AM05',           // Limit exceeded
            'TECHNICAL_ERROR': 'ED05',          // Technical error
            'VALIDATION_ERROR': 'NARR',         // Narrative reason
            'TIMEOUT': 'AB06',                  // Time out
            'DUPLICATE': 'DT01'                 // Duplicate
        };
        
        return errorMap[errorCode] || 'NARR'; // Narrative as default
    }

    /**
     * Validate generated XML against basic structure
     * @param {string} xml - XML to validate
     * @returns {boolean} True if valid structure
     */
    validateXmlStructure(xml) {
        try {
            // Basic validation - check for required elements
            const requiredElements = [
                '<Document',
                '<FIToFIPmtStsRpt>',
                '<GrpHdr>',
                '<MsgId>',
                '<CreDtTm>',
                '<TxInfAndSts>',
                '<OrgnlInstrId>',
                '<OrgnlEndToEndId>',
                '<TxSts>'
            ];
            
            return requiredElements.every(element => xml.includes(element));
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate PACS.002 with custom transaction details
     * @param {Object} params - Custom parameters
     * @returns {string} Generated PACS.002 XML
     */
    generateCustomPacs002(params) {
        const {
            originalMessageId,
            puid,
            status,
            statusReason,
            amount,
            currency,
            debtorAccount,
            creditorAccount,
            additionalInfo
        } = params;

        const messageId = this.generateMessageId();
        const creationDateTime = this.formatDateTime(new Date());
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.namespace}">
    <FIToFIPmtStsRpt>
        <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${creationDateTime}</CreDtTm>
        </GrpHdr>
        <TxInfAndSts>
            <OrgnlInstrId>${originalMessageId}</OrgnlInstrId>
            <OrgnlEndToEndId>${puid}</OrgnlEndToEndId>
            <TxSts>${this.mapStatusCode(status)}</TxSts>
            <StsRsnInf>
                <Rsn>
                    <Cd>${this.getStatusReasonCode(status)}</Cd>
                </Rsn>
                <AddtlInf>${additionalInfo || 'Transaction processed'}</AddtlInf>
            </StsRsnInf>
            <OrgnlTxRef>
                <IntrBkSttlmAmt Ccy="${currency}">${amount}</IntrBkSttlmAmt>
                <IntrBkSttlmDt>${this.formatDate(new Date())}</IntrBkSttlmDt>
                <SttlmInf>
                    <SttlmMtd>CLRG</SttlmMtd>
                </SttlmInf>
                <DbtrAcct>
                    <Id>
                        <Othr>
                            <Id>${debtorAccount}</Id>
                            <SchmeNm>
                                <Prtry>ACCOUNT</Prtry>
                            </SchmeNm>
                        </Othr>
                    </Id>
                    <Ccy>${currency}</Ccy>
                </DbtrAcct>
                <CdtrAcct>
                    <Id>
                        <Othr>
                            <Id>${creditorAccount}</Id>
                            <SchmeNm>
                                <Prtry>ACCOUNT</Prtry>
                            </SchmeNm>
                        </Othr>
                    </Id>
                    <Ccy>${currency}</Ccy>
                </CdtrAcct>
            </OrgnlTxRef>
        </TxInfAndSts>
    </FIToFIPmtStsRpt>
</Document>`;
        
        return xml;
    }
}

module.exports = PACS002Generator; 