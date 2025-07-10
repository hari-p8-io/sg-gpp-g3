const { Kafka } = require('kafkajs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const KAFKA_BROKERS = ['localhost:9092'];
const ORCHESTRATOR_URL = 'http://localhost:3004';
const ACCOUNTING_SERVICE_URL = 'http://localhost:8002';
const VAM_MEDIATION_SERVICE_URL = 'http://localhost:3005';

// Test message templates
const createTestMessage = (account, amount, messageType = 'PACS008') => ({
    messageId: uuidv4(),
    puid: `G3ITEST${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
    messageType,
    jsonPayload: {
        msgId: `SG${Date.now()}001`,
        cdtrAcct: account,
        amount: amount,
        currency: 'SGD'
    },
    enrichmentData: {
        messageData: {
            creditorAccount: account,
            amount: amount,
            currency: 'SGD',
            debtorAccount: 'DEBTOR123456'
        },
        physicalAcctInfo: {
            acctId: account,
            acctSys: account.includes('VAM') || account === '999888777' ? 'VAM' : 
                     account.includes('MDZ') ? 'MDZ' : 'STANDARD'
        }
    },
    validationResult: {
        isValid: true,
        warnings: []
    },
    validatedAt: new Date().toISOString(),
    sourceService: 'fast-validation-service'
});

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

class OrchestrationTester {
    constructor() {
        this.kafka = new Kafka({
            clientId: 'orchestration-tester',
            brokers: KAFKA_BROKERS
        });
        this.producer = null;
        this.testResults = [];
    }

    async initialize() {
        console.log(`${colors.cyan}🚀 Initializing Orchestration Tester...${colors.reset}`);
        
        try {
            // Check if all services are running
            await this.checkServiceHealth();
            
            // Initialize Kafka producer
            this.producer = this.kafka.producer();
            await this.producer.connect();
            
            console.log(`${colors.green}✅ Orchestration Tester initialized successfully${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Failed to initialize tester: ${error.message}${colors.reset}`);
            throw error;
        }
    }

    async checkServiceHealth() {
        console.log(`${colors.blue}🔍 Checking service health...${colors.reset}`);
        
        const services = [
            { name: 'Orchestrator', url: `${ORCHESTRATOR_URL}/health` },
            { name: 'Accounting Service', url: `${ACCOUNTING_SERVICE_URL}/health` },
            { name: 'VAM Mediation', url: `${VAM_MEDIATION_SERVICE_URL}/health` }
        ];

        for (const service of services) {
            try {
                const response = await axios.get(service.url, { timeout: 5000 });
                console.log(`${colors.green}✅ ${service.name}: ${response.data.status}${colors.reset}`);
            } catch (error) {
                console.log(`${colors.red}❌ ${service.name}: Not responding${colors.reset}`);
                throw new Error(`${service.name} is not available`);
            }
        }
    }

    async runOrchestrationTests() {
        console.log(`${colors.cyan}🎯 Running Orchestration Tests...${colors.reset}`);
        console.log('='.repeat(60));

        // Test 1: VAM Flow
        await this.testVAMFlow();
        
        // Test 2: MDZ Flow
        await this.testMDZFlow();
        
        // Test 3: Standard Flow
        await this.testStandardFlow();
        
        // Test 4: Multiple messages
        await this.testMultipleMessages();
        
        // Summary
        await this.printTestSummary();
    }

    async testVAMFlow() {
        console.log(`${colors.magenta}🏦 Testing VAM Flow...${colors.reset}`);
        
        const testMessage = createTestMessage('999888777666', '5000.00'); // Use the GROUPLIMIT VAM account
        
        try {
            // Send message to orchestrator
            await this.sendToOrchestrator(testMessage);
            
            // Wait for processing
            await this.waitForProcessing(3000);
            
            // Check orchestration status
            const orchestrationStatus = await this.getOrchestrationStatus(testMessage.messageId);
            
            // Check if VAM mediation was called
            const vamMessages = await this.getVAMMessages();
            
            // Check if accounting was called
            const accountingTransactions = await this.getAccountingTransactions();
            
            // Check if limit check messages were created for GROUPLIMIT VAM accounts
            const limitCheckMessages = await this.getLimitCheckMessages();
            
            const result = {
                testName: 'VAM Flow',
                messageId: testMessage.messageId,
                account: testMessage.jsonPayload.cdtrAcct,
                orchestrationStatus: orchestrationStatus?.status || 'unknown',
                vamProcessed: vamMessages.some(m => m.originalMessage?.messageId === testMessage.messageId),
                accountingProcessed: accountingTransactions.some(t => t.messageId === testMessage.messageId),
                limitCheckTriggered: limitCheckMessages.some(m => m.messageId === testMessage.messageId || m.originalMessageId === testMessage.messageId),
                success: orchestrationStatus?.status === 'completed'
            };
            
            this.testResults.push(result);
            this.printTestResult(result);
            
        } catch (error) {
            console.error(`${colors.red}❌ VAM Flow test failed: ${error.message}${colors.reset}`);
            this.testResults.push({
                testName: 'VAM Flow',
                messageId: testMessage.messageId,
                success: false,
                error: error.message
            });
        }
    }

    async testMDZFlow() {
        console.log(`${colors.magenta}🏭 Testing MDZ Flow...${colors.reset}`);
        
        const testMessage = createTestMessage('MDZ123456', '2000.00');
        
        try {
            // Send message to orchestrator
            await this.sendToOrchestrator(testMessage);
            
            // Wait for processing
            await this.waitForProcessing(2000);
            
            // Check orchestration status
            const orchestrationStatus = await this.getOrchestrationStatus(testMessage.messageId);
            
            // Check if accounting was called directly (skip VAM)
            const accountingTransactions = await this.getAccountingTransactions();
            
            const result = {
                testName: 'MDZ Flow',
                messageId: testMessage.messageId,
                account: testMessage.jsonPayload.cdtrAcct,
                orchestrationStatus: orchestrationStatus?.status || 'unknown',
                accountingProcessed: accountingTransactions.some(t => t.messageId === testMessage.messageId),
                skippedVAM: orchestrationStatus?.steps?.some(s => s.stepName === 'mdz_routing' && s.status === 'skipped_vam_mediation'),
                success: orchestrationStatus?.status === 'completed'
            };
            
            this.testResults.push(result);
            this.printTestResult(result);
            
        } catch (error) {
            console.error(`${colors.red}❌ MDZ Flow test failed: ${error.message}${colors.reset}`);
            this.testResults.push({
                testName: 'MDZ Flow',
                messageId: testMessage.messageId,
                success: false,
                error: error.message
            });
        }
    }

    async testStandardFlow() {
        console.log(`${colors.magenta}📝 Testing Standard Flow...${colors.reset}`);
        
        const testMessage = createTestMessage('STANDARD123', '1000.00');
        
        try {
            // Send message to orchestrator
            await this.sendToOrchestrator(testMessage);
            
            // Wait for processing
            await this.waitForProcessing(2000);
            
            // Check orchestration status
            const orchestrationStatus = await this.getOrchestrationStatus(testMessage.messageId);
            
            // Check if accounting was called
            const accountingTransactions = await this.getAccountingTransactions();
            
            const result = {
                testName: 'Standard Flow',
                messageId: testMessage.messageId,
                account: testMessage.jsonPayload.cdtrAcct,
                orchestrationStatus: orchestrationStatus?.status || 'unknown',
                accountingProcessed: accountingTransactions.some(t => t.messageId === testMessage.messageId),
                success: orchestrationStatus?.status === 'completed'
            };
            
            this.testResults.push(result);
            this.printTestResult(result);
            
        } catch (error) {
            console.error(`${colors.red}❌ Standard Flow test failed: ${error.message}${colors.reset}`);
            this.testResults.push({
                testName: 'Standard Flow',
                messageId: testMessage.messageId,
                success: false,
                error: error.message
            });
        }
    }

    async testMultipleMessages() {
        console.log(`${colors.magenta}🔄 Testing Multiple Messages...${colors.reset}`);
        
        const testMessages = [
            createTestMessage('VAMTEST123', '3000.00'),
            createTestMessage('VAM12345', '4000.00'),
            createTestMessage('MDZ789012', '2500.00')
        ];
        
        try {
            // Send all messages
            for (const message of testMessages) {
                await this.sendToOrchestrator(message);
                await this.waitForProcessing(500); // Small delay between messages
            }
            
            // Wait for all processing to complete
            await this.waitForProcessing(5000);
            
            // Check results
            let successCount = 0;
            for (const message of testMessages) {
                const orchestrationStatus = await this.getOrchestrationStatus(message.messageId);
                if (orchestrationStatus?.status === 'completed') {
                    successCount++;
                }
            }
            
            const result = {
                testName: 'Multiple Messages',
                totalMessages: testMessages.length,
                successfulMessages: successCount,
                success: successCount === testMessages.length
            };
            
            this.testResults.push(result);
            this.printTestResult(result);
            
        } catch (error) {
            console.error(`${colors.red}❌ Multiple Messages test failed: ${error.message}${colors.reset}`);
            this.testResults.push({
                testName: 'Multiple Messages',
                success: false,
                error: error.message
            });
        }
    }

    async sendToOrchestrator(message) {
        await this.producer.send({
            topic: 'validated-messages',
            messages: [{
                key: message.messageId,
                value: JSON.stringify(message),
                headers: {
                    'message-type': message.messageType,
                    'source': 'orchestration-tester'
                }
            }]
        });
        
        console.log(`${colors.blue}📤 Sent message to orchestrator: ${message.messageId}${colors.reset}`);
    }

    async waitForProcessing(ms) {
        console.log(`${colors.yellow}⏳ Waiting ${ms}ms for processing...${colors.reset}`);
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    async getOrchestrationStatus(messageId) {
        try {
            const response = await axios.get(`${ORCHESTRATOR_URL}/api/v1/orchestration/${messageId}`);
            return response.data.orchestration;
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get orchestration status for ${messageId}${colors.reset}`);
            return null;
        }
    }

    async getVAMMessages() {
        try {
            const response = await axios.get(`${VAM_MEDIATION_SERVICE_URL}/api/v1/messages`);
            return response.data.messages || [];
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get VAM messages${colors.reset}`);
            return [];
        }
    }

    async getAccountingTransactions() {
        try {
            const response = await axios.get(`${ACCOUNTING_SERVICE_URL}/api/v1/accounting/transactions`);
            return response.data.transactions || [];
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get accounting transactions${colors.reset}`);
            return [];
        }
    }

    async getLimitCheckMessages() {
        try {
            // Create a consumer to check limitcheck-messages topic
            const consumer = this.kafka.consumer({ groupId: 'orchestration-tester-limitcheck' });
            await consumer.connect();
            
            await consumer.subscribe({ topic: 'limitcheck-messages', fromBeginning: true });
            
            const messages = [];
            
            await consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const messageValue = JSON.parse(message.value.toString());
                        messages.push({
                            messageId: messageValue.messageId,
                            originalMessageId: messageValue.originalMessageId,
                            account: messageValue.account,
                            authMethod: messageValue.authMethod,
                            timestamp: messageValue.timestamp
                        });
                    } catch (error) {
                        console.warn(`${colors.yellow}⚠️ Could not parse limit check message${colors.reset}`);
                    }
                }
            });
            
            // Give it a moment to collect messages
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await consumer.disconnect();
            return messages;
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get limit check messages: ${error.message}${colors.reset}`);
            return [];
        }
    }

    printTestResult(result) {
        const status = result.success ? `${colors.green}✅ PASSED${colors.reset}` : `${colors.red}❌ FAILED${colors.reset}`;
        console.log(`   ${status} ${result.testName}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        
        // Show additional details for VAM flow test
        if (result.testName === 'VAM Flow' && result.account) {
            console.log(`   📊 Account: ${result.account}`);
            console.log(`   🔄 Orchestration Status: ${result.orchestrationStatus}`);
            console.log(`   🏦 VAM Processed: ${result.vamProcessed ? '✅' : '❌'}`);
            console.log(`   💰 Accounting Processed: ${result.accountingProcessed ? '✅' : '❌'}`);
            console.log(`   🔒 Limit Check Triggered: ${result.limitCheckTriggered ? '✅' : '❌'}`);
        }
        
        console.log();
    }

    async printTestSummary() {
        console.log('='.repeat(60));
        console.log(`${colors.cyan}📊 Test Summary${colors.reset}`);
        console.log('='.repeat(60));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`Total Tests: ${totalTests}`);
        console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
        console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
        console.log();
        
        if (failedTests > 0) {
            console.log(`${colors.red}Failed Tests:${colors.reset}`);
            this.testResults.filter(r => !r.success).forEach(result => {
                console.log(`- ${result.testName}: ${result.error || 'Unknown error'}`);
            });
        }
        
        console.log('='.repeat(60));
        
        // Print service status
        console.log(`${colors.cyan}📋 Service Status${colors.reset}`);
        try {
            const orchestratorStatus = await axios.get(`${ORCHESTRATOR_URL}/health`);
            console.log(`${colors.green}Orchestrator: ${orchestratorStatus.data.status}${colors.reset}`);
            console.log(`  - Processed Messages: ${orchestratorStatus.data.processedMessages}`);
            console.log(`  - Orchestration Status: ${orchestratorStatus.data.orchestrationStatus}`);
            console.log(`  - Pending VAM Responses: ${orchestratorStatus.data.pendingVAMResponses}`);
        } catch (error) {
            console.log(`${colors.red}Orchestrator: Error getting status${colors.reset}`);
        }
        
        console.log('='.repeat(60));
    }

    async cleanup() {
        console.log(`${colors.yellow}🧹 Cleaning up...${colors.reset}`);
        
        if (this.producer) {
            await this.producer.disconnect();
        }
        
        console.log(`${colors.green}✅ Cleanup complete${colors.reset}`);
    }
}

// Main execution
async function main() {
    const tester = new OrchestrationTester();
    
    try {
        await tester.initialize();
        await tester.runOrchestrationTests();
    } catch (error) {
        console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
    } finally {
        await tester.cleanup();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log(`${colors.yellow}🔄 Received SIGINT, shutting down...${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`${colors.yellow}🔄 Received SIGTERM, shutting down...${colors.reset}`);
    process.exit(0);
});

// Run the tests
main().catch(error => {
    console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
}); 