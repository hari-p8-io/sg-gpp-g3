const { Kafka } = require('kafkajs');
const axios = require('axios');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const CONFIG = {
    services: {
        requestHandler: { port: 50051, host: 'localhost' },
        orchestrator: { port: 3004, host: 'localhost' },
        vamMediation: { port: 3005, host: 'localhost' },
        accounting: { port: 8002, host: 'localhost' },
        limitCheck: { port: 3006, host: 'localhost' }
    },
    kafka: {
        brokers: ['localhost:9092'],
        consumerGroup: 'test-all-scenarios'
    },
    testTimeout: 30000 // 30 seconds
};

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

class AllScenariosTest {
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
        this.log('🚀 Initializing All Scenarios Test', colors.blue);
        
        // Initialize Kafka
        this.kafka = new Kafka({
            clientId: 'test-all-scenarios',
            brokers: CONFIG.kafka.brokers
        });

        this.consumer = this.kafka.consumer({ groupId: CONFIG.kafka.consumerGroup });
        await this.setupKafkaConsumer();

        // Initialize gRPC client
        await this.initGrpcClient();

        this.log('✅ Initialization complete', colors.green);
    }

    async setupKafkaConsumer() {
        const topics = ['validated-messages', 'vam-messages', 'limitcheck-messages'];
        
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
                `${CONFIG.services.requestHandler.host}:${CONFIG.services.requestHandler.port}`,
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
            { name: 'Request Handler', url: `http://${CONFIG.services.requestHandler.host}:3001/health` },
            { name: 'Orchestrator', url: `http://${CONFIG.services.orchestrator.host}:${CONFIG.services.orchestrator.port}/health` },
            { name: 'VAM Mediation', url: `http://${CONFIG.services.vamMediation.host}:${CONFIG.services.vamMediation.port}/health` },
            { name: 'Accounting', url: `http://${CONFIG.services.accounting.host}:${CONFIG.services.accounting.port}/health` },
            { name: 'Limit Check', url: `http://${CONFIG.services.limitCheck.host}:${CONFIG.services.limitCheck.port}/health` }
        ];
        
        const results = await Promise.allSettled(
            healthChecks.map(async (check) => {
                try {
                    const response = await axios.get(check.url, { timeout: 5000 });
                    return { name: check.name, healthy: response.status === 200 };
                } catch (error) {
                    return { name: check.name, healthy: false, error: error.message };
                }
            })
        );
        
        const healthyServices = [];
        const unhealthyServices = [];
        
        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                if (result.value.healthy) {
                    healthyServices.push(result.value.name);
                    this.log(`✅ ${result.value.name}: healthy`, colors.green);
                } else {
                    unhealthyServices.push(result.value.name);
                    this.log(`❌ ${result.value.name}: unhealthy`, colors.red);
                }
            } else {
                unhealthyServices.push('Unknown');
                this.log(`❌ Health check failed: ${result.reason}`, colors.red);
            }
        });
        
        if (unhealthyServices.length > 0) {
            throw new Error(`Unhealthy services: ${unhealthyServices.join(', ')}`);
        }
        
        this.log('✅ All services are healthy', colors.green);
    }

    generateTestMessage(account, amount = 1000) {
        const messageId = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return {
            messageId,
            messageType: 'PACS008',
            xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>
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
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>SENDER123</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${account}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`
        };
    }

    async sendMessage(testMessage) {
        this.log(`📤 Sending message ${testMessage.messageId}`, colors.blue);
        
        return new Promise((resolve, reject) => {
            this.grpcClient.ProcessPacsMessage(testMessage, (error, response) => {
                if (error) {
                    this.log(`❌ gRPC error: ${error.message}`, colors.red);
                    reject(error);
                } else {
                    this.log(`✅ gRPC response: ${response.status}`, colors.green);
                    resolve(response);
                }
            });
        });
    }

    async waitForProcessing(messageId, expectedStages, timeoutMs = CONFIG.testTimeout) {
        this.log(`⏳ Waiting for message processing: ${messageId}`, colors.yellow);
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            const tracker = this.messageTracker.get(messageId);
            
            if (tracker && tracker.stages.length >= expectedStages.length) {
                const stageTopics = tracker.stages.map(s => s.topic);
                const hasAllStages = expectedStages.every(stage => stageTopics.includes(stage));
                
                if (hasAllStages) {
                    this.log(`✅ All expected stages reached for ${messageId}`, colors.green);
                    return tracker;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const tracker = this.messageTracker.get(messageId);
        const actualStages = tracker ? tracker.stages.map(s => s.topic) : [];
        
        this.log(`⏰ Timeout waiting for ${messageId}. Expected: ${expectedStages.join(', ')}, Got: ${actualStages.join(', ')}`, colors.yellow);
        return tracker;
    }

    async checkEndpointStatus(messageId, serviceName, endpoint) {
        try {
            const response = await axios.get(endpoint, { timeout: 5000 });
            this.log(`✅ ${serviceName} endpoint check: ${response.status}`, colors.green);
            return { success: true, data: response.data };
        } catch (error) {
            this.log(`❌ ${serviceName} endpoint check failed: ${error.message}`, colors.red);
            return { success: false, error: error.message };
        }
    }

    async runScenario(scenarioName, account, expectedStages, description) {
        this.log(`\n🎯 Running Scenario: ${scenarioName}`, colors.magenta);
        this.log(`   Account: ${account}`, colors.cyan);
        this.log(`   Description: ${description}`, colors.cyan);
        this.log(`   Expected Stages: ${expectedStages.join(' → ')}`, colors.cyan);
        
        const testMessage = this.generateTestMessage(account);
        const startTime = Date.now();
        
        // Clear previous tracking
        this.messageTracker.delete(testMessage.messageId);
        
        const testResult = {
            scenario: scenarioName,
            messageId: testMessage.messageId,
            account,
            description,
            expectedStages,
            startTime,
            success: false,
            actualStages: [],
            endpointChecks: {},
            error: null
        };
        
        try {
            // Send message
            const response = await this.sendMessage(testMessage);
            testResult.grpcResponse = response;
            
            // Wait for processing
            const tracker = await this.waitForProcessing(testMessage.messageId, expectedStages);
            
            if (tracker) {
                testResult.actualStages = tracker.stages.map(s => s.topic);
                testResult.kafkaMessages = tracker.stages;
            }
            
            // Check endpoints
            const endpointChecks = [
                { name: 'Orchestrator', url: `http://${CONFIG.services.orchestrator.host}:${CONFIG.services.orchestrator.port}/api/v1/orchestration/${testMessage.messageId}` },
                { name: 'Accounting', url: `http://${CONFIG.services.accounting.host}:${CONFIG.services.accounting.port}/api/v1/accounting` }
            ];
            
            // Add VAM mediation check for VAM accounts
            if (account.includes('VAM') || account.startsWith('999')) {
                endpointChecks.push({ name: 'VAM Mediation', url: `http://${CONFIG.services.vamMediation.host}:${CONFIG.services.vamMediation.port}/api/v1/vam-messages` });
            }
            
            // Add limit check for GROUPLIMIT scenarios
            if (account.startsWith('999') || account.includes('VAM')) {
                endpointChecks.push({ name: 'Limit Check', url: `http://${CONFIG.services.limitCheck.host}:${CONFIG.services.limitCheck.port}/api/v1/limitchecks` });
            }
            
            for (const check of endpointChecks) {
                testResult.endpointChecks[check.name] = await this.checkEndpointStatus(testMessage.messageId, check.name, check.url);
            }
            
            // Evaluate success
            const hasAllExpectedStages = expectedStages.every(stage => testResult.actualStages.includes(stage));
            const endpointFailures = Object.entries(testResult.endpointChecks)
                .filter(([_, result]) => !result.success)
                .map(([name, _]) => name);
            
            if (hasAllExpectedStages && endpointFailures.length === 0) {
                testResult.success = true;
                this.log(`✅ Scenario ${scenarioName} PASSED`, colors.green);
            } else {
                testResult.success = false;
                
                const issues = [];
                if (!hasAllExpectedStages) {
                    const missingStages = expectedStages.filter(stage => !testResult.actualStages.includes(stage));
                    issues.push(`Missing stages: ${missingStages.join(', ')}`);
                }
                if (endpointFailures.length > 0) {
                    issues.push(`Endpoint failures: ${endpointFailures.join(', ')}`);
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
        this.log('\n🧪 Running All Test Scenarios', colors.magenta);
        
        const scenarios = [
            {
                name: 'GROUPLIMIT + VAM Account',
                account: '999888777',
                expectedStages: ['validated-messages', 'vam-messages', 'limitcheck-messages'],
                description: 'VAM account with GROUPLIMIT auth → VAM Mediation → Accounting → Limit Check'
            },
            {
                name: 'GROUPLIMIT + VAM Test Account',
                account: 'VAMTEST123',
                expectedStages: ['validated-messages', 'vam-messages', 'limitcheck-messages'],
                description: 'VAM test account with GROUPLIMIT auth → VAM Mediation → Accounting → Limit Check'
            },
            {
                name: 'GROUPLIMIT + MDZ Account',
                account: '999123456',
                expectedStages: ['validated-messages', 'limitcheck-messages'],
                description: 'MDZ account with GROUPLIMIT auth → Accounting → Limit Check'
            },
            {
                name: 'AFPTHENLIMIT + MDZ Account',
                account: '888123456',
                expectedStages: ['validated-messages'],
                description: 'MDZ account with AFPTHENLIMIT auth → Accounting (no limit check)'
            },
            {
                name: 'AFPONLY + MDZ Account',
                account: '777123456',
                expectedStages: ['validated-messages'],
                description: 'MDZ account with AFPONLY auth → Accounting (no limit check)'
            }
        ];
        
        for (const scenario of scenarios) {
            await this.runScenario(scenario.name, scenario.account, scenario.expectedStages, scenario.description);
        }
    }

    generateReport() {
        this.log('\n📊 Test Report', colors.magenta);
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        
        console.log('='.repeat(80));
        console.log(`📋 ALL SCENARIOS TEST REPORT`);
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
            console.log(`   Expected: ${result.expectedStages.join(' → ')}`);
            console.log(`   Actual: ${result.actualStages.join(' → ')}`);
            console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
            
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
            await this.checkServiceHealth();
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
    const test = new AllScenariosTest();
    test.run().catch(console.error);
}

module.exports = AllScenariosTest; 