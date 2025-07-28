import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import waitForExpect from 'wait-for-expect';

export interface PaymentMessage {
  messageId: string;
  puid: string;
  messageType: string;
  originalMessage: string;
  enrichmentData?: any;
  validationResult?: any;
  receivedAt: string;
  metadata?: any;
}

export interface JsonMessage {
  messageId: string;
  puid: string;
  messageType: string;
  processedAt: string;
  workflow: string;
  paymentData?: any;
  enrichmentData?: any;
  metadata?: any;
}

export interface ResponseMessage {
  messageId: string;
  status: 'COMPLETED' | 'FAILED' | 'PROCESSING';
  data?: any;
  timestamp: string;
}

export class KafkaTestUtils {
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();
  private consumedMessages: Map<string, any[]> = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'playwright-test-client',
      brokers: ['localhost:9092'],
      retry: {
        retries: 5,
        initialRetryTime: 1000,
        maxRetryTime: 5000,
      },
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });
  }

  async verifyConnectivity(): Promise<void> {
    try {
      await this.producer.connect();
      console.log('✅ Kafka producer connected successfully');
    } catch (error) {
      throw new Error(`Failed to connect to Kafka: ${error}`);
    }
  }

  async cleanup(): Promise<void> {
    // Disconnect all consumers
    for (const [topic, consumer] of this.consumers) {
      try {
        await consumer.disconnect();
        console.log(`✅ Disconnected consumer for topic: ${topic}`);
      } catch (error) {
        console.warn(`Failed to disconnect consumer for topic ${topic}:`, error);
      }
    }
    this.consumers.clear();
    this.consumedMessages.clear();

    // Disconnect producer
    try {
      await this.producer.disconnect();
      console.log('✅ Kafka producer disconnected');
    } catch (error) {
      console.warn('Failed to disconnect producer:', error);
    }
  }

  async publishPaymentMessage(topic: string, message: PaymentMessage): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: message.messageId,
            value: JSON.stringify(message),
            timestamp: Date.now().toString(),
          },
        ],
      });
      console.log(`📤 Published payment message to ${topic}: ${message.messageId}`);
    } catch (error) {
      throw new Error(`Failed to publish message to ${topic}: ${error}`);
    }
  }

  async publishResponseMessage(topic: string, response: ResponseMessage): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: response.messageId,
            value: JSON.stringify(response),
            timestamp: Date.now().toString(),
          },
        ],
      });
      console.log(`📤 Published response message to ${topic}: ${response.messageId}`);
    } catch (error) {
      throw new Error(`Failed to publish response to ${topic}: ${error}`);
    }
  }

  async startConsumer(topic: string, groupId?: string): Promise<void> {
    if (this.consumers.has(topic)) {
      console.log(`Consumer for topic ${topic} already exists`);
      return;
    }

    const consumer = this.kafka.consumer({
      groupId: groupId || `test-consumer-${topic}-${uuidv4()}`,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    // Initialize message array for this topic
    this.consumedMessages.set(topic, []);

    await consumer.run({
      eachMessage: async ({ message, topic: receivedTopic }: EachMessagePayload) => {
        try {
          const value = message.value?.toString();
          if (value) {
            const parsedMessage = JSON.parse(value);
            const messages = this.consumedMessages.get(receivedTopic) || [];
            messages.push({
              ...parsedMessage,
              key: message.key?.toString(),
              timestamp: message.timestamp,
              receivedAt: new Date().toISOString(),
            });
            this.consumedMessages.set(receivedTopic, messages);
            console.log(`📥 Consumed message from ${receivedTopic}: ${parsedMessage.messageId || 'unknown'}`);
          }
        } catch (error) {
          console.error(`Error processing message from ${receivedTopic}:`, error);
        }
      },
    });

    this.consumers.set(topic, consumer);
    console.log(`✅ Started consumer for topic: ${topic}`);
  }

  async waitForMessage(topic: string, messageId: string, timeoutMs: number = 30000): Promise<any> {
    await waitForExpect(
      () => {
        const messages = this.consumedMessages.get(topic) || [];
        const message = messages.find(msg => msg.messageId === messageId);
        if (!message) {
          throw new Error(`Message ${messageId} not found in topic ${topic}`);
        }
        return message;
      },
      timeoutMs,
      1000
    );

    const messages = this.consumedMessages.get(topic) || [];
    return messages.find(msg => msg.messageId === messageId);
  }

  async waitForAnyMessage(topic: string, timeoutMs: number = 30000): Promise<any> {
    await waitForExpect(
      () => {
        const messages = this.consumedMessages.get(topic) || [];
        if (messages.length === 0) {
          throw new Error(`No messages found in topic ${topic}`);
        }
        return messages[messages.length - 1]; // Return latest message
      },
      timeoutMs,
      1000
    );

    const messages = this.consumedMessages.get(topic) || [];
    return messages[messages.length - 1];
  }

  getConsumedMessages(topic: string): any[] {
    return this.consumedMessages.get(topic) || [];
  }

  clearConsumedMessages(topic: string): void {
    this.consumedMessages.set(topic, []);
  }

  // Test data creators
  createTestPaymentMessage(overrides: Partial<PaymentMessage> = {}): PaymentMessage {
    const messageId = uuidv4();
    return {
      messageId,
      puid: `TEST_PUID_${Date.now()}`,
      messageType: 'PACS008',
      originalMessage: this.createTestPacs008Xml(),
      enrichmentData: {
        receivedAcctId: '1234567890',
        lookupStatusCode: 200,
        lookupStatusDesc: 'Success',
        normalizedAcctId: '1234567890',
        matchedAcctId: '1234567890',
        isPhysical: 'true',
        authMethod: 'STANDARD',
        physicalAcctInfo: {
          acctSys: 'MDZ',
          acctGroup: 'RETAIL',
          country: 'SG',
          currencyCode: 'SGD',
        },
      },
      receivedAt: new Date().toISOString(),
      metadata: {
        source: 'test',
        version: '1.0.0',
      },
      ...overrides,
    };
  }

  createTestVamMediationMessage(overrides: Partial<PaymentMessage> = {}): PaymentMessage {
    const baseMessage = this.createTestPaymentMessage(overrides);
    baseMessage.enrichmentData.physicalAcctInfo.acctSys = 'VAM';
    return baseMessage;
  }

  createTestLimitCheckMessage(overrides: Partial<PaymentMessage> = {}): PaymentMessage {
    const baseMessage = this.createTestPaymentMessage(overrides);
    baseMessage.enrichmentData.authMethod = 'GROUPLIMIT';
    return baseMessage;
  }

  createTestDirectDebitMessage(overrides: Partial<PaymentMessage> = {}): PaymentMessage {
    const baseMessage = this.createTestPaymentMessage({
      messageType: 'PACS003',
      originalMessage: this.createTestPacs003Xml(),
      ...overrides,
    });
    return baseMessage;
  }

  createResponseMessage(messageId: string, status: 'COMPLETED' | 'FAILED' | 'PROCESSING', data?: any): ResponseMessage {
    return {
      messageId,
      status,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  private createTestPacs008Xml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
    <FIToFICstmrCdtTrf>
        <GrpHdr>
            <MsgId>TEST_MSG_${Date.now()}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
            <NbOfTxs>1</NbOfTxs>
            <TtlIntrBkSttlmAmt Ccy="SGD">1000.00</TtlIntrBkSttlmAmt>
        </GrpHdr>
        <CdtTrfTxInf>
            <PmtId>
                <InstrId>INSTR_${Date.now()}</InstrId>
                <EndToEndId>E2E_${Date.now()}</EndToEndId>
            </PmtId>
            <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
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
            <RmtInf>
                <Ustrd>Test payment</Ustrd>
            </RmtInf>
        </CdtTrfTxInf>
    </FIToFICstmrCdtTrf>
</Document>`;
  }

  private createTestPacs003Xml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.003.001.08">
    <FIToFICstmrDrctDbt>
        <GrpHdr>
            <MsgId>TEST_DDI_${Date.now()}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
            <NbOfTxs>1</NbOfTxs>
            <TtlIntrBkSttlmAmt Ccy="SGD">500.00</TtlIntrBkSttlmAmt>
        </GrpHdr>
        <DrctDbtTxInf>
            <PmtId>
                <InstrId>DDI_INSTR_${Date.now()}</InstrId>
                <EndToEndId>DDI_E2E_${Date.now()}</EndToEndId>
            </PmtId>
            <InstrAmt Ccy="SGD">500.00</InstrAmt>
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
        </DrctDbtTxInf>
    </FIToFICstmrDrctDbt>
</Document>`;
  }
} 