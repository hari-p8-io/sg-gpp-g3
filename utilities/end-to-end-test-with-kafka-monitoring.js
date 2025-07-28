#!/usr/bin/env node

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const path = require('path');
const chalk = require('chalk');

// Configuration
const SERVICES = {
  requestHandler: { port: 50051, proto: 'fast-requesthandler-service/proto/message_handler.proto' },
  enrichment: { port: 50052, health: 'grpc' },
  validation: { port: 50053, health: 'grpc' },
  orchestrator: { port: 3004, health: 'http://localhost:3004/health' },
  accounting: { port: 8002, health: 'http://localhost:8002/actuator/health' },
  vamMediation: { port: 3005, health: 'http://localhost:3005/health' },
  limitCheck: { port: 3006, health: 'http://localhost:3006/health' }
};

const KAFKA_CONFIG = {
  brokers: ['localhost:9092'],
  topics: {
    validatedMessages: 'validated-messages',
    vamMessages: 'vam-messages',
    vamResponses: 'vam-responses', 
    limitCheckMessages: 'limitcheck-messages'
  }
};

// Test message data
const TEST_PACS_MESSAGE = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>E2E-TEST-${Date.now()}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-TEST-001</EndToEndId>
        <TxId>E2E-TX-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">5000.00</IntrBkSttlmAmt>
      <ChrgBr>SLEV</ChrgBr>
      <Dbtr>
        <Nm>Singapore Test Debtor E2E</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>888777666555</Id>
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
        <Nm>Singapore Test Creditor E2E</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>999888777666</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

class E2ETestRunner {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'e2e-test-runner',
      brokers: KAFKA_CONFIG.brokers
    });
    this.messageTracker = new Map();
    this.kafkaMessages = {};
    this.startTime = Date.now();
  }

  // Visual logging with colors and timestamps
  log(service, level, message, data = null) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    
    let color = chalk.white;
    let icon = '📋';
    
    switch (level) {
      case 'SUCCESS': color = chalk.green; icon = '✅'; break;
      case 'ERROR': color = chalk.red; icon = '❌'; break;
      case 'INFO': color = chalk.blue; icon = 'ℹ️'; break;
      case 'WARNING': color = chalk.yellow; icon = '⚠️'; break;
      case 'KAFKA': color = chalk.yellow; icon = '📨'; break;
      case 'SERVICE': color = chalk.cyan; icon = '🔧'; break;
      default: color = chalk.white;
    }

    console.log(color(`${icon} [${elapsed}ms] [${service}] ${message}`));
    
    if (data) {
      console.log(chalk.gray(`   📄 Data: ${JSON.stringify(data, null, 2)}`));
    }
  }

  // Check service health
  async checkServiceHealth() {
    this.log('HEALTH', 'INFO', 'Checking service health...');
    
    // Essential services that must be running
    const essentialServices = [
      { name: 'orchestrator', url: SERVICES.orchestrator.health }
    ];
    
    // Optional services that enhance the test but aren't required
    const optionalServices = [
      { name: 'accounting', url: SERVICES.accounting.health },
      { name: 'vamMediation', url: SERVICES.vamMediation.health },
      { name: 'limitCheck', url: SERVICES.limitCheck.health }
    ];
    
    // Check essential services
    for (const service of essentialServices) {
      try {
        await this.checkHttpHealth(service.name, service.url);
        this.log(service.name, 'SUCCESS', 'Essential service is healthy');
      } catch (error) {
        this.log(service.name, 'ERROR', `Essential service health check failed: ${error.message}`);
        throw new Error(`Essential service ${service.name} is not available`);
      }
    }
    
    // Check optional services (don't fail if they're not available)
    for (const service of optionalServices) {
      try {
        await this.checkHttpHealth(service.name, service.url);
        this.log(service.name, 'SUCCESS', 'Optional service is healthy');
      } catch (error) {
        this.log(service.name, 'WARNING', `Optional service not available: ${error.message}`);
      }
    }
  }

  async checkHttpHealth(serviceName, url) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      return { service: serviceName, healthy: true, status: response.status };
    } catch (error) {
      throw new Error(`${serviceName} health check failed: ${error.message}`);
    }
  }

  // Setup Kafka consumers to monitor all topics
  async setupKafkaMonitoring() {
    this.log('KAFKA', 'INFO', 'Setting up Kafka topic monitoring...');
    
    const consumer = this.kafka.consumer({ groupId: 'e2e-test-monitor' });
    await consumer.connect();
    
    // Subscribe to all relevant topics
    await consumer.subscribe({ 
      topics: Object.values(KAFKA_CONFIG.topics),
      fromBeginning: false 
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const messageValue = message.value?.toString();
        if (!messageValue) return;

        try {
          const parsedMessage = JSON.parse(messageValue);
          this.kafkaMessages[topic] = this.kafkaMessages[topic] || [];
          this.kafkaMessages[topic].push({
            timestamp: new Date().toISOString(),
            partition,
            offset: message.offset,
            data: parsedMessage
          });

          this.log('KAFKA', 'KAFKA', `Message received on topic: ${topic}`, {
            messageId: parsedMessage.messageId || 'unknown',
            messageType: parsedMessage.messageType || 'unknown',
            topic: topic,
            partition: partition,
            offset: message.offset
          });

          // Track specific message flow
          if (parsedMessage.messageId && this.messageTracker.has(parsedMessage.messageId)) {
            const tracker = this.messageTracker.get(parsedMessage.messageId);
            tracker.kafkaEvents.push({
              topic,
              timestamp: new Date().toISOString(),
              data: parsedMessage
            });
          }

        } catch (error) {
          this.log('KAFKA', 'ERROR', `Failed to parse Kafka message: ${error.message}`);
        }
      }
    });

    this.log('KAFKA', 'SUCCESS', 'Kafka monitoring setup complete');
    return consumer;
  }

  // Send message to request handler
  async sendToRequestHandler(messageId) {
    this.log('REQUEST_HANDLER', 'INFO', 'Connecting to request handler service...');
    
    try {
      // Load proto definition
      const protoPath = path.join(__dirname, '..', SERVICES.requestHandler.proto);
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const messageProto = grpc.loadPackageDefinition(packageDefinition);
      const client = new messageProto.gpp.g3.requesthandler.MessageHandler(
        `localhost:${SERVICES.requestHandler.port}`,
        grpc.credentials.createInsecure()
      );

      // Debug: log available methods
      this.log('REQUEST_HANDLER', 'INFO', 'Available client methods:', Object.getOwnPropertyNames(client.__proto__));

      this.log('REQUEST_HANDLER', 'INFO', 'Sending PACS message...');

      const request = {
        message_type: 'PACS008',
        xml_payload: TEST_PACS_MESSAGE,
        metadata: {
          source: 'e2e-test',
          country: 'SG',
          currency: 'SGD',
          test_run_id: messageId
        }
      };

      const response = await new Promise((resolve, reject) => {
        client.ProcessMessage(request, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });

      this.log('REQUEST_HANDLER', 'SUCCESS', 'Message processed by request handler', {
        messageId: response.message_id,
        puid: response.puid,
        success: response.success,
        processingTime: response.processing_time_ms
      });

      // Track this message
      this.messageTracker.set(response.message_id, {
        messageId: response.message_id,
        puid: response.puid,
        startTime: Date.now(),
        services: ['request_handler'],
        kafkaEvents: [],
        finalStatus: 'processing'
      });

      return response;

    } catch (error) {
      this.log('REQUEST_HANDLER', 'ERROR', `Failed to send message: ${error.message}`);
      throw error;
    }
  }

  // Monitor orchestrator API for message processing
  async monitorOrchestrator(messageId) {
    this.log('ORCHESTRATOR', 'INFO', 'Monitoring orchestrator for message processing...');
    
    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check orchestrator messages
        const messagesResponse = await axios.get('http://localhost:3004/api/v1/messages');
        const orchestrationResponse = await axios.get('http://localhost:3004/api/v1/orchestration');

        // Look for our message
        const processedMessage = messagesResponse.data.messages.find(
          msg => msg.messageId === messageId || msg.puid?.includes(messageId.slice(-8))
        );

        const orchestrationStatus = orchestrationResponse.data.orchestrations.find(
          orch => orch.messageId === messageId || orch.puid?.includes(messageId.slice(-8))
        );

        if (processedMessage || orchestrationStatus) {
          this.log('ORCHESTRATOR', 'SUCCESS', 'Message found in orchestrator', {
            processedMessage: processedMessage ? 'Found' : 'Not found',
            orchestrationStatus: orchestrationStatus ? orchestrationStatus.status : 'Not found'
          });

          if (orchestrationStatus) {
            this.log('ORCHESTRATOR', 'INFO', 'Orchestration steps', orchestrationStatus.steps);
          }

          return { processedMessage, orchestrationStatus };
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        this.log('ORCHESTRATOR', 'ERROR', `Error monitoring orchestrator: ${error.message}`);
      }
    }

    this.log('ORCHESTRATOR', 'ERROR', 'Timeout waiting for message in orchestrator');
    return null;
  }

  // Wait for Kafka messages and assert
  async waitForKafkaMessages(messageId, expectedTopics = []) {
    this.log('KAFKA', 'INFO', `Waiting for messages on topics: ${expectedTopics.join(', ')}`);
    
    const maxWaitTime = 20000; // 20 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const foundTopics = expectedTopics.filter(topic => {
        return this.kafkaMessages[topic] && this.kafkaMessages[topic].some(msg => 
          msg.data.messageId === messageId || msg.data.puid?.includes(messageId.slice(-8))
        );
      });

      if (foundTopics.length === expectedTopics.length) {
        this.log('KAFKA', 'SUCCESS', `All expected messages found on topics: ${foundTopics.join(', ')}`);
        return true;
      }

      if (foundTopics.length > 0) {
        this.log('KAFKA', 'INFO', `Partial match - found on topics: ${foundTopics.join(', ')}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.log('KAFKA', 'ERROR', 'Timeout waiting for expected Kafka messages');
    return false;
  }

  // Generate final report
  generateReport(messageId) {
    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold.blue('🎯 END-TO-END TEST REPORT'));
    console.log('='.repeat(80));

    const tracker = this.messageTracker.get(messageId);
    if (tracker) {
      console.log(chalk.green(`📝 Message ID: ${tracker.messageId}`));
      console.log(chalk.green(`📝 PUID: ${tracker.puid}`));
      console.log(chalk.green(`⏱️  Total Processing Time: ${Date.now() - tracker.startTime}ms`));
    }

    console.log('\n' + chalk.bold.yellow('📊 KAFKA TOPIC SUMMARY:'));
    Object.entries(this.kafkaMessages).forEach(([topic, messages]) => {
      console.log(chalk.cyan(`  📨 ${topic}: ${messages.length} messages`));
      messages.forEach((msg, index) => {
        console.log(chalk.gray(`    ${index + 1}. ${msg.timestamp} - MessageID: ${msg.data.messageId || 'N/A'}`));
      });
    });

    console.log('\n' + chalk.bold.yellow('🔍 MESSAGE FLOW ANALYSIS:'));
    if (tracker?.kafkaEvents.length > 0) {
      tracker.kafkaEvents.forEach((event, index) => {
        console.log(chalk.magenta(`  ${index + 1}. ${event.timestamp} - Topic: ${event.topic}`));
      });
    } else {
      console.log(chalk.red('  ❌ No Kafka events tracked for this message'));
    }

    console.log('\n' + chalk.bold.yellow('✅ ASSERTIONS:'));
    
    // Assert on expected topics based on message content (VAM account = 999888777666)
    const expectedTopics = [
      KAFKA_CONFIG.topics.validatedMessages,
      KAFKA_CONFIG.topics.vamMessages,
      KAFKA_CONFIG.topics.limitCheckMessages // GROUPLIMIT auth method
    ];

    const topicAssertions = expectedTopics.map(topic => {
      const hasMessage = this.kafkaMessages[topic] && this.kafkaMessages[topic].length > 0;
      if (hasMessage) {
        console.log(chalk.green(`  ✅ Topic '${topic}': Message received`));
      } else {
        console.log(chalk.red(`  ❌ Topic '${topic}': No message received`));
      }
      return hasMessage;
    });

    const allAssertionsPassed = topicAssertions.every(assertion => assertion);
    
    console.log('\n' + '='.repeat(80));
    if (allAssertionsPassed) {
      console.log(chalk.bold.green('🎉 END-TO-END TEST PASSED! All assertions successful.'));
    } else {
      console.log(chalk.bold.red('💥 END-TO-END TEST FAILED! Some assertions failed.'));
    }
    console.log('='.repeat(80));

    return allAssertionsPassed;
  }

  // Main test execution
  async runEndToEndTest() {
    console.log(chalk.bold.blue('\n🚀 Starting End-to-End Test with Kafka Monitoring\n'));
    
    try {
      // Step 1: Health checks
      await this.checkServiceHealth();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Setup Kafka monitoring
      const kafkaConsumer = await this.setupKafkaMonitoring();
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Generate unique message ID for tracking
      const testMessageId = `E2E-TEST-${Date.now()}`;
      this.log('TEST', 'INFO', `Starting test with message ID: ${testMessageId}`);

      // Step 4: Send message to request handler
      const requestResponse = await this.sendToRequestHandler(testMessageId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 5: Monitor orchestrator
      const orchestratorResult = await this.monitorOrchestrator(requestResponse.message_id);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 6: Wait for expected Kafka messages
      const expectedTopics = [
        KAFKA_CONFIG.topics.validatedMessages,
        KAFKA_CONFIG.topics.vamMessages,
        KAFKA_CONFIG.topics.limitCheckMessages
      ];
      
      const kafkaSuccess = await this.waitForKafkaMessages(requestResponse.message_id, expectedTopics);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 7: Generate report
      const testPassed = this.generateReport(requestResponse.message_id);

      // Cleanup
      await kafkaConsumer.disconnect();

      return testPassed;

    } catch (error) {
      console.error(chalk.red(`\n❌ End-to-End Test Failed: ${error.message}`));
      console.error(error.stack);
      return false;
    }
  }
}

// Main execution
async function main() {
  const testRunner = new E2ETestRunner();
  const success = await testRunner.runEndToEndTest();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = E2ETestRunner; 