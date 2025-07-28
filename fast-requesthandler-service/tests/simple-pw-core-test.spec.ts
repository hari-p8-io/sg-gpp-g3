import { test, expect } from '@playwright/test';

// Import pw-core utilities directly without the re-exported playwright test
import { 
  ServiceTestHelper, 
  GenericAssertions,
  MessageBuilder 
} from '@gpp/pw-core';

test.describe('Simple PW-Core Integration Test', () => {
  let testHelper: ServiceTestHelper;

  test.beforeAll(async () => {
    testHelper = new ServiceTestHelper('fast-requesthandler-service');
    await testHelper.initialize();
  });

  test.afterAll(async () => {
    await testHelper.shutdown();
  });

  test('should perform basic health check using pw-core', async () => {
    const response = await testHelper.healthCheck();
    expect(response).toBeDefined();
    console.log('Health check response:', response);
    // Different services may have different health check response formats
    // Just verify we got a response and service is accessible
  });

  test('should process PACS008 message using pw-core MessageBuilder', async () => {
    // Create a test message using the generic MessageBuilder
    const builder = new MessageBuilder();
    
    const message = builder
      .withMessageType('PACS008')
      .withCurrency('SGD')
      .withCountry('SG')
      .withAmount(1000.00)
      .withAccount('1234567890')
      .withXmlPayload(`<?xml version="1.0" encoding="UTF-8"?>
        <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
          <FIToFICstmrCdtTrf>
            <GrpHdr>
              <MsgId>TEST-MSG-001</MsgId>
              <CreDtTm>2024-01-01T12:00:00</CreDtTm>
              <NbOfTxs>1</NbOfTxs>
              <SttlmInf>
                <SttlmMtd>CLRG</SttlmMtd>
              </SttlmInf>
            </GrpHdr>
            <CdtTrfTxInf>
              <PmtId>
                <InstrId>INST-001</InstrId>
                <EndToEndId>E2E-001</EndToEndId>
              </PmtId>
              <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
              <ChrgBr>SLEV</ChrgBr>
              <Dbtr>
                <Nm>Test Debtor</Nm>
              </Dbtr>
              <DbtrAcct>
                <Id>
                  <Othr>
                    <Id>1234567890</Id>
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
                <Nm>Test Creditor</Nm>
              </Cdtr>
              <CdtrAcct>
                <Id>
                  <Othr>
                    <Id>0987654321</Id>
                  </Othr>
                </Id>
              </CdtrAcct>
            </CdtTrfTxInf>
          </FIToFICstmrCdtTrf>
        </Document>`)
      .build();
    
    const response = await testHelper.processMessage(message);
    
    expect(response.success).toBe(true);
    expect(response.messageId).toBeDefined();
    
    // Test basic XML structure without complex assertions for now
    expect(message.xmlPayload).toContain('<?xml version="1.0"');
    expect(message.xmlPayload).toContain('<Document xmlns="');
    expect(message.xmlPayload).toContain('pacs.008');
    expect(message.xmlPayload).toContain('SGD');
    expect(message.messageType).toBe('PACS008');
    expect(message.metadata?.currency).toBe('SGD');
    expect(message.metadata?.country).toBe('SG');
    
    console.log('Message processed successfully:', response);
  });
}); 