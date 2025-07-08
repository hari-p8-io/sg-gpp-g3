import { createGrpcClient } from './grpc-client';

export class TestHelper {
  private static instance: TestHelper;
  private grpcClient: ReturnType<typeof createGrpcClient>;

  private constructor() {
    this.grpcClient = createGrpcClient('localhost:50051');
  }

  static getInstance(): TestHelper {
    if (!TestHelper.instance) {
      TestHelper.instance = new TestHelper();
    }
    return TestHelper.instance;
  }

  async setupTest(): Promise<void> {
    // Wait for service to be ready
    await this.grpcClient.waitForServiceReady(30000);
    
    // Clear database and wait for background processes to complete
    await this.clearDatabaseCompletely();
  }

  async clearDatabaseCompletely(): Promise<void> {
    // Clear multiple times to handle race conditions
    for (let i = 0; i < 3; i++) {
      try {
        await this.grpcClient.clearMockStorage();
        
        // Wait a bit for any background processes
        await this.wait(200);
        
        // Verify it's actually cleared
        const messages = await this.grpcClient.getAllMessages();
        if (messages.length === 0) {
          return; // Successfully cleared
        }
        
        console.log(`Clear attempt ${i + 1}: Still ${messages.length} messages remaining`);
        await this.wait(500); // Wait longer before retry
      } catch (error) {
        console.warn(`Clear attempt ${i + 1} failed:`, error);
        await this.wait(500);
      }
    }
    
    // Final verification
    const finalMessages = await this.grpcClient.getAllMessages();
    if (finalMessages.length > 0) {
      console.warn(`⚠️ Database not fully cleared: ${finalMessages.length} messages remaining`);
    }
  }

  async processMessageAndWait(
    messageType: string,
    xmlPayload: string,
    metadata: Record<string, string> = {}
  ): Promise<{
    response: any;
    storedMessage: any;
  }> {
    // Process the message
    const response = await this.grpcClient.processPacsMessage({
      message_type: messageType,
      xml_payload: xmlPayload,
      metadata
    });

    // Wait for background enrichment to complete
    await this.waitForMessageToBeStored(response.message_id, response.puid);

    // Get the stored message
    const allMessages = await this.grpcClient.getAllMessages();
    const storedMessage = allMessages.find(msg => 
      msg.message_id === response.message_id || msg.puid === response.puid
    );

    return { response, storedMessage };
  }

  async waitForMessageToBeStored(messageId: string, puid: string): Promise<void> {
    const maxAttempts = 30; // 15 seconds total
    const attemptDelay = 500; // 500ms between attempts

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // First try to get the message status
        const status = await this.grpcClient.getMessageStatus(messageId);
        if (status && status.message_id === messageId) {
          // Message found and processed, wait a bit more for any background processing
          await this.wait(200);
          return;
        }
      } catch (error) {
        // Message not found yet, try getAllMessages as fallback
        try {
          const allMessages = await this.grpcClient.getAllMessages();
          const found = allMessages.find(msg => 
            msg.message_id === messageId || msg.puid === puid
          );
          if (found) {
            // Message found, wait a bit more for any background processing
            await this.wait(200);
            return;
          }
        } catch (getAllError) {
          // Both methods failed, continue waiting
        }
      }

      if (attempt % 5 === 0) {
        console.log(`Waiting for message ${messageId} (${puid}), attempt ${attempt}/${maxAttempts}`);
      }
      await this.wait(attemptDelay);
    }

    // Final check using getAllMessages
    try {
      const allMessages = await this.grpcClient.getAllMessages();
      const found = allMessages.find(msg => 
        msg.message_id === messageId || msg.puid === puid
      );

      if (!found) {
        throw new Error(`Message ${messageId} (${puid}) not found in database after ${maxAttempts * attemptDelay}ms`);
      }
    } catch (error) {
      console.error('Final check failed:', error);
      throw new Error(`Message ${messageId} (${puid}) not found in database after ${maxAttempts * attemptDelay}ms`);
    }
  }

  async waitForMessagesToBeProcessed(expectedCount: number): Promise<void> {
    const maxAttempts = 20; // 10 seconds total
    const attemptDelay = 500; // 500ms between attempts

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const allMessages = await this.grpcClient.getAllMessages();
      if (allMessages.length === expectedCount) {
        return;
      }

      console.log(`Attempt ${attempt}: Found ${allMessages.length}/${expectedCount} messages`);
      await this.wait(attemptDelay);
    }

    const finalMessages = await this.grpcClient.getAllMessages();
    throw new Error(`Expected ${expectedCount} messages but found ${finalMessages.length} after waiting`);
  }

  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getGrpcClient() {
    return this.grpcClient;
  }

  // Common test XML payloads
  static getTestXML(messageType: string): string {
    const xmlTemplates = {
      PACS008: `<?xml version="1.0" encoding="UTF-8"?>
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
</Document>`,

      PACS007: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.10">
  <FIToFIPmtRvsl>
    <GrpHdr>
      <MsgId>SG202501080002</MsgId>
      <CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <TxInf>
      <RvslId>REV001</RvslId>
      <OrgnlGrpInf><OrgnlMsgId>SG202501080001</OrgnlMsgId><OrgnlMsgNmId>pacs.008.001.10</OrgnlMsgNmId></OrgnlGrpInf>
      <OrgnlInstrId>INST001</OrgnlInstrId>
      <OrgnlEndToEndId>E2E001</OrgnlEndToEndId>
      <RvslRsnInf><Rsn><Cd>AC03</Cd></Rsn><AddtlInf>Invalid account number</AddtlInf></RvslRsnInf>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>`,

      PACS003: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.003.001.09">
  <FIToFICstmrDrctDbt>
    <GrpHdr>
      <MsgId>SG202501080003</MsgId>
      <CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
    <DrctDbtTxInf>
      <PmtId><InstrId>DD001</InstrId><EndToEndId>E2E_DD001</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="SGD">2500.00</IntrBkSttlmAmt>
      <Dbtr><Nm>Singapore Customer</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>123456</PstCd></PstlAdr></Dbtr>
      <DbtrAcct><Id><Othr><Id>111222333</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>DBSSSGSGXXX</BICFI></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><BICFI>UOVBSG3MXXX</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>Singapore Merchant</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>654321</PstCd></PstlAdr></Cdtr>
      <CdtrAcct><Id><Othr><Id>444555666</Id></Othr></Id></CdtrAcct>
    </DrctDbtTxInf>
  </FIToFICstmrDrctDbt>
</Document>`
    };

    return xmlTemplates[messageType as keyof typeof xmlTemplates] || xmlTemplates.PACS008;
  }
} 