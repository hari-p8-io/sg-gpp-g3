import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import waitForExpect from 'wait-for-expect';

/**
 * Kafka test utilities for E2E tests
 */
export class KafkaTestUtils {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private receivedMessages: Map<string, any[]> = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: `test-client-${uuidv4().substring(0, 8)}`,
      brokers: ['localhost:39092'],
      logLevel: logLevel.ERROR,
    });
  }

  /**
   * Initialize the Kafka producer
   */
  async initProducer(): Promise<void> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }
  }

  /**
   * Send a message to a Kafka topic
   * @param topic The topic to send to
   * @param key The message key
   * @param value The message value
   */
  async sendMessage(topic: string, key: string, value: any): Promise<void> {
    if (!this.producer) {
      await this.initProducer();
    }

    await this.producer!.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(value),
        },
      ],
    });
  }

  /**
   * Initialize a Kafka consumer for a topic
   * @param topic The topic to consume from
   */
  async initConsumer(topic: string): Promise<void> {
    if (this.consumers.has(topic)) {
      return;
    }

    const consumer = this.kafka.consumer({
      groupId: `test-group-${uuidv4().substring(0, 8)}`,
    });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    // Initialize the received messages array for this topic
    if (!this.receivedMessages.has(topic)) {
      this.receivedMessages.set(topic, []);
    }

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          const messageValue = JSON.parse(message.value.toString());
          const messages = this.receivedMessages.get(topic) || [];
          messages.push(messageValue);
          this.receivedMessages.set(topic, messages);
        }
      },
    });

    this.consumers.set(topic, consumer);
  }

  /**
   * Wait for a message to be received on a topic
   * @param topic The topic to wait for
   * @param timeoutMs Maximum time to wait in milliseconds
   * @param intervalMs Interval between checks in milliseconds
   */
  async waitForMessage(
    topic: string,
    timeoutMs: number = 10000,
    intervalMs: number = 500
  ): Promise<any> {
    await waitForExpect(() => {
      const messages = this.receivedMessages.get(topic) || [];
      expect(messages.length).toBeGreaterThan(0);
    }, timeoutMs, intervalMs);

    return this.receivedMessages.get(topic)![0];
  }

  /**
   * Get all received messages for a topic
   * @param topic The topic to get messages for
   */
  getReceivedMessages(topic: string): any[] {
    return this.receivedMessages.get(topic) || [];
  }

  /**
   * Clear all received messages for all topics
   */
  clearReceivedMessages(): void {
    for (const topic of this.receivedMessages.keys()) {
      this.receivedMessages.set(topic, []);
    }
  }

  /**
   * Disconnect all Kafka producers and consumers
   */
  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }

    this.consumers.clear();
  }
}

// Create and export a singleton instance
export const kafkaUtils = new KafkaTestUtils(); 