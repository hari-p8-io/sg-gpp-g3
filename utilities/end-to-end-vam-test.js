const axios = require('axios');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');

// ANSI color codes for better output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Test configuration
const config = {
    requestHandler: {
        host: 'localhost',
        port: 50051
    },
    orchestrator: {
        host: 'localhost',
        port: 3004
    },
    kafka: {
        brokers: ['localhost:9092'],
        topics: {
            vam: 'vam-messages',
            mdz: 'mdz-messages'
        }
    },
    timeout: 30000
};

// VAM test accounts
const VAM_ACCOUNTS = [
    '999888777',
    'VAMTEST123', 
    'VAM12345',
    'VAMROUTING456'
];

// Regular test accounts (should route to MDZ)
const REGULAR_ACCOUNTS = [
    '123456789',
    'CORP12345'
];

class EndToEndVAMTest {
    constructor() {
        this.kafka = null;
        this.vamConsumer = null;
        this.mdzConsumer = null;
        this.requestHandlerClient = null;
        this.results = [];
    }

    async initialize() {
        console.log(`${colors.cyan}🔧 Initializing End-to-End VAM Test...${colors.reset}`);
        
        // Initialize Kafka
        this.kafka = new Kafka({
            clientId: 'vam-e2e-test',
            brokers: config.kafka.brokers
        });

        // Initialize gRPC client for request handler
        await this.initializeRequestHandlerClient();
        
        // Initialize Kafka consumers
        await this.initializeKafkaConsumers();

        console.log(`${colors.green}✅ Test initialization complete${colors.reset}`);
    }

    async initializeRequestHandlerClient() {
        console.log(`${colors.blue}📡 Initializing Request Handler gRPC client...${colors.reset}`);
        
        const packageDefinition = protoLoader.loadSync('./proto/pacs_service.proto', {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });

        const pacsProto = grpc.loadPackageDefinition(packageDefinition);
        
        this.requestHandlerClient = new pacsProto.PacsService(
            `${config.requestHandler.host}:${config.requestHandler.port}`,
            grpc.credentials.createInsecure()
        );

        console.log(`${colors.green}✅ Request Handler gRPC client initialized${colors.reset}`);
    }

    async initializeKafkaConsumers() {
        console.log(`${colors.blue}📡 Initializing Kafka consumers...${colors.reset}`);
        
        // VAM consumer
        this.vamConsumer = this.kafka.consumer({
            groupId: 'vam-e2e-test-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        // MDZ consumer  
        this.mdzConsumer = this.kafka.consumer({
            groupId: 'mdz-e2e-test-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.vamConsumer.connect();
        await this.mdzConsumer.connect();

        await this.vamConsumer.subscribe({ topics: [config.kafka.topics.vam] });
        await this.mdzConsumer.subscribe({ topics: [config.kafka.topics.mdz] });

        console.log(`${colors.green}✅ Kafka consumers initialized${colors.reset}`);
    }

    async runVAMTest(account) {
        console.log(`${colors.magenta}🧪 Testing VAM account: ${account}${colors.reset}`);
        
        const testId = uuidv4();
        const messageId = `vam-test-${Date.now()}`;
        
        // Create PACS message with VAM account
        const pacsMessage = this.createPACSMessage(messageId, account, testId);
        
        // Track messages from Kafka
        const receivedMessages = {
            vam: [],
            mdz: []
        };

        // Set up Kafka message tracking
        const kafkaPromise = this.trackKafkaMessages(receivedMessages, testId);

        // Send message to Request Handler
        console.log(`${colors.blue}📤 Sending PACS message to Request Handler...${colors.reset}`);
        const processingResult = await this.sendPACSMessage(pacsMessage);
        
        if (!processingResult.success) {
            return {
                account,
                success: false,
                error: processingResult.error,
                stage: 'REQUEST_HANDLER'
            };
        }

        // Wait for Kafka messages
        console.log(`${colors.yellow}⏳ Waiting for Kafka routing (30s timeout)...${colors.reset}`);
        
        try {
            await Promise.race([
                kafkaPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Kafka timeout')), config.timeout)
                )
            ]);
        } catch (error) {
            console.log(`${colors.red}❌ Kafka timeout or error: ${error.message}${colors.reset}`);
        }

        // Analyze results
        const result = this.analyzeVAMResult(account, receivedMessages, testId);
        
        console.log(`${colors.cyan}📊 VAM Test Result for ${account}:${colors.reset}`);
        console.log(`   VAM Messages: ${receivedMessages.vam.length}`);
        console.log(`   MDZ Messages: ${receivedMessages.mdz.length}`);
        console.log(`   Expected: VAM routing`);
        console.log(`   Result: ${result.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
        
        return result;
    }

    async runRegularTest(account) {
        console.log(`${colors.magenta}🧪 Testing Regular account: ${account}${colors.reset}`);
        
        const testId = uuidv4();
        const messageId = `regular-test-${Date.now()}`;
        
        // Create PACS message with regular account
        const pacsMessage = this.createPACSMessage(messageId, account, testId);
        
        // Track messages from Kafka
        const receivedMessages = {
            vam: [],
            mdz: []
        };

        // Set up Kafka message tracking
        const kafkaPromise = this.trackKafkaMessages(receivedMessages, testId);

        // Send message to Request Handler
        console.log(`${colors.blue}📤 Sending PACS message to Request Handler...${colors.reset}`);
        const processingResult = await this.sendPACSMessage(pacsMessage);
        
        if (!processingResult.success) {
            return {
                account,
                success: false,
                error: processingResult.error,
                stage: 'REQUEST_HANDLER'
            };
        }

        // Wait for Kafka messages
        console.log(`${colors.yellow}⏳ Waiting for Kafka routing (30s timeout)...${colors.reset}`);
        
        try {
            await Promise.race([
                kafkaPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Kafka timeout')), config.timeout)
                )
            ]);
        } catch (error) {
            console.log(`${colors.red}❌ Kafka timeout or error: ${error.message}${colors.reset}`);
        }

        // Analyze results
        const result = this.analyzeRegularResult(account, receivedMessages, testId);
        
        console.log(`${colors.cyan}📊 Regular Test Result for ${account}:${colors.reset}`);
        console.log(`   VAM Messages: ${receivedMessages.vam.length}`);
        console.log(`   MDZ Messages: ${receivedMessages.mdz.length}`);
        console.log(`   Expected: MDZ routing`);
        console.log(`   Result: ${result.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
        
        return result;
    }

    async trackKafkaMessages(receivedMessages, testId) {
        const promises = [];

        // Track VAM messages
        promises.push(
            this.vamConsumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const messageValue = message.value.toString();
                        const parsedMessage = JSON.parse(messageValue);
                        
                        // Check if this message belongs to our test
                        if (parsedMessage.testId === testId || 
                            parsedMessage.puid?.includes(testId) ||
                            messageValue.includes(testId)) {
                            console.log(`${colors.green}📥 VAM message received:${colors.reset}`, {
                                topic,
                                partition,
                                offset: message.offset,
                                testId: parsedMessage.testId || 'unknown'
                            });
                            receivedMessages.vam.push(parsedMessage);
                        }
                    } catch (error) {
                        console.log(`${colors.red}❌ Error parsing VAM message: ${error.message}${colors.reset}`);
                    }
                }
            })
        );

        // Track MDZ messages
        promises.push(
            this.mdzConsumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const messageValue = message.value.toString();
                        const parsedMessage = JSON.parse(messageValue);
                        
                        // Check if this message belongs to our test
                        if (parsedMessage.testId === testId || 
                            parsedMessage.puid?.includes(testId) ||
                            messageValue.includes(testId)) {
                            console.log(`${colors.green}📥 MDZ message received:${colors.reset}`, {
                                topic,
                                partition,
                                offset: message.offset,
                                testId: parsedMessage.testId || 'unknown'
                            });
                            receivedMessages.mdz.push(parsedMessage);
                        }
                    } catch (error) {
                        console.log(`${colors.red}❌ Error parsing MDZ message: ${error.message}${colors.reset}`);
                    }
                }
            })
        );

        await Promise.all(promises);
    }

    async sendPACSMessage(pacsMessage) {
        return new Promise((resolve) => {
            this.requestHandlerClient.ProcessPacsMessage(pacsMessage, (error, response) => {
                if (error) {
                    console.log(`${colors.red}❌ Request Handler error: ${error.message}${colors.reset}`);
                    resolve({ success: false, error: error.message });
                } else {
                    console.log(`${colors.green}✅ Request Handler response:${colors.reset}`, response);
                    resolve({ success: true, response });
                }
            });
        });
    }

    createPACSMessage(messageId, account, testId) {
        const timestamp = new Date().toISOString();
        
        return {
            messageId,
            messageType: 'PACS008',
            payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${messageId}</MsgId>
      <CreDtTm>${timestamp}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>${testId}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <ChrgBr>SLEV</ChrgBr>
      <Dbtr>
        <Nm>Test Debtor</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>987654321001</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <Cdtr>
        <Nm>Test Creditor VAM</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${account}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <Purp>
        <Cd>CBFF</Cd>
      </Purp>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
            testId,
            timestamp
        };
    }

    analyzeVAMResult(account, receivedMessages, testId) {
        const hasVAMMessage = receivedMessages.vam.length > 0;
        const hasMDZMessage = receivedMessages.mdz.length > 0;
        
        if (hasVAMMessage && !hasMDZMessage) {
            return {
                account,
                success: true,
                routing: 'VAM',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        } else if (hasMDZMessage && !hasVAMMessage) {
            return {
                account,
                success: false,
                error: 'Message was routed to MDZ instead of VAM',
                routing: 'MDZ',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        } else if (hasVAMMessage && hasMDZMessage) {
            return {
                account,
                success: false,
                error: 'Message was routed to both VAM and MDZ',
                routing: 'BOTH',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        } else {
            return {
                account,
                success: false,
                error: 'No messages received in any topic',
                routing: 'NONE',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        }
    }

    analyzeRegularResult(account, receivedMessages, testId) {
        const hasVAMMessage = receivedMessages.vam.length > 0;
        const hasMDZMessage = receivedMessages.mdz.length > 0;
        
        if (hasMDZMessage && !hasVAMMessage) {
            return {
                account,
                success: true,
                routing: 'MDZ',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        } else if (hasVAMMessage && !hasMDZMessage) {
            return {
                account,
                success: false,
                error: 'Message was routed to VAM instead of MDZ',
                routing: 'VAM',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        } else if (hasVAMMessage && hasMDZMessage) {
            return {
                account,
                success: false,
                error: 'Message was routed to both VAM and MDZ',
                routing: 'BOTH',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        } else {
            return {
                account,
                success: false,
                error: 'No messages received in any topic',
                routing: 'NONE',
                messages: {
                    vam: receivedMessages.vam.length,
                    mdz: receivedMessages.mdz.length
                }
            };
        }
    }

    async checkServiceHealth() {
        console.log(`${colors.cyan}🏥 Checking service health...${colors.reset}`);
        
        const healthChecks = [
            { name: 'Request Handler', url: 'http://localhost:50051/health' },
            { name: 'Orchestrator', url: 'http://localhost:3004/health' }
        ];

        const results = [];
        
        for (const check of healthChecks) {
            try {
                const response = await axios.get(check.url, { timeout: 5000 });
                results.push({
                    service: check.name,
                    status: 'healthy',
                    response: response.data
                });
                console.log(`${colors.green}✅ ${check.name}: Healthy${colors.reset}`);
            } catch (error) {
                results.push({
                    service: check.name,
                    status: 'unhealthy',
                    error: error.message
                });
                console.log(`${colors.red}❌ ${check.name}: Unhealthy - ${error.message}${colors.reset}`);
            }
        }

        return results;
    }

    async runAllTests() {
        console.log(`${colors.cyan}🚀 Starting End-to-End VAM Tests...${colors.reset}`);
        
        // Check service health first
        const healthResults = await this.checkServiceHealth();
        const unhealthyServices = healthResults.filter(r => r.status === 'unhealthy');
        
        if (unhealthyServices.length > 0) {
            console.log(`${colors.red}❌ Some services are unhealthy. Please start all services first.${colors.reset}`);
            return;
        }

        // Run VAM tests
        console.log(`${colors.magenta}🧪 Testing VAM accounts...${colors.reset}`);
        for (const account of VAM_ACCOUNTS) {
            const result = await this.runVAMTest(account);
            this.results.push(result);
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Run regular tests
        console.log(`${colors.magenta}🧪 Testing Regular accounts...${colors.reset}`);
        for (const account of REGULAR_ACCOUNTS) {
            const result = await this.runRegularTest(account);
            this.results.push(result);
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Print summary
        this.printSummary();
    }

    printSummary() {
        console.log(`${colors.cyan}📊 End-to-End VAM Test Summary${colors.reset}`);
        console.log(`${'='.repeat(50)}`);
        
        const passed = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        
        console.log(`${colors.green}✅ Passed: ${passed}${colors.reset}`);
        console.log(`${colors.red}❌ Failed: ${failed}${colors.reset}`);
        console.log(`📊 Total: ${this.results.length}`);
        
        // Detailed results
        console.log(`\n${colors.cyan}Detailed Results:${colors.reset}`);
        this.results.forEach((result, index) => {
            const status = result.success ? `${colors.green}✅ PASS` : `${colors.red}❌ FAIL`;
            console.log(`${index + 1}. ${result.account} → ${result.routing || 'UNKNOWN'} ${status}${colors.reset}`);
            if (!result.success && result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });
    }

    async cleanup() {
        console.log(`${colors.cyan}🧹 Cleaning up...${colors.reset}`);
        
        try {
            if (this.vamConsumer) {
                await this.vamConsumer.disconnect();
            }
            if (this.mdzConsumer) {
                await this.mdzConsumer.disconnect();
            }
            if (this.requestHandlerClient) {
                this.requestHandlerClient.close();
            }
        } catch (error) {
            console.log(`${colors.red}❌ Cleanup error: ${error.message}${colors.reset}`);
        }
        
        console.log(`${colors.green}✅ Cleanup complete${colors.reset}`);
    }
}

// Main execution
async function main() {
    const test = new EndToEndVAMTest();
    
    try {
        await test.initialize();
        await test.runAllTests();
    } catch (error) {
        console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
        console.error(error.stack);
    } finally {
        await test.cleanup();
        process.exit(0);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log(`${colors.yellow}🛑 Test interrupted by user${colors.reset}`);
    process.exit(1);
});

process.on('SIGTERM', async () => {
    console.log(`${colors.yellow}🛑 Test terminated${colors.reset}`);
    process.exit(1);
});

if (require.main === module) {
    main().catch(console.error);
}

module.exports = EndToEndVAMTest; 