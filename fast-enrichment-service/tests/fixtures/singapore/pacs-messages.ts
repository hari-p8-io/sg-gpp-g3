export const SINGAPORE_PACS_MESSAGES = {
  PACS008: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG-PACS008-001</MsgId>
      <CreDtTm>2025-07-09T06:44:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>SG-TEST-001</EndToEndId>
        <TxId>SG-TX-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <ChrgBr>SLEV</ChrgBr>
      <Dbtr>
        <Nm>Singapore Test Debtor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>123456789012</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>OCBCSGSG</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>Singapore Test Creditor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>456789012345</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,

  PACS007: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.08">
  <FIToFIPmtRvsl>
    <GrpHdr>
      <MsgId>SG-PACS007-001</MsgId>
      <CreDtTm>2025-07-09T06:44:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <TxInf>
      <RvslId>SG-REV-001</RvslId>
      <OrgnlGrpInf>
        <OrgnlMsgId>SG-PACS008-001</OrgnlMsgId>
        <OrgnlMsgNmId>pacs.008.001.08</OrgnlMsgNmId>
      </OrgnlGrpInf>
      <OrgnlTxRef>
        <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
        <ChrgBr>SLEV</ChrgBr>
        <Dbtr>
          <Nm>Singapore Test Debtor</Nm>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <Othr>
              <Id>123456789012</Id>
            </Othr>
          </Id>
        </DbtrAcct>
        <DbtrAgt>
          <FinInstnId>
            <BICFI>DBSSSGSG</BICFI>
          </FinInstnId>
        </DbtrAgt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>OCBCSGSG</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>Singapore Test Creditor</Nm>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>456789012345</Id>
            </Othr>
          </Id>
        </CdtrAcct>
      </OrgnlTxRef>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>`,

  PACS003: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.003.001.08">
  <FIToFICstmrDrctDbt>
    <GrpHdr>
      <MsgId>SG-PACS003-001</MsgId>
      <CreDtTm>2025-07-09T06:44:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <DrctDbtTxInf>
      <PmtId>
        <EndToEndId>SG-DD-001</EndToEndId>
        <TxId>SG-DD-TX-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">500.00</IntrBkSttlmAmt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>Singapore Test Creditor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>456789012345</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>OCBCSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <Dbtr>
        <Nm>Singapore Test Debtor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>789012345678</Id>
          </Othr>
        </Id>
      </DbtrAcct>
    </DrctDbtTxInf>
  </FIToFICstmrDrctDbt>
</Document>`
};

export const SINGAPORE_MESSAGE_TYPES = ['PACS008', 'PACS007', 'PACS003'] as const;
export type SingaporeMessageType = typeof SINGAPORE_MESSAGE_TYPES[number]; 