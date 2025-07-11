import { test, expect } from '@playwright/test';
import { createGrpcClient } from '../../utils/grpc-client';

test.describe('Simple Fast Request Handler Tests', () => {
  let grpcClient: ReturnType<typeof createGrpcClient>;

  test.beforeEach(async () => {
    grpcClient = createGrpcClient('localhost:50051');
    
    // Wait for service to be ready
    await grpcClient.waitForServiceReady(30000);
    
    // Clear mock storage before each test
    await grpcClient.clearMockStorage();
  });

  test.skip('should clear database and process a single message', async () => {
    // Verify database is empty
    const initialMessages = await grpcClient.getAllMessages();
    expect(initialMessages.length).toBe(0);

    // Process a message
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG202501080001</MsgId>
      <CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId><InstrId>INST001</InstrId><EndToEndId>E2E001</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
      <Dbtr><Nm>Singapore Corp Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>018956</PstCd></PstlAdr></Dbtr>
      <DbtrAcct><Id><Othr><Id>123456789</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>ANZBSG3MXXX</BICFI></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><BICFI>OCBCSG3MXXX</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>Singapore Beneficiary Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>567890</PstCd></PstlAdr></Cdtr>
      <CdtrAcct><Id><Othr><Id>987654321</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

    const response = await grpcClient.processPacsMessage({
      message_type: 'PACS008',
      xml_payload: xmlPayload,
      metadata: { country: 'SG', currency: 'SGD' }
    });

    // Verify response
    expect(response.success).toBe(true);
    expect(response.message_id).toBeTruthy();
    expect(response.puid).toBeTruthy();
    expect(response.puid).toMatch(/^G3I[A-Z0-9]{13}$/);

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify exactly one message in database
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(1);

    const storedMessage = allMessages[0];
    expect(storedMessage.message_id).toBe(response.message_id);
    expect(storedMessage.puid).toBe(response.puid);
    expect(storedMessage.message_type).toBe('PACS008');
    expect(storedMessage.status).toBe('VALIDATED');
  });

  test.skip('should handle multiple messages sequentially', async () => {
    // Process first message
    const response1 = await grpcClient.processPacsMessage({
      message_type: 'PACS008',
      xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr><MsgId>SG202501080001</MsgId><CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm><NbOfTxs>1</NbOfTxs><SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf></GrpHdr>
    <CdtTrfTxInf>
      <PmtId><InstrId>INST001</InstrId><EndToEndId>E2E001</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
      <Dbtr><Nm>Singapore Corp Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>018956</PstCd></PstlAdr></Dbtr>
      <DbtrAcct><Id><Othr><Id>123456789</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>ANZBSG3MXXX</BICFI></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><BICFI>OCBCSG3MXXX</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>Singapore Beneficiary Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>567890</PstCd></PstlAdr></Cdtr>
      <CdtrAcct><Id><Othr><Id>987654321</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
      metadata: { country: 'SG', currency: 'SGD' }
    });

    // Process second message
    const response2 = await grpcClient.processPacsMessage({
      message_type: 'PACS007',
      xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.10">
  <FIToFIPmtRvsl>
    <GrpHdr><MsgId>SG202501080002</MsgId><CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm><NbOfTxs>1</NbOfTxs></GrpHdr>
    <TxInf>
      <RvslId>REV001</RvslId>
      <OrgnlGrpInf><OrgnlMsgId>SG202501080001</OrgnlMsgId><OrgnlMsgNmId>pacs.008.001.10</OrgnlMsgNmId></OrgnlGrpInf>
      <OrgnlInstrId>INST001</OrgnlInstrId>
      <OrgnlEndToEndId>E2E001</OrgnlEndToEndId>
      <RvslRsnInf><Rsn><Cd>AC03</Cd></Rsn><AddtlInf>Invalid account number</AddtlInf></RvslRsnInf>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>`,
      metadata: { country: 'SG', currency: 'SGD' }
    });

    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify both messages are stored
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(2);

    const messageTypes = allMessages.map(msg => msg.message_type);
    expect(messageTypes).toContain('PACS008');
    expect(messageTypes).toContain('PACS007');
  });

  test.skip('should query messages by ID and PUID', async () => {
    // Process a message
    const response = await grpcClient.processPacsMessage({
      message_type: 'PACS008',
      xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr><MsgId>SG202501080001</MsgId><CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm><NbOfTxs>1</NbOfTxs><SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf></GrpHdr>
    <CdtTrfTxInf>
      <PmtId><InstrId>INST001</InstrId><EndToEndId>E2E001</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
      <Dbtr><Nm>Singapore Corp Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>018956</PstCd></PstlAdr></Dbtr>
      <DbtrAcct><Id><Othr><Id>123456789</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>ANZBSG3MXXX</BICFI></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><BICFI>OCBCSG3MXXX</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>Singapore Beneficiary Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>567890</PstCd></PstlAdr></Cdtr>
      <CdtrAcct><Id><Othr><Id>987654321</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
      metadata: { country: 'SG', currency: 'SGD' }
    });

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Query by message ID
    const statusById = await grpcClient.getMessageStatus(response.message_id);
    expect(statusById.message_id).toBe(response.message_id);
    expect(statusById.puid).toBe(response.puid);
    expect(statusById.message_type).toBe('PACS008');

    // Query by PUID
    const statusByPuid = await grpcClient.getMessageStatus(undefined, response.puid);
    expect(statusByPuid.message_id).toBe(response.message_id);
    expect(statusByPuid.puid).toBe(response.puid);
    expect(statusByPuid.message_type).toBe('PACS008');
  });

  test('should have working health check', async () => {
    const healthResponse = await grpcClient.healthCheck();
    expect(healthResponse.status).toBeTruthy();
    expect(healthResponse.message).toBeTruthy();
  });
}); 