const { Kafka } = require('kafkajs');
const axios = require('axios');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

class SimplifiedE2ETest {
    constructor() {
        this.kafka = null;
        this.consumer = null;
        this.messageTracker = new Map();
        this.testResults = [];
        this.grpcClient = null;
    }

    log(message, color = colors.cyan) {
        console.log(`${color}[${new Date().toISOString()}] ${message}${colors.reset}`);
    }

    async init() {
        this.log('🚀 Initializing Simplified E2E Test', colors.blue);
        
        // Initialize Kafka
        this.kafka = new Kafka({
            clientId: 'simplified-e2e-test',
            brokers: ['localhost:9092']
        });

        this.consumer = this.kafka.consumer({ groupId: 'simplified-e2e-test-group' });
        await this.setupKafkaConsumer();

        // Initialize gRPC client
        await this.initGrpcClient();

        this.log('✅ Initialization complete', colors.green);
    }

    async setupKafkaConsumer() {
        const topics = ['validated-messages', 'vam-messages'];
        
        await this.consumer.subscribe({ topics });
        
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const data = JSON.parse(message.value.toString());
                    const messageId = data.messageId || data.message_id || data.puid;
                    
                    this.log(`📥 Kafka message: ${topic} - ${messageId}`);
                    
                    if (messageId) {
                        if (!this.messageTracker.has(messageId)) {
                            this.messageTracker.set(messageId, { stages: [] });
                        }
                        
                        this.messageTracker.get(messageId).stages.push({
                            topic,
                            timestamp: Date.now(),
                            data
                        });
                    }
                } catch (error) {
                    this.log(`❌ Error processing Kafka message: ${error.message}`, colors.red);
                }
            },
        });
    }

    async initGrpcClient() {
        try {
            const protoPath = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
            const packageDefinition = protoLoader.loadSync(protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
            });
            
            const proto = grpc.loadPackageDefinition(packageDefinition);
            this.grpcClient = new proto.gpp.g3.requesthandler.PacsHandler(
                'localhost:50051',
                grpc.credentials.createInsecure()
            );
            
            this.log('✅ gRPC client initialized', colors.green);
        } catch (error) {
            this.log(`❌ gRPC client initialization failed: ${error.message}`, colors.red);
            throw error;
        }
    }

    async checkServiceHealth() {
        this.log('🔍 Checking service health...', colors.blue);
        
        const healthChecks = [
            { name: 'Orchestrator', url: 'http://localhost:3004/health' },
            { name: 'VAM Mediation', url: 'http://localhost:3005/health' },
            { name: 'Accounting', url: 'http://localhost:8002/health' }
        ];
        
        const healthStatus = {};
        
        for (const check of healthChecks) {
            try {
                const response = await axios.get(check.url, { timeout: 5000 });
                healthStatus[check.name] = { healthy: true, status: response.status };
                this.log(`✅ ${check.name}: healthy`, colors.green);
            } catch (error) {
                healthStatus[check.name] = { healthy: false, error: error.message };
                this.log(`❌ ${check.name}: unhealthy - ${error.message}`, colors.red);
            }
        }
        
        return healthStatus;
    }

    generateTestMessage(account, amount = 1000) {
        const messageId = `E2E-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return {
            message_type: 'PACS008',
            xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${messageId}</MsgId>
      <CreDtTm>2025-01-08T10:00:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>COVE</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>TXN-${uuidv4()}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">${amount}</IntrBkSttlmAmt>
      <Dbtr>
        <Nm>Test Debtor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <PstCd>018956</PstCd>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>SENDER123</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>ANZBSG3MXXX</BICFI>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>OCBCSG3MXXX</BICFI>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>Test Creditor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <PstCd>567890</PstCd>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${account}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
            metadata: {
                test_id: messageId,
                source: 'simplified-e2e-test'
            }
        };
    }

    async sendMessage(testMessage) {
        this.log(`📤 Sending message ${testMessage.metadata.test_id}`, colors.blue);
        
        return new Promise((resolve, reject) => {
            this.grpcClient.ProcessPacsMessage(testMessage, (error, response) => {
                if (error) {
                    this.log(`❌ gRPC error: ${error.message}`, colors.red);
                    reject(error);
                } else {
                    this.log(`✅ gRPC response: ${response.status} - PUID: ${response.puid}`, colors.green);
                    resolve(response);
                }
            });
        });
    }

    async waitForProcessing(messageId, timeoutMs = 20000) {
        this.log(`⏳ Waiting for message processing: ${messageId}`, colors.yellow);
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            const tracker = this.messageTracker.get(messageId);
            
            if (tracker && tracker.stages.length > 0) {
                return tracker;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.log(`⏰ Timeout waiting for ${messageId}`, colors.yellow);
        return this.messageTracker.get(messageId);
    }

    async checkEndpoints(messageId) {
        const endpointResults = {};
        
        // Check orchestrator
        try {
            const response = await axios.get(`http://localhost:3004/api/v1/orchestration/${messageId}`, { timeout: 5000 });
            endpointResults.orchestrator = { success: true, data: response.data };
            this.log(`✅ Orchestrator endpoint check: ${response.status}`, colors.green);
        } catch (error) {
            endpointResults.orchestrator = { success: false, error: error.message };
            this.log(`❌ Orchestrator endpoint check failed: ${error.message}`, colors.red);
        }
        
        // Check VAM mediation
        try {
            const response = await axios.get('http://localhost:3005/api/v1/vam-messages', { timeout: 5000 });
            endpointResults.vamMediation = { success: true, data: response.data };
            this.log(`✅ VAM Mediation endpoint check: ${response.status}`, colors.green);
        } catch (error) {
            endpointResults.vamMediation = { success: false, error: error.message };
            this.log(`❌ VAM Mediation endpoint check failed: ${error.message}`, colors.red);
        }
        
        // Check accounting
        try {
            const response = await axios.get('http://localhost:8002/api/v1/accounting', { timeout: 5000 });
            endpointResults.accounting = { success: true, data: response.data };
            this.log(`✅ Accounting endpoint check: ${response.status}`, colors.green);
        } catch (error) {
            endpointResults.accounting = { success: false, error: error.message };
            this.log(`❌ Accounting endpoint check failed: ${error.message}`, colors.red);
        }
        
        return endpointResults;
    }

    async runScenario(scenarioName, account, expectedKafkaTopics, description) {
        this.log(`\n🎯 Running Scenario: ${scenarioName}`, colors.magenta);
        this.log(`   Account: ${account}`, colors.cyan);
        this.log(`   Description: ${description}`, colors.cyan);
        this.log(`   Expected Kafka Topics: ${expectedKafkaTopics.join(', ')}`, colors.cyan);
        
        const testMessage = this.generateTestMessage(account);
        const startTime = Date.now();
        
        const testResult = {
            scenario: scenarioName,
            messageId: testMessage.metadata.test_id,
            account,
            description,
            expectedKafkaTopics,
            startTime,
            success: false,
            actualKafkaTopics: [],
            endpointResults: {},
            error: null
        };
        
        try {
            // Send message
            const response = await this.sendMessage(testMessage);
            testResult.grpcResponse = response;
            
            // Use the puid from response for tracking
            const trackingId = response.puid;
            
            // Clear previous tracking
            this.messageTracker.delete(trackingId);
            
            // Wait for processing
            const tracker = await this.waitForProcessing(trackingId);
            
            if (tracker) {
                testResult.actualKafkaTopics = tracker.stages.map(s => s.topic);
                testResult.kafkaMessages = tracker.stages;
            }
            
            // Check endpoints
            testResult.endpointResults = await this.checkEndpoints(trackingId);
            
            // Evaluate success
            const hasExpectedKafkaTopics = expectedKafkaTopics.every(topic => 
                testResult.actualKafkaTopics.includes(topic)
            );
            
            const endpointSuccesses = Object.values(testResult.endpointResults)
                .filter(result => result.success).length;
            
            if (hasExpectedKafkaTopics && endpointSuccesses >= 2) {
                testResult.success = true;
                this.log(`✅ Scenario ${scenarioName} PASSED`, colors.green);
            } else {
                testResult.success = false;
                
                const issues = [];
                if (!hasExpectedKafkaTopics) {
                    const missing = expectedKafkaTopics.filter(topic => !testResult.actualKafkaTopics.includes(topic));
                    issues.push(`Missing Kafka topics: ${missing.join(', ')}`);
                }
                if (endpointSuccesses < 2) {
                    issues.push(`Only ${endpointSuccesses} endpoints responding`);
                }
                
                testResult.error = issues.join('; ');
                this.log(`❌ Scenario ${scenarioName} FAILED: ${testResult.error}`, colors.red);
            }
            
        } catch (error) {
            testResult.success = false;
            testResult.error = error.message;
            this.log(`❌ Scenario ${scenarioName} FAILED: ${error.message}`, colors.red);
        }
        
        testResult.endTime = Date.now();
        testResult.duration = testResult.endTime - testResult.startTime;
        
        this.testResults.push(testResult);
        
        // Wait between scenarios
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        return testResult;
    }

    async runAllScenarios() {
        this.log('\n🧪 Running Simplified E2E Test Scenarios', colors.magenta);
        
        const scenarios = [
            {
                name: 'VAM Account Test (999888777)',
                account: '999888777',
                expectedKafkaTopics: ['validated-messages', 'vam-messages'],
                description: 'Test VAM account routing through VAM mediation service'
            },
            {
                name: 'VAM Test Account (VAMTEST123)',
                account: 'VAMTEST123',
                expectedKafkaTopics: ['validated-messages', 'vam-messages'],
                description: 'Test VAM test account routing through VAM mediation service'
            },
            {
                name: 'VAM12345 Account',
                account: 'VAM12345',
                expectedKafkaTopics: ['validated-messages', 'vam-messages'],
                description: 'Test VAM12345 account routing through VAM mediation service'
            },
            {
                name: 'Regular MDZ Account (123456789)',
                account: '123456789',
                expectedKafkaTopics: ['validated-messages'],
                description: 'Test regular MDZ account routing through accounting service'
            },
            {
                name: 'Corporate Account (888123456)',
                account: '888123456',
                expectedKafkaTopics: ['validated-messages'],
                description: 'Test corporate account routing through accounting service'
            }
        ];
        
        for (const scenario of scenarios) {
            await this.runScenario(scenario.name, scenario.account, scenario.expectedKafkaTopics, scenario.description);
        }
    }

    generateReport() {
        this.log('\n📊 Test Report', colors.magenta);
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        
        console.log('='.repeat(80));
        console.log(`📋 SIMPLIFIED END-TO-END TEST REPORT`);
        console.log('='.repeat(80));
        console.log(`📊 Total Tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`📈 Success Rate: ${totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0}%`);
        console.log('='.repeat(80));
        
        this.testResults.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${index + 1}. ${result.scenario}`);
            console.log(`   Account: ${result.account}`);
            console.log(`   Expected Kafka: ${result.expectedKafkaTopics.join(', ')}`);
            console.log(`   Actual Kafka: ${result.actualKafkaTopics.join(', ')}`);
            console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
            
            // Show endpoint results
            const endpointStatuses = Object.entries(result.endpointResults)
                .map(([name, result]) => `${name}:${result.success ? '✅' : '❌'}`)
                .join(', ');
            console.log(`   Endpoints: ${endpointStatuses}`);
            
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            
            console.log('');
        });
        
        return {
            totalTests,
            passedTests,
            failedTests,
            successRate: totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0,
            results: this.testResults
        };
    }

    async cleanup() {
        this.log('🧹 Cleaning up...', colors.blue);
        
        try {
            if (this.consumer) {
                await this.consumer.disconnect();
            }
            
            this.log('✅ Cleanup complete', colors.green);
        } catch (error) {
            this.log(`❌ Cleanup error: ${error.message}`, colors.red);
        }
    }

    async run() {
        try {
            await this.init();
            
            const healthStatus = await this.checkServiceHealth();
            
            // Check if we have enough healthy services to proceed
            const healthyServices = Object.values(healthStatus).filter(s => s.healthy).length;
            if (healthyServices < 2) {
                this.log('❌ Not enough healthy services to run tests', colors.red);
                return;
            }
            
            await this.runAllScenarios();
            
            const report = this.generateReport();
            
            await this.cleanup();
            
            // Exit with error code if any tests failed
            process.exit(report.failedTests > 0 ? 1 : 0);
            
        } catch (error) {
            this.log(`❌ Test execution failed: ${error.message}`, colors.red);
            await this.cleanup();
            process.exit(1);
        }
    }
}

// Main execution
if (require.main === module) {
    const test = new SimplifiedE2ETest();
    test.run().catch(console.error);
}

module.exports = SimplifiedE2ETest; 