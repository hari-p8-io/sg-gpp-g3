import { test, expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { kafkaUtils } from '../../utils/kafka-test-utils';
import { spannerUtils } from '../../utils/spanner-test-utils';

/**
 * Deduplication Tests
 * 
 * These tests verify the orchestrator service's deduplication functionality:
 * 1. Identical messages are detected as duplicates
 * 2. Messages with the same ID but different content are detected as duplicates
 * 3. Messages with different IDs but identical content are processed separately
 */
test.describe('Deduplication', () => {
  // Setup before all tests
  test.beforeAll(async () => {
    // Initialize Kafka producer and consumers
    await kafkaUtils.initProducer();
    await kafkaUtils.initConsumer('json-accounting-messages');
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

  test('should detect identical messages as duplicates', async () => {
    // Arrange
    const messageId = uuidv4();
    const message = {
      messageId,
      messageType: 'pacs.008.001.08',
      sender: 'TESTBNKAXXX',
      receiver: 'RECVBNKBXXX',
      timestamp: new Date().toISOString(),
      payload: `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
        <FIToFICstmrCdtTrf>
          <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
          </GrpHdr>
        </FIToFICstmrCdtTrf>
      </Document>`
    };

    // Act - Send first message
    await kafkaUtils.sendMessage('enriched-messages', messageId, message);

    // Wait for processing to complete
    await kafkaUtils.waitForMessage('json-accounting-messages');
    await spannerUtils.waitForMessageStatus(messageId, 'PROCESSING');

    // Clear received messages
    kafkaUtils.clearReceivedMessages();

    // Act - Send identical message again
    await kafkaUtils.sendMessage('enriched-messages', messageId, message);

    // Wait for deduplication check
    await spannerUtils.waitForMessageDuplicate(messageId);

    // Assert - No new messages should be published
    await new Promise(resolve => setTimeout(resolve, 2000));
    const accountingMessages = kafkaUtils.getReceivedMessages('json-accounting-messages');
    expect(accountingMessages.length).toBe(0);
  });

  test('should detect messages with same ID but different content as duplicates', async () => {
    // Arrange
    const messageId = uuidv4();
    const firstMessage = {
      messageId,
      messageType: 'pacs.008.001.08',
      sender: 'TESTBNKAXXX',
      receiver: 'RECVBNKBXXX',
      timestamp: new Date().toISOString(),
      payload: `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
        <FIToFICstmrCdtTrf>
          <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
          </GrpHdr>
        </FIToFICstmrCdtTrf>
      </Document>`
    };

    // Act - Send first message
    await kafkaUtils.sendMessage('enriched-messages', messageId, firstMessage);

    // Wait for processing to complete
    await kafkaUtils.waitForMessage('json-accounting-messages');
    await spannerUtils.waitForMessageStatus(messageId, 'PROCESSING');

    // Clear received messages
    kafkaUtils.clearReceivedMessages();

    // Create a modified message with same ID but different content
    const modifiedMessage = {
      ...firstMessage,
      payload: `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
        <FIToFICstmrCdtTrf>
          <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
            <NbOfTxs>2</NbOfTxs>
          </GrpHdr>
        </FIToFICstmrCdtTrf>
      </Document>`
    };

    // Act - Send modified message
    await kafkaUtils.sendMessage('enriched-messages', messageId, modifiedMessage);

    // Wait for deduplication check
    await spannerUtils.waitForMessageDuplicate(messageId);

    // Assert - No new messages should be published
    await new Promise(resolve => setTimeout(resolve, 2000));
    const accountingMessages = kafkaUtils.getReceivedMessages('json-accounting-messages');
    expect(accountingMessages.length).toBe(0);
  });

  test('should process messages with different IDs but identical content separately', async () => {
    // Arrange
    const messageId1 = uuidv4();
    const messageId2 = uuidv4();
    const messageContent = `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
      <FIToFICstmrCdtTrf>
        <GrpHdr>
          <CreDtTm>${new Date().toISOString()}</CreDtTm>
        </GrpHdr>
      </FIToFICstmrCdtTrf>
    </Document>`;

    const message1 = {
      messageId: messageId1,
      messageType: 'pacs.008.001.08',
      sender: 'TESTBNKAXXX',
      receiver: 'RECVBNKBXXX',
      timestamp: new Date().toISOString(),
      payload: messageContent.replace('<CreDtTm>', `<MsgId>${messageId1}</MsgId><CreDtTm>`)
    };

    const message2 = {
      messageId: messageId2,
      messageType: 'pacs.008.001.08',
      sender: 'TESTBNKAXXX',
      receiver: 'RECVBNKBXXX',
      timestamp: new Date().toISOString(),
      payload: messageContent.replace('<CreDtTm>', `<MsgId>${messageId2}</MsgId><CreDtTm>`)
    };

    // Act - Send first message
    await kafkaUtils.sendMessage('enriched-messages', messageId1, message1);

    // Wait for processing to complete
    await kafkaUtils.waitForMessage('json-accounting-messages');
    await spannerUtils.waitForMessageStatus(messageId1, 'PROCESSING');

    // Clear received messages
    kafkaUtils.clearReceivedMessages();

    // Act - Send second message with different ID but similar content
    await kafkaUtils.sendMessage('enriched-messages', messageId2, message2);

    // Assert - Second message should be processed
    await kafkaUtils.waitForMessage('json-accounting-messages');
    await spannerUtils.waitForMessageStatus(messageId2, 'PROCESSING');

    const accountingMessages = kafkaUtils.getReceivedMessages('json-accounting-messages');
    expect(accountingMessages.length).toBe(1);
    expect(accountingMessages[0].messageId).toBe(messageId2);
  });
}); 