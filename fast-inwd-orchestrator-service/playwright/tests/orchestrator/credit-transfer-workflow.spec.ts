import { test, expect } from '@playwright/test';
import { KafkaTestUtils } from '../../utils/kafka-test-utils';
import { SpannerTestUtils } from '../../utils/spanner-test-utils';

test.describe('Credit Transfer Inward (CTI) Workflow', () => {
  let kafkaUtils: KafkaTestUtils;
  let spannerUtils: SpannerTestUtils;

  test.beforeEach(async () => {
    kafkaUtils = new KafkaTestUtils();
    spannerUtils = new SpannerTestUtils();
    
    // Connect to Kafka and start consumers
    await kafkaUtils.verifyConnectivity();
    await kafkaUtils.startConsumer('json-accounting-messages');
    await kafkaUtils.startConsumer('json-vammediation-messages');
    await kafkaUtils.startConsumer('json-limitcheck-messages');
  });

  test.afterEach(async () => {
    await kafkaUtils.cleanup();
    await spannerUtils.cleanup();
  });

  test('should process standard CTI message successfully', async () => {
    // Given: A standard credit transfer message
    const paymentMessage = kafkaUtils.createTestPaymentMessage({
      messageType: 'PACS008',
    });

    // When: Message is published to enriched-messages topic
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Then: Should create processing state in Spanner
    const processingState = await spannerUtils.waitForProcessingState(
      paymentMessage.messageId, 
      'RECEIVED', 
      15000
    );
    expect(processingState).toBeTruthy();
    expect(processingState.workflowType).toBe('CTI');
    expect(processingState.messageType).toBe('PACS008');

    // And: Should publish JSON message to accounting service
    const accountingMessage = await kafkaUtils.waitForMessage(
      'json-accounting-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(accountingMessage).toBeTruthy();
    expect(accountingMessage.workflow).toBe('credit-transfer-inward');
    expect(accountingMessage.messageType).toBe('PACS008');

    // And: Should not publish to VAM mediation (MDZ account system)
    const vamMessages = kafkaUtils.getConsumedMessages('json-vammediation-messages');
    const vamMessage = vamMessages.find(msg => msg.messageId === paymentMessage.messageId);
    expect(vamMessage).toBeFalsy();

    // And: Should not publish to limit check (STANDARD auth method)
    const limitCheckMessages = kafkaUtils.getConsumedMessages('json-limitcheck-messages');
    const limitCheckMessage = limitCheckMessages.find(msg => msg.messageId === paymentMessage.messageId);
    expect(limitCheckMessage).toBeFalsy();
  });

  test('should process CTI message with VAM mediation', async () => {
    // Given: A credit transfer message requiring VAM mediation
    const paymentMessage = kafkaUtils.createTestVamMediationMessage({
      messageType: 'PACS008',
    });

    // When: Message is published to enriched-messages topic
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Then: Should publish to both accounting and VAM mediation
    const accountingMessage = await kafkaUtils.waitForMessage(
      'json-accounting-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(accountingMessage).toBeTruthy();

    const vamMessage = await kafkaUtils.waitForMessage(
      'json-vammediation-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(vamMessage).toBeTruthy();
    expect(vamMessage.enrichmentData.accountSystem).toBe('VAM');

    // And: Should track both services in processing state
    const processingState = await spannerUtils.getProcessingState(paymentMessage.messageId);
    expect(processingState.accountingStatus).toBe('PROCESSING');
    expect(processingState.vamMediationStatus).toBe('PROCESSING');
    expect(processingState.limitCheckStatus).toBe('NOT_REQUIRED');
  });

  test('should process CTI message with limit check', async () => {
    // Given: A credit transfer message requiring limit check
    const paymentMessage = kafkaUtils.createTestLimitCheckMessage({
      messageType: 'PACS008',
    });

    // When: Message is published to enriched-messages topic
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Then: Should publish to both accounting and limit check
    const accountingMessage = await kafkaUtils.waitForMessage(
      'json-accounting-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(accountingMessage).toBeTruthy();

    const limitCheckMessage = await kafkaUtils.waitForMessage(
      'json-limitcheck-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(limitCheckMessage).toBeTruthy();
    expect(limitCheckMessage.enrichmentData.authMethod).toBe('GROUPLIMIT');

    // And: Should track both services in processing state
    const processingState = await spannerUtils.getProcessingState(paymentMessage.messageId);
    expect(processingState.accountingStatus).toBe('PROCESSING');
    expect(processingState.vamMediationStatus).toBe('NOT_REQUIRED');
    expect(processingState.limitCheckStatus).toBe('PROCESSING');
  });

  test('should process CTI message with both VAM and limit check', async () => {
    // Given: A credit transfer message requiring both VAM mediation and limit check
    const paymentMessage = kafkaUtils.createTestPaymentMessage({
      messageType: 'PACS008',
      enrichmentData: {
        ...kafkaUtils.createTestPaymentMessage().enrichmentData,
        authMethod: 'GROUPLIMIT',
        physicalAcctInfo: {
          ...kafkaUtils.createTestPaymentMessage().enrichmentData!.physicalAcctInfo,
          acctSys: 'VAM',
        },
      },
    });

    // When: Message is published to enriched-messages topic
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Then: Should publish to all three services
    const accountingMessage = await kafkaUtils.waitForMessage(
      'json-accounting-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(accountingMessage).toBeTruthy();

    const vamMessage = await kafkaUtils.waitForMessage(
      'json-vammediation-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(vamMessage).toBeTruthy();

    const limitCheckMessage = await kafkaUtils.waitForMessage(
      'json-limitcheck-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(limitCheckMessage).toBeTruthy();

    // And: Should track all services in processing state
    const processingState = await spannerUtils.getProcessingState(paymentMessage.messageId);
    expect(processingState.accountingStatus).toBe('PROCESSING');
    expect(processingState.vamMediationStatus).toBe('PROCESSING');
    expect(processingState.limitCheckStatus).toBe('PROCESSING');
  });

  test('should complete workflow when all services respond', async () => {
    // Given: A credit transfer message with all services required
    const paymentMessage = kafkaUtils.createTestPaymentMessage({
      messageType: 'PACS008',
      enrichmentData: {
        ...kafkaUtils.createTestPaymentMessage().enrichmentData,
        authMethod: 'GROUPLIMIT',
        physicalAcctInfo: {
          ...kafkaUtils.createTestPaymentMessage().enrichmentData!.physicalAcctInfo,
          acctSys: 'VAM',
        },
      },
    });

    // When: Message is published and all services respond
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Wait for downstream messages
    await kafkaUtils.waitForMessage('json-accounting-messages', paymentMessage.messageId, 15000);
    await kafkaUtils.waitForMessage('json-vammediation-messages', paymentMessage.messageId, 15000);
    await kafkaUtils.waitForMessage('json-limitcheck-messages', paymentMessage.messageId, 15000);

    // Simulate successful responses from all services
    await kafkaUtils.publishResponseMessage(
      'accounting-response-messages',
      kafkaUtils.createResponseMessage(paymentMessage.messageId, 'COMPLETED', { service: 'accounting' })
    );

    await kafkaUtils.publishResponseMessage(
      'vammediation-response-messages',
      kafkaUtils.createResponseMessage(paymentMessage.messageId, 'COMPLETED', { service: 'vammediation' })
    );

    await kafkaUtils.publishResponseMessage(
      'limitcheck-response-messages',
      kafkaUtils.createResponseMessage(paymentMessage.messageId, 'COMPLETED', { service: 'limitcheck' })
    );

    // Then: Processing should be completed
    const completedState = await spannerUtils.waitForProcessingState(
      paymentMessage.messageId, 
      'COMPLETED', 
      20000
    );
    expect(completedState.overallStatus).toBe('COMPLETED');
    expect(completedState.accountingStatus).toBe('COMPLETED');
    expect(completedState.vamMediationStatus).toBe('COMPLETED');
    expect(completedState.limitCheckStatus).toBe('COMPLETED');
    expect(completedState.completedAt).toBeTruthy();
  });

  test('should handle PACS007 payment return messages', async () => {
    // Given: A PACS007 payment return message
    const paymentMessage = kafkaUtils.createTestPaymentMessage({
      messageType: 'PACS007',
      originalMessage: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.09">
    <FIToFIPmtRtr>
        <GrpHdr>
            <MsgId>RETURN_MSG_${Date.now()}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
        </GrpHdr>
        <TxInf>
            <RtrId>RTR_${Date.now()}</RtrId>
            <OrgnlEndToEndId>ORIGINAL_E2E_123</OrgnlEndToEndId>
            <RtrdInstrAmt Ccy="SGD">1000.00</RtrdInstrAmt>
            <RtrRsnInf>
                <Rsn>
                    <Cd>AC01</Cd>
                </Rsn>
            </RtrRsnInf>
        </TxInf>
    </FIToFIPmtRtr>
</Document>`,
    });

    // When: Message is published to enriched-messages topic
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Then: Should process as CTI workflow
    const processingState = await spannerUtils.waitForProcessingState(
      paymentMessage.messageId, 
      'RECEIVED', 
      15000
    );
    expect(processingState.workflowType).toBe('CTI');
    expect(processingState.messageType).toBe('PACS007');

    // And: Should publish to accounting service
    const accountingMessage = await kafkaUtils.waitForMessage(
      'json-accounting-messages', 
      paymentMessage.messageId,
      15000
    );
    expect(accountingMessage).toBeTruthy();
    expect(accountingMessage.messageType).toBe('PACS007');
  });

  test('should reject duplicate messages', async () => {
    // Given: An original credit transfer message
    const originalMessage = kafkaUtils.createTestPaymentMessage({
      messageType: 'PACS008',
    });

    // When: Original message is published
    await kafkaUtils.publishPaymentMessage('enriched-messages', originalMessage);

    // Wait for processing to start
    await spannerUtils.waitForProcessingState(originalMessage.messageId, undefined, 15000);

    // And: A duplicate message with same content but different message ID is published
    const duplicateMessage = {
      ...originalMessage,
      messageId: 'duplicate-' + originalMessage.messageId,
    };

    await kafkaUtils.publishPaymentMessage('enriched-messages', duplicateMessage);

    // Give some time for potential duplicate processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Then: Only the original message should have a processing state
    const originalState = await spannerUtils.getProcessingState(originalMessage.messageId);
    expect(originalState).toBeTruthy();

    const duplicateState = await spannerUtils.getProcessingState(duplicateMessage.messageId);
    expect(duplicateState).toBeFalsy();

    // And: Only one accounting message should be published
    const accountingMessages = kafkaUtils.getConsumedMessages('json-accounting-messages');
    const relatedMessages = accountingMessages.filter(msg => 
      msg.puid === originalMessage.puid && msg.messageType === 'PACS008'
    );
    expect(relatedMessages.length).toBe(1);
    expect(relatedMessages[0].messageId).toBe(originalMessage.messageId);
  });

  test('should handle service failures gracefully', async () => {
    // Given: A credit transfer message
    const paymentMessage = kafkaUtils.createTestPaymentMessage({
      messageType: 'PACS008',
    });

    // When: Message is published and accounting service fails
    await kafkaUtils.publishPaymentMessage('enriched-messages', paymentMessage);

    // Wait for downstream message
    await kafkaUtils.waitForMessage('json-accounting-messages', paymentMessage.messageId, 15000);

    // Simulate failure response from accounting service
    await kafkaUtils.publishResponseMessage(
      'accounting-response-messages',
      kafkaUtils.createResponseMessage(paymentMessage.messageId, 'FAILED', { 
        error: 'Account validation failed',
        errorCode: 'INVALID_ACCOUNT'
      })
    );

    // Then: Processing should be marked as failed
    const failedState = await spannerUtils.waitForProcessingState(
      paymentMessage.messageId, 
      'FAILED', 
      15000
    );
    expect(failedState.overallStatus).toBe('FAILED');
    expect(failedState.accountingStatus).toBe('FAILED');
    expect(failedState.errorMessage).toContain('Error handling response from accounting');
  });
}); 