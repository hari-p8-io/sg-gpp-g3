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
        accounting: { port: 8002, type: 'http' }
    },
    kafka: {
        brokers: ['localhost:9092'],
        topics: {
            validated: 'validated-messages',
            vamMessages: 'vam-messages',
            vamResponses: 'vam-responses'
        }
    }
};

// Test message templates
const SINGAPORE_PACS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG202501080001</MsgId>
      <CreDtTm>2025-01-08T10:00:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>COVE</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>TXN202501080001</TxId>
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
            <Id>PLACEHOLDER_ACCOUNT</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

class CompleteE2ETest {
    constructor() {
        this.testResults = [];
        this.clients = {};
        this.kafka = null;
        this.kafkaConsumer = null;
        this.messageTracker = new Map();
    }

    log(message, color = colors.cyan) {
        console.log(`${color}${message}${colors.reset}`);
    }

    async init() {
        this.log('🚀 Initializing Complete End-to-End Test', colors.bright);
        
        // Initialize Kafka
        this.kafka = new Kafka({
            clientId: 'e2e-test-client',
            brokers: CONFIG.kafka.brokers
        });

        this.kafkaConsumer = this.kafka.consumer({ groupId: 'e2e-test-group' });
        
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
            }
        } catch (error) {
            this.log(`⚠️  gRPC client initialization error: ${error.message}`, colors.yellow);
        }
    }

    async setupKafkaListeners() {
        this.log('🔄 Setting up Kafka listeners...');
        
        await this.kafkaConsumer.subscribe({ topics: [CONFIG.kafka.topics.vamMessages, CONFIG.kafka.topics.vamResponses] });
        
        await this.kafkaConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const messageValue = JSON.parse(message.value.toString());
                
                this.log(`📥 Kafka message received on topic: ${topic}`);
                this.log(`   Message ID: ${messageValue.messageId || messageValue.message_id}`);
                
                // Track message flow
                const messageId = messageValue.messageId || messageValue.message_id;
                if (!this.messageTracker.has(messageId)) {
                    this.messageTracker.set(messageId, { stages: [] });
                }
                
                this.messageTracker.get(messageId).stages.push({
                    stage: topic,
                    timestamp: Date.now(),
                    data: messageValue
                });
            },
        });
    }

    async checkServiceHealth() {
        this.log('🔍 Checking service health...');
        
        const healthChecks = [];
        
        for (const [serviceName, config] of Object.entries(CONFIG.services)) {
            if (config.type === 'http') {
                healthChecks.push(this.checkHttpHealth(serviceName, config.port));
            } else if (config.type === 'grpc') {
                healthChecks.push(this.checkGrpcHealth(serviceName, config.port));
            }
        }
        
        const results = await Promise.allSettled(healthChecks);
        
        for (let i = 0; i < results.length; i++) {
            const serviceName = Object.keys(CONFIG.services)[i];
            const result = results[i];
            
            if (result.status === 'fulfilled' && result.value) {
                this.log(`✅ ${serviceName} service: healthy`);
            } else {
                this.log(`❌ ${serviceName} service: unhealthy`, colors.red);
            }
        }
    }

    async checkHttpHealth(serviceName, port) {
        try {
            const response = await axios.get(`http://localhost:${port}/health`, { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    async checkGrpcHealth(serviceName, port) {
        try {
            const net = require('net');
            return new Promise((resolve) => {
                const socket = new net.Socket();
                socket.setTimeout(2000);
                socket.on('connect', () => {
                    socket.destroy();
                    resolve(true);
                });
                socket.on('timeout', () => {
                    socket.destroy();
                    resolve(false);
                });
                socket.on('error', () => {
                    resolve(false);
                });
                socket.connect(port, 'localhost');
            });
        } catch (error) {
            return false;
        }
    }

    async runVAMFlowTest() {
        this.log('🏦 Running VAM Flow Test...', colors.blue);
        
        const testMessage = {
            messageId: uuidv4(),
            puid: `G3ITEST${Date.now()}`,
            account: '999888777', // VAM account
            amount: '1000.00',
            messageType: 'PACS008'
        };
        
        const result = await this.runFullFlow(testMessage, 'VAM');
        this.testResults.push({
            testName: 'VAM Flow Test',
            account: testMessage.account,
            result: result
        });
        
        return result;
    }

    async runMDZFlowTest() {
        this.log('🏛️ Running MDZ Flow Test...', colors.blue);
        
        const testMessage = {
            messageId: uuidv4(),
            puid: `G3ITEST${Date.now()}`,
            account: 'MDZ123456', // MDZ account
            amount: '500.00',
            messageType: 'PACS008'
        };
        
        const result = await this.runFullFlow(testMessage, 'MDZ');
        this.testResults.push({
            testName: 'MDZ Flow Test',
            account: testMessage.account,
            result: result
        });
        
        return result;
    }

    async runFullFlow(testMessage, expectedFlow) {
        this.log(`📨 Starting ${expectedFlow} flow for account: ${testMessage.account}`);
        
        const startTime = Date.now();
        
        try {
            // Step 1: Inject message through request handler
            const xmlPayload = SINGAPORE_PACS_XML.replace('PLACEHOLDER_ACCOUNT', testMessage.account);
            
            let requestHandlerResponse;
            if (this.clients.requestHandler) {
                this.log('  🔄 Sending to Request Handler...');
                requestHandlerResponse = await this.sendToRequestHandler(testMessage, xmlPayload);
                this.log(`  ✅ Request Handler response: ${requestHandlerResponse.success ? 'SUCCESS' : 'FAILED'}`);
            } else {
                this.log('  ⚠️  Request Handler gRPC client not available, simulating...', colors.yellow);
                requestHandlerResponse = { success: true, messageId: testMessage.messageId, puid: testMessage.puid };
            }
            
            if (!requestHandlerResponse.success) {
                return { success: false, stage: 'RequestHandler', error: 'Request handler failed' };
            }
            
            // Step 2: Wait for message to flow through pipeline
            this.log('  ⏳ Waiting for message to flow through pipeline...');
            await this.waitForSeconds(5);
            
            // Step 3: Check if message reached orchestrator
            this.log('  🔍 Checking orchestrator received message...');
            const orchestratorStatus = await this.checkOrchestratorStatus(testMessage.messageId);
            
            if (!orchestratorStatus.success) {
                return { success: false, stage: 'Orchestrator', error: 'Message not found in orchestrator' };
            }
            
            // Step 4: Wait for orchestration to complete
            this.log('  ⏳ Waiting for orchestration to complete...');
            await this.waitForSeconds(3);
            
            // Step 5: Check VAM mediation (for VAM flow only)
            let vamMediationStatus = { success: true, skipped: true };
            if (expectedFlow === 'VAM') {
                this.log('  🏦 Checking VAM mediation service...');
                vamMediationStatus = await this.checkVAMMediation(testMessage.messageId);
                
                if (!vamMediationStatus.success) {
                    return { success: false, stage: 'VAM Mediation', error: 'VAM mediation failed' };
                }
            }
            
            // Step 6: Check accounting service
            this.log('  💰 Checking accounting service...');
            const accountingStatus = await this.checkAccountingService(testMessage.messageId);
            
            if (!accountingStatus.success) {
                return { success: false, stage: 'Accounting', error: 'Accounting service not reached' };
            }
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            this.log(`  🎉 ${expectedFlow} flow completed successfully in ${processingTime}ms`, colors.green);
            
            return {
                success: true,
                processingTime,
                stages: {
                    requestHandler: requestHandlerResponse.success,
                    orchestrator: orchestratorStatus.success,
                    vamMediation: vamMediationStatus.success,
                    accounting: accountingStatus.success
                },
                messageId: testMessage.messageId,
                flow: expectedFlow
            };
            
        } catch (error) {
            this.log(`  ❌ ${expectedFlow} flow failed: ${error.message}`, colors.red);
            return { success: false, error: error.message };
        }
    }

    async sendToRequestHandler(testMessage, xmlPayload) {
        try {
            const request = {
                message_type: testMessage.messageType,
                xml_payload: xmlPayload,
                metadata: {
                    source: 'complete-e2e-test',
                    country: 'SG',
                    currency: 'SGD',
                    test_account: testMessage.account
                }
            };

            const response = await new Promise((resolve, reject) => {
                this.clients.requestHandler.ProcessPacsMessage(request, (error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
            });

            return {
                success: response.success,
                messageId: response.message_id,
                puid: response.puid,
                processingTime: response.processing_time_ms
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkOrchestratorStatus(messageId) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.orchestrator.port}/api/v1/messages`, {
                timeout: 5000
            });
            
            const messages = response.data.messages || response.data || [];
            const message = messages.find(msg => msg.messageId === messageId || msg.message_id === messageId);
            
            return {
                success: !!message,
                message: message,
                totalMessages: messages.length
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkVAMMediation(messageId) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.vamMediation.port}/api/v1/messages`, {
                timeout: 5000
            });
            
            const messages = response.data.messages || response.data || [];
            const message = messages.find(msg => msg.messageId === messageId || msg.message_id === messageId);
            
            return {
                success: !!message,
                message: message,
                totalMessages: messages.length
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkAccountingService(messageId) {
        try {
            const response = await axios.get(`http://localhost:${CONFIG.services.accounting.port}/api/v1/accounting/transactions`, {
                timeout: 5000
            });
            
            const transactions = response.data.transactions || response.data || [];
            const transaction = transactions.find(tx => tx.messageId === messageId || tx.message_id === messageId);
            
            return {
                success: !!transaction,
                transaction: transaction,
                totalTransactions: transactions.length
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async waitForSeconds(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async generateReport() {
        this.log('📊 Generating Test Report...', colors.magenta);
        
        const successCount = this.testResults.filter(r => r.result.success).length;
        const totalCount = this.testResults.length;
        const successRate = totalCount > 0 ? (successCount / totalCount * 100).toFixed(1) : 0;
        
        console.log('\n' + '='.repeat(80));
        console.log(`${colors.bright}📋 COMPLETE END-TO-END TEST REPORT${colors.reset}`);
        console.log('='.repeat(80));
        
        console.log(`\n${colors.cyan}📊 Summary:${colors.reset}`);
        console.log(`  • Total Tests: ${totalCount}`);
        console.log(`  • Passed: ${colors.green}${successCount}${colors.reset}`);
        console.log(`  • Failed: ${colors.red}${totalCount - successCount}${colors.reset}`);
        console.log(`  • Success Rate: ${successRate >= 80 ? colors.green : colors.red}${successRate}%${colors.reset}`);
        
        console.log(`\n${colors.cyan}🔍 Detailed Results:${colors.reset}`);
        
        for (const result of this.testResults) {
            const status = result.result.success ? `${colors.green}✅ PASSED${colors.reset}` : `${colors.red}❌ FAILED${colors.reset}`;
            console.log(`\n  ${status} ${result.testName}`);
            console.log(`    Account: ${result.account}`);
            
            if (result.result.success) {
                console.log(`    Processing Time: ${result.result.processingTime}ms`);
                console.log(`    Flow: ${result.result.flow}`);
                console.log(`    Stages:`);
                if (result.result.stages) {
                    for (const [stage, success] of Object.entries(result.result.stages)) {
                        const stageStatus = success ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
                        console.log(`      ${stageStatus} ${stage}`);
                    }
                }
            } else {
                console.log(`    Failed Stage: ${result.result.stage || 'Unknown'}`);
                console.log(`    Error: ${result.result.error || 'Unknown error'}`);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        
        return {
            totalTests: totalCount,
            passedTests: successCount,
            failedTests: totalCount - successCount,
            successRate: parseFloat(successRate),
            results: this.testResults
        };
    }

    async cleanup() {
        this.log('🧹 Cleaning up test resources...');
        
        try {
            if (this.kafkaConsumer) {
                await this.kafkaConsumer.disconnect();
            }
            
            if (this.clients.requestHandler) {
                this.clients.requestHandler.close();
            }
            
            this.log('✅ Cleanup completed', colors.green);
        } catch (error) {
            this.log(`⚠️  Cleanup error: ${error.message}`, colors.yellow);
        }
    }

    async run() {
        try {
            await this.init();
            await this.checkServiceHealth();
            
            // Run tests
            await this.runVAMFlowTest();
            await this.runMDZFlowTest();
            
            // Generate report
            const report = await this.generateReport();
            
            // Return success if all tests passed
            return report.successRate === 100;
            
        } catch (error) {
            this.log(`❌ Test execution failed: ${error.message}`, colors.red);
            return false;
        } finally {
            await this.cleanup();
        }
    }
}

// Main execution
async function main() {
    const test = new CompleteE2ETest();
    const success = await test.run();
    
    console.log(`\n${colors.bright}🎯 Test Result: ${success ? `${colors.green}ALL TESTS PASSED` : `${colors.red}SOME TESTS FAILED`}${colors.reset}`);
    
    process.exit(success ? 0 : 1);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = CompleteE2ETest; 