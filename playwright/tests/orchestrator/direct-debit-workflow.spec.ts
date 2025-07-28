import { test, expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { kafkaUtils } from '../../utils/kafka-test-utils';
import { spannerUtils } from '../../utils/spanner-test-utils';

/**
 * Direct Debit Workflow Tests
 * 
 * These tests verify the orchestrator service's handling of direct debit messages:
 * 1. Message is received from Kafka
 * 2. Message is transformed to JSON
 * 3. Deduplication check is performed
 * 4. Message is published to downstream services
 * 5. State is updated in Spanner
 */
test.describe('Direct Debit Workflow', () => {
  // Setup before all tests
  test.beforeAll(async () => {
    // Initialize Kafka producer and consumers
    await kafkaUtils.initProducer();
    await kafkaUtils.initConsumer('json-accounting-messages');
    await kafkaUtils.initConsumer('json-vammediation-messages');
    await kafkaUtils.initConsumer('json-limitcheck-messages');
  });

  // Cleanup after all tests
  test.afterAll(async () => {
    // Disconnect Kafka producer and consumers
    await kafkaUtils.disconnect();
  });

  // Reset received messages before each test
  test.beforeEach(async () => {
    kafkaUtils.clearReceivedMessages();
  });

  test('should process a direct debit message and publish to downstream services', async () => {
    // Arrange
    const messageId = uuidv4();
    const directDebitMessage = {
      messageId,
      messageType: 'pacs.003.001.08',
      sender: 'TESTBNKAXXX',
      receiver: 'RECVBNKBXXX',
      timestamp: new Date().toISOString(),
      payload: `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.003.001.08">
        <FIToFICstmrDrctDbt>
          <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
            <NbOfTxs>1</NbOfTxs>
            <SttlmInf>
              <SttlmMtd>CLRG</SttlmMtd>
            </SttlmInf>
          </GrpHdr>
          <DrctDbtTxInf>
            <PmtId>
              <InstrId>INSTRID-${messageId.substring(0, 8)}</InstrId>
              <EndToEndId>E2E-${messageId.substring(0, 8)}</EndToEndId>
              <TxId>TX-${messageId.substring(0, 8)}</TxId>
            </PmtId>
            <IntrBkSttlmAmt Ccy="SGD">100.00</IntrBkSttlmAmt>
            <ChrgBr>SLEV</ChrgBr>
            <Dbtr>
              <Nm>John Doe</Nm>
            </Dbtr>
            <DbtrAcct>
              <Id>
                <Othr>
                  <Id>1234567890</Id>
                </Othr>
              </Id>
            </DbtrAcct>
            <Cdtr>
              <Nm>Jane Smith</Nm>
            </Cdtr>
            <CdtrAcct>
              <Id>
                <Othr>
                  <Id>0987654321</Id>
                </Othr>
              </Id>
            </CdtrAcct>
            <RmtInf>
              <Ustrd>Test direct debit</Ustrd>
            </RmtInf>
          </DrctDbtTxInf>
        </FIToFICstmrDrctDbt>
      </Document>`
    };

    // Act
    await kafkaUtils.sendMessage('enriched-messages', messageId, directDebitMessage);

    // Assert - Wait for messages to be published to downstream services
    await kafkaUtils.waitForMessage('json-accounting-messages');
    await kafkaUtils.waitForMessage('json-vammediation-messages');
    
    // Verify the state is updated in Spanner
    await spannerUtils.waitForMessageStatus(messageId, 'PROCESSING');
    
    // Verify the messages sent to downstream services
    const accountingMessages = kafkaUtils.getReceivedMessages('json-accounting-messages');
    const vamMediationMessages = kafkaUtils.getReceivedMessages('json-vammediation-messages');
    
    expect(accountingMessages.length).toBe(1);
    expect(vamMediationMessages.length).toBe(1);
    
    // Verify the content of the accounting message
    const accountingMessage = accountingMessages[0];
    expect(accountingMessage.messageId).toBe(messageId);
    expect(accountingMessage.paymentData).toBeDefined();
    expect(accountingMessage.paymentData.amount).toBe('100.00');
    expect(accountingMessage.paymentData.currency).toBe('SGD');
    expect(accountingMessage.paymentData.debtorAccount).toBe('1234567890');
    expect(accountingMessage.paymentData.creditorAccount).toBe('0987654321');
  });
}); 