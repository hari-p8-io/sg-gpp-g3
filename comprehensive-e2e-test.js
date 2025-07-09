const { Kafka } = require('kafkajs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Test configuration
const CONFIG = {
    services: {
        requestHandler: { port: 50051, type: 'grpc' },
        enrichment: { port: 50052, type: 'grpc' },
        validation: { port: 50053, type: 'grpc' },
        orchestrator: { port: 3004, type: 'http' },
        vamMediation: { port: 3005, type: 'http' },
        accounting: { port: 8002, type: 'http' },
        limitCheck: { port: 3006, type: 'http' }
    },
    kafka: {
        brokers: ['localhost:9092'],
        topics: {
            validated: 'validated-messages',
            vamMessages: 'vam-messages',
            limitCheckMessages: 'limitcheck-messages',
            accountingMessages: 'accounting-messages'
        }
    }
};

// Test scenarios
const TEST_SCENARIOS = {
    // Scenario 1: GROUPLIMIT + VAM account
    grouplimitVAM: {
        name: 'GROUPLIMIT + VAM Account',
        account: '999888777',
        expectedAuthMethod: 'GROUPLIMIT',
        expectedAccountSystem: 'VAM',
        expectedFlow: 'Request Handler → Enrichment → Validation → Orchestrator → VAM Mediation → Accounting → Limit Check (Fire & Forget)',
        expectedKafkaMessages: ['validated-messages', 'vam-messages', 'limitcheck-messages']
    },
    
    // Scenario 2: GROUPLIMIT + MDZ account
    grouplimitMDZ: {
        name: 'GROUPLIMIT + MDZ Account',
        account: '999123456',
        expectedAuthMethod: 'GROUPLIMIT',
        expectedAccountSystem: 'MDZ',
        expectedFlow: 'Request Handler → Enrichment → Validation → Orchestrator → Accounting → Limit Check (Fire & Forget)',
        expectedKafkaMessages: ['validated-messages', 'limitcheck-messages']
    },
    
    // Scenario 3: AFPTHENLIMIT + MDZ account
    afpThenLimitMDZ: {
        name: 'AFPTHENLIMIT + MDZ Account',
        account: '888123456',
        expectedAuthMethod: 'AFPTHENLIMIT',
        expectedAccountSystem: 'MDZ',
        expectedFlow: 'Request Handler → Enrichment → Validation → Orchestrator → Accounting (No Limit Check)',
        expectedKafkaMessages: ['validated-messages']
    },
    
    // Scenario 4: AFPONLY + MDZ account
    afpOnlyMDZ: {
        name: 'AFPONLY + MDZ Account',
        account: '777123456',
        expectedAuthMethod: 'AFPONLY',
        expectedAccountSystem: 'MDZ',
        expectedFlow: 'Request Handler → Enrichment → Validation → Orchestrator → Accounting (No Limit Check)',
        expectedKafkaMessages: ['validated-messages']
    }
};

class ComprehensiveE2ETest {
    constructor() {
        this.testResults = [];
        this.clients = {};
        this.kafka = null;
        this.kafkaConsumer = null;
        this.messageTracker = new Map();
        this.startTime = Date.now();
    }

    log(message, color = colors.cyan) {
        const timestamp = new Date().toISOString();
        console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
    }

    async init() {
        this.log('🚀 Initializing Comprehensive End-to-End Test', colors.bright);
        
        // Initialize Kafka
        this.kafka = new Kafka({
            clientId: 'comprehensive-e2e-test',
            brokers: CONFIG.kafka.brokers
        });

        this.kafkaConsumer = this.kafka.consumer({ groupId: 'comprehensive-e2e-test-group' });
        
        // Initialize gRPC clients
        await this.initializeGrpcClients();
        
        // Setup Kafka listeners
        await this.setupKafkaListeners();
        
        this.log('✅ Initialization complete', colors.green);
    }

    async initializeGrpcClients() {
        this.log('📡 Initializing gRPC clients...');
        
        try {
            // Request Handler client
            const requestHandlerProto = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
            if (fs.existsSync(requestHandlerProto)) {
                const packageDefinition = protoLoader.loadSync(requestHandlerProto, {
                    keepCase: true,
                    longs: String,
                    enums: String,
                    defaults: true,
                    oneofs: true,
                });
                
                const pacsProto = grpc.loadPackageDefinition(packageDefinition);
                this.clients.requestHandler = new pacsProto.gpp.g3.requesthandler.PacsHandler(
                    `localhost:${CONFIG.services.requestHandler.port}`,
                    grpc.credentials.createInsecure()
                );
                
                this.log('✅ Request Handler gRPC client initialized');
            } else {
                this.log('⚠️  Request Handler proto file not found', colors.yellow);
            }
        } catch (error) {
            this.log(`❌ gRPC client initialization error: ${error.message}`, colors.red);
        }
    }

    async setupKafkaListeners() {
        this.log('🔄 Setting up Kafka listeners...');
        
        const topics = Object.values(CONFIG.kafka.topics);
        await this.kafkaConsumer.subscribe({ topics });
        
        await this.kafkaConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = JSON.parse(message.value.toString());
                    
                    this.log(`📥 Kafka message received on topic: ${topic}`);
                    this.log(`   Message ID: ${messageValue.messageId || messageValue.message_id || 'unknown'}`);
                    
                    // Track message flow
                    const messageId = messageValue.messageId || messageValue.message_id || messageValue.puid;
                    if (messageId && !this.messageTracker.has(messageId)) {
                        this.messageTracker.set(messageId, { stages: [] });
                    }
                    
                    if (messageId) {
                        this.messageTracker.get(messageId).stages.push({
                            stage: topic,
                            timestamp: Date.now(),
                            data: messageValue
                        });
                    }
                } catch (error) {
                    this.log(`❌ Error processing Kafka message: ${error.message}`, colors.red);
                }
            },
        });
        
        this.log('✅ Kafka listeners ready');
    }

    async checkServiceHealth() {
        this.log('🔍 Checking service health...');
        
        const healthResults = {};
        
        for (const [serviceName, config] of Object.entries(CONFIG.services)) {
            try {
                if (config.type === 'http') {
                    const response = await axios.get(`http://localhost:${config.port}/health`, { timeout: 5000 });
                    healthResults[serviceName] = response.status === 200;
                } else if (config.type === 'grpc') {
                    const net = require('net');
                    const socket = new net.Socket();
                    
                    const isConnected = await new Promise((resolve) => {
                        socket.setTimeout(3000);
                        socket.on('connect', () => {
                            socket.destroy();
                            resolve(true);
                        });
                        socket.on('timeout', () => {
                            socket.destroy();
                            resolve(false);
                        });
                        socket.on('error', () => {
                            socket.destroy();
                            resolve(false);
                        });
                        socket.connect(config.port, 'localhost');
                    });
                    
                    healthResults[serviceName] = isConnected;
                }
            } catch (error) {
                healthResults[serviceName] = false;
            }
        }
        
        for (const [serviceName, isHealthy] of Object.entries(healthResults)) {
            if (isHealthy) {
                this.log(`✅ ${serviceName} service: healthy`);
            } else {
                this.log(`❌ ${serviceName} service: unhealthy`, colors.red);
            }
        }
        
        return healthResults;
    }

    generatePacsMessage(account) {
        const messageId = `TEST-${Date.now()}`;
        const transactionId = `TXN-${uuidv4()}`;
        
        return {
            messageId,
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
        <TxId>${transactionId}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
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

    async sendToRequestHandler(testMessage) {
        this.log(`📤 Sending message to Request Handler: ${testMessage.messageId}`);
        
        try {
            const response = await new Promise((resolve, reject) => {
                this.clients.requestHandler.ProcessPacsMessage(testMessage, (error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            this.log(`✅ Request Handler response: ${response.status}`);
            return response;
        } catch (error) {
            this.log(`❌ Request Handler error: ${error.message}`, colors.red);
            throw error;
        }
    }

    async runScenario(scenarioName, scenario) {
        this.log(`\n🎯 Running Scenario: ${scenario.name}`, colors.bright);
        this.log(`   Expected Auth Method: ${scenario.expectedAuthMethod}`);
        this.log(`   Expected Account System: ${scenario.expectedAccountSystem}`);
        this.log(`   Expected Flow: ${scenario.expectedFlow}`);
        
        const testMessage = this.generatePacsMessage(scenario.account);
        const testResult = {
            scenario: scenarioName,
            name: scenario.name,
            messageId: testMessage.messageId,
            account: scenario.account,
            expectedAuthMethod: scenario.expectedAuthMethod,
            expectedAccountSystem: scenario.expectedAccountSystem,
            expectedFlow: scenario.expectedFlow,
            startTime: Date.now(),
            stages: [],
            success: false,
            error: null
        };
        
        try {
            // Clear message tracker for this test
            this.messageTracker.clear();
            
            // Send to request handler
            const response = await this.sendToRequestHandler(testMessage);
            testResult.stages.push({
                stage: 'Request Handler',
                timestamp: Date.now(),
                status: response.status,
                data: response
            });
            
            // Wait for message processing
            await this.waitForSeconds(10);
            
            // Check message tracking
            const messageFlow = this.messageTracker.get(testMessage.messageId);
            if (messageFlow) {
                testResult.stages.push(...messageFlow.stages);
            }
            
            // Check orchestrator status
            await this.checkOrchestratorStatus(testMessage.messageId, testResult);
            
            // Check VAM mediation (if applicable)
            if (scenario.expectedAccountSystem === 'VAM') {
                await this.checkVAMMediation(testMessage.messageId, testResult);
            }
            
            // Check accounting service
            await this.checkAccountingService(testMessage.messageId, testResult);
            
            // Check limit check service (if applicable)
            if (scenario.expectedAuthMethod === 'GROUPLIMIT') {
                await this.checkLimitCheckService(testMessage.messageId, testResult);
            }
            
            // Validate expected Kafka messages
            const actualKafkaTopics = testResult.stages
                .filter(stage => stage.stage.includes('-messages'))
                .map(stage => stage.stage);
            
            const expectedTopics = scenario.expectedKafkaMessages;
            const missingTopics = expectedTopics.filter(topic => !actualKafkaTopics.includes(topic));
            
            if (missingTopics.length === 0) {
                testResult.success = true;
                this.log(`✅ Scenario ${scenario.name} completed successfully`, colors.green);
            } else {
                testResult.success = false;
                testResult.error = `Missing Kafka topics: ${missingTopics.join(', ')}`;
                this.log(`❌ Scenario ${scenario.name} failed: ${testResult.error}`, colors.red);
            }
            
        } catch (error) {
            testResult.success = false;
            testResult.error = error.message;
            this.log(`❌ Scenario ${scenario.name} failed: ${error.message}`, colors.red);
        }
        
        testResult.endTime = Date.now();
        testResult.duration = testResult.endTime - testResult.startTime;
        
        this.testResults.push(testResult);
        
        return testResult;
    }

    async checkOrchestratorStatus(messageId, testResult) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.orchestrator.port}/api/v1/orchestration/${messageId}`, {
                timeout: 5000
            });
            
            testResult.stages.push({
                stage: 'Orchestrator',
                timestamp: Date.now(),
                status: response.status,
                data: response.data
            });
            
            this.log(`✅ Orchestrator check completed for ${messageId}`);
        } catch (error) {
            this.log(`⚠️  Orchestrator check failed for ${messageId}: ${error.message}`, colors.yellow);
        }
    }

    async checkVAMMediation(messageId, testResult) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.vamMediation.port}/api/v1/vam-messages`, {
                timeout: 5000
            });
            
            testResult.stages.push({
                stage: 'VAM Mediation',
                timestamp: Date.now(),
                status: response.status,
                data: response.data
            });
            
            this.log(`✅ VAM Mediation check completed for ${messageId}`);
        } catch (error) {
            this.log(`⚠️  VAM Mediation check failed for ${messageId}: ${error.message}`, colors.yellow);
        }
    }

    async checkAccountingService(messageId, testResult) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.accounting.port}/api/v1/accounting`, {
                timeout: 5000
            });
            
            testResult.stages.push({
                stage: 'Accounting',
                timestamp: Date.now(),
                status: response.status,
                data: response.data
            });
            
            this.log(`✅ Accounting service check completed for ${messageId}`);
        } catch (error) {
            this.log(`⚠️  Accounting service check failed for ${messageId}: ${error.message}`, colors.yellow);
        }
    }

    async checkLimitCheckService(messageId, testResult) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.limitCheck.port}/api/v1/limitchecks`, {
                timeout: 5000
            });
            
            testResult.stages.push({
                stage: 'Limit Check',
                timestamp: Date.now(),
                status: response.status,
                data: response.data
            });
            
            this.log(`✅ Limit Check service check completed for ${messageId}`);
        } catch (error) {
            this.log(`⚠️  Limit Check service check failed for ${messageId}: ${error.message}`, colors.yellow);
        }
    }

    async waitForSeconds(seconds) {
        this.log(`⏱️  Waiting ${seconds} seconds for message processing...`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async generateReport() {
        this.log('\n📊 Generating Test Report', colors.bright);
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(result => result.success).length;
        const failedTests = totalTests - passedTests;
        
        const report = {
            summary: {
                totalTests,
                passedTests,
                failedTests,
                successRate: totalTests > 0 ? (passedTests / totalTests * 100).toFixed(2) : 0,
                totalDuration: Date.now() - this.startTime
            },
            testResults: this.testResults
        };
        
        // Console output
        console.log('\n' + '='.repeat(80));
        console.log('📋 COMPREHENSIVE END-TO-END TEST REPORT');
        console.log('='.repeat(80));
        console.log(`📊 Total Tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`📈 Success Rate: ${report.summary.successRate}%`);
        console.log(`⏱️  Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
        console.log('='.repeat(80));
        
        this.testResults.forEach((result, index) => {
            const statusIcon = result.success ? '✅' : '❌';
            console.log(`${statusIcon} ${index + 1}. ${result.name}`);
            console.log(`   Account: ${result.account}`);
            console.log(`   Expected Auth Method: ${result.expectedAuthMethod}`);
            console.log(`   Expected Account System: ${result.expectedAccountSystem}`);
            console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
            console.log(`   Stages: ${result.stages.length}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            console.log('');
        });
        
        // Save report to file
        const reportPath = path.join(__dirname, 'test-results', `comprehensive-e2e-report-${Date.now()}.json`);
        
        // Create directory if it doesn't exist
        const dir = path.dirname(reportPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        this.log(`📄 Report saved to: ${reportPath}`);
        
        return report;
    }

    async cleanup() {
        this.log('🧹 Cleaning up test resources...');
        
        try {
            if (this.kafkaConsumer) {
                await this.kafkaConsumer.disconnect();
            }
            
            if (this.kafka) {
                // Close any other Kafka connections
            }
            
            this.log('✅ Cleanup completed');
        } catch (error) {
            this.log(`⚠️  Cleanup error: ${error.message}`, colors.yellow);
        }
    }

    async run() {
        try {
            await this.init();
            
            // Check service health first
            const healthResults = await this.checkServiceHealth();
            const unhealthyServices = Object.entries(healthResults)
                .filter(([_, isHealthy]) => !isHealthy)
                .map(([serviceName, _]) => serviceName);
            
            if (unhealthyServices.length > 0) {
                this.log(`❌ Cannot proceed with tests. Unhealthy services: ${unhealthyServices.join(', ')}`, colors.red);
                return;
            }
            
            // Run all scenarios
            for (const [scenarioName, scenario] of Object.entries(TEST_SCENARIOS)) {
                await this.runScenario(scenarioName, scenario);
                
                // Wait between scenarios
                await this.waitForSeconds(3);
            }
            
            // Generate report
            const report = await this.generateReport();
            
            // Cleanup
            await this.cleanup();
            
            // Exit with appropriate code
            process.exit(report.summary.failedTests > 0 ? 1 : 0);
            
        } catch (error) {
            this.log(`❌ Test execution failed: ${error.message}`, colors.red);
            await this.cleanup();
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    const test = new ComprehensiveE2ETest();
    await test.run();
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n🛑 Test interrupted by user');
    process.exit(130);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Test terminated');
    process.exit(143);
});

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ComprehensiveE2ETest; 