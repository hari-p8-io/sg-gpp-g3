const { Kafka } = require('kafkajs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const KAFKA_BROKERS = ['localhost:9092'];
const ORCHESTRATOR_URL = 'http://localhost:3004';
const ACCOUNTING_SERVICE_URL = 'http://localhost:8002';
const VAM_MEDIATION_SERVICE_URL = 'http://localhost:3005';

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

class VAMMDZFlowTester {
    constructor() {
        this.kafka = new Kafka({
            clientId: 'vam-mdz-flow-tester',
            brokers: KAFKA_BROKERS
        });
        this.producer = this.kafka.producer();
        this.vamConsumer = this.kafka.consumer({ groupId: 'vam-test-group' });
        this.testResults = [];
        this.isConnected = false;
    }

    async initialize() {
        console.log(`${colors.cyan}🚀 Initializing VAM/MDZ Flow Tester...${colors.reset}`);
        
        try {
            await this.producer.connect();
            await this.vamConsumer.connect();
            await this.vamConsumer.subscribe({ topic: 'vam-messages', fromBeginning: false });
            this.isConnected = true;
            console.log(`${colors.green}✅ Kafka connections established${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Failed to initialize Kafka connections: ${error.message}${colors.reset}`);
            throw error;
        }
    }

    async cleanup() {
        if (this.isConnected) {
            await this.producer.disconnect();
            await this.vamConsumer.disconnect();
            console.log(`${colors.cyan}🧹 Kafka connections closed${colors.reset}`);
        }
    }

    async waitForProcessing(ms = 2000) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendToValidatedTopic(message) {
        try {
            await this.producer.send({
                topic: 'validated-messages',
                messages: [
                    {
                        key: message.messageId,
                        value: JSON.stringify(message),
                        headers: {
                            'message-type': message.messageType,
                            'puid': message.puid
                        }
                    }
                ]
            });
            console.log(`${colors.blue}📤 Sent message to validated-messages topic: ${message.messageId}${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Failed to send message to validated-messages topic: ${error.message}${colors.reset}`);
            throw error;
        }
    }

    async checkVAMMessages() {
        return new Promise((resolve) => {
            const messages = [];
            const timeout = setTimeout(() => {
                resolve(messages);
            }, 5000);

            this.vamConsumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    const messageValue = message.value.toString();
                    const parsedMessage = JSON.parse(messageValue);
                    messages.push(parsedMessage);
                    console.log(`${colors.magenta}📥 Received VAM message: ${parsedMessage.messageId}${colors.reset}`);
                    
                    if (messages.length >= 1) {
                        clearTimeout(timeout);
                        resolve(messages);
                    }
                }
            }).catch(error => {
                console.error(`${colors.red}❌ VAM consumer error: ${error.message}${colors.reset}`);
                clearTimeout(timeout);
                resolve(messages);
            });
        });
    }

    async getOrchestrationStatus(messageId) {
        try {
            const response = await axios.get(`${ORCHESTRATOR_URL}/api/v1/orchestration/${messageId}`);
            return response.data;
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get orchestration status for ${messageId}: ${error.message}${colors.reset}`);
            return null;
        }
    }

    async getAccountingTransactions() {
        try {
            const response = await axios.get(`${ACCOUNTING_SERVICE_URL}/api/v1/accounting/transactions`);
            return response.data.transactions || [];
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get accounting transactions: ${error.message}${colors.reset}`);
            return [];
        }
    }

    async getVAMMessages() {
        try {
            const response = await axios.get(`${VAM_MEDIATION_SERVICE_URL}/api/v1/messages`);
            return response.data.messages || [];
        } catch (error) {
            console.warn(`${colors.yellow}⚠️ Could not get VAM messages: ${error.message}${colors.reset}`);
            return [];
        }
    }

    async testVAMFlow() {
        console.log(`${colors.cyan}\n🏦 Testing VAM Flow...${colors.reset}`);
        console.log(`${colors.blue}Expected: Message → VAM Mediation → Accounting Service${colors.reset}`);
        
        const testMessage = createTestMessage('999888777', '1000.00');
        
        try {
            // Clear existing transactions
            await this.clearAccountingTransactions();
            await this.clearVAMMessages();
            
            // Send message to validated-messages topic
            await this.sendToValidatedTopic(testMessage);
            
            // Wait for VAM processing
            console.log(`${colors.blue}⏳ Waiting for VAM processing...${colors.reset}`);
            await this.waitForProcessing(3000);
            
            // Check VAM messages
            const vamMessages = await this.getVAMMessages();
            
            // Wait for accounting processing
            console.log(`${colors.blue}⏳ Waiting for accounting processing...${colors.reset}`);
            await this.waitForProcessing(3000);
            
            // Check accounting transactions
            const accountingTransactions = await this.getAccountingTransactions();
            
            // Check orchestration status
            const orchestrationStatus = await this.getOrchestrationStatus(testMessage.messageId);
            
            const result = {
                testName: 'VAM Flow',
                messageId: testMessage.messageId,
                account: testMessage.jsonPayload.cdtrAcct,
                flow: 'VAM → Accounting',
                vamProcessed: vamMessages.some(m => m.messageId === testMessage.messageId || m.originalMessage?.messageId === testMessage.messageId),
                accountingProcessed: accountingTransactions.some(t => t.messageId === testMessage.messageId),
                orchestrationStatus: orchestrationStatus?.status || 'unknown',
                orchestrationSteps: orchestrationStatus?.steps?.map(s => `${s.stepName}: ${s.status}`) || [],
                success: vamMessages.length > 0 && accountingTransactions.length > 0
            };
            
            this.testResults.push(result);
            this.printTestResult(result);
            
            return result;
            
        } catch (error) {
            console.error(`${colors.red}❌ VAM Flow test failed: ${error.message}${colors.reset}`);
            const result = {
                testName: 'VAM Flow',
                messageId: testMessage.messageId,
                success: false,
                error: error.message
            };
            this.testResults.push(result);
            return result;
        }
    }

    async testMDZFlow() {
        console.log(`${colors.cyan}\n🏭 Testing MDZ Flow...${colors.reset}`);
        console.log(`${colors.blue}Expected: Message → Accounting Service (Skip VAM)${colors.reset}`);
        
        const testMessage = createTestMessage('MDZ123456', '500.00');
        
        try {
            // Clear existing transactions
            await this.clearAccountingTransactions();
            await this.clearVAMMessages();
            
            // Send message to validated-messages topic
            await this.sendToValidatedTopic(testMessage);
            
            // Wait for processing
            console.log(`${colors.blue}⏳ Waiting for MDZ processing...${colors.reset}`);
            await this.waitForProcessing(3000);
            
            // Check VAM messages (should be none)
            const vamMessages = await this.getVAMMessages();
            
            // Check accounting transactions
            const accountingTransactions = await this.getAccountingTransactions();
            
            // Check orchestration status
            const orchestrationStatus = await this.getOrchestrationStatus(testMessage.messageId);
            
            const result = {
                testName: 'MDZ Flow',
                messageId: testMessage.messageId,
                account: testMessage.jsonPayload.cdtrAcct,
                flow: 'Direct → Accounting',
                vamSkipped: vamMessages.length === 0,
                accountingProcessed: accountingTransactions.some(t => t.messageId === testMessage.messageId),
                orchestrationStatus: orchestrationStatus?.status || 'unknown',
                orchestrationSteps: orchestrationStatus?.steps?.map(s => `${s.stepName}: ${s.status}`) || [],
                success: vamMessages.length === 0 && accountingTransactions.length > 0
            };
            
            this.testResults.push(result);
            this.printTestResult(result);
            
            return result;
            
        } catch (error) {
            console.error(`${colors.red}❌ MDZ Flow test failed: ${error.message}${colors.reset}`);
            const result = {
                testName: 'MDZ Flow',
                messageId: testMessage.messageId,
                success: false,
                error: error.message
            };
            this.testResults.push(result);
            return result;
        }
    }

    async clearAccountingTransactions() {
        try {
            await axios.delete(`${ACCOUNTING_SERVICE_URL}/api/v1/accounting/transactions`);
        } catch (error) {
            // Ignore errors - service might not support clearing
        }
    }

    async clearVAMMessages() {
        try {
            await axios.delete(`${VAM_MEDIATION_SERVICE_URL}/api/v1/messages`);
        } catch (error) {
            // Ignore errors - service might not support clearing
        }
    }

    printTestResult(result) {
        console.log(`${colors.bright}\n📊 Test Result: ${result.testName}${colors.reset}`);
        console.log(`${colors.cyan}Message ID: ${result.messageId}${colors.reset}`);
        console.log(`${colors.cyan}Account: ${result.account}${colors.reset}`);
        console.log(`${colors.cyan}Flow: ${result.flow || 'N/A'}${colors.reset}`);
        
        if (result.vamProcessed !== undefined) {
            console.log(`${colors.blue}VAM Processed: ${result.vamProcessed ? '✅' : '❌'}${colors.reset}`);
        }
        
        if (result.vamSkipped !== undefined) {
            console.log(`${colors.blue}VAM Skipped: ${result.vamSkipped ? '✅' : '❌'}${colors.reset}`);
        }
        
        if (result.accountingProcessed !== undefined) {
            console.log(`${colors.blue}Accounting Processed: ${result.accountingProcessed ? '✅' : '❌'}${colors.reset}`);
        }
        
        console.log(`${colors.blue}Orchestration Status: ${result.orchestrationStatus}${colors.reset}`);
        
        if (result.orchestrationSteps && result.orchestrationSteps.length > 0) {
            console.log(`${colors.blue}Orchestration Steps:${colors.reset}`);
            result.orchestrationSteps.forEach(step => {
                console.log(`  - ${step}`);
            });
        }
        
        const status = result.success ? `${colors.green}✅ PASSED${colors.reset}` : `${colors.red}❌ FAILED${colors.reset}`;
        console.log(`${colors.bright}Status: ${status}${colors.reset}`);
        
        if (result.error) {
            console.log(`${colors.red}Error: ${result.error}${colors.reset}`);
        }
    }

    async checkServicesHealth() {
        console.log(`${colors.cyan}\n🏥 Checking service health...${colors.reset}`);
        
        const services = [
            { name: 'Orchestrator', url: `${ORCHESTRATOR_URL}/health` },
            { name: 'VAM Mediation', url: `${VAM_MEDIATION_SERVICE_URL}/health` },
            { name: 'Accounting', url: `${ACCOUNTING_SERVICE_URL}/health` }
        ];
        
        for (const service of services) {
            try {
                const response = await axios.get(service.url);
                console.log(`${colors.green}✅ ${service.name} Service: Healthy${colors.reset}`);
            } catch (error) {
                console.log(`${colors.red}❌ ${service.name} Service: Unhealthy (${error.message})${colors.reset}`);
                return false;
            }
        }
        
        return true;
    }

    async runAllTests() {
        console.log(`${colors.bright}🧪 VAM/MDZ Flow Test Suite${colors.reset}`);
        console.log(`${colors.cyan}===============================${colors.reset}`);
        
        try {
            // Check service health
            const servicesHealthy = await this.checkServicesHealth();
            if (!servicesHealthy) {
                console.log(`${colors.red}❌ Some services are not healthy. Please start all services first.${colors.reset}`);
                return;
            }
            
            // Initialize Kafka
            await this.initialize();
            
            // Run VAM flow test
            const vamResult = await this.testVAMFlow();
            
            // Run MDZ flow test
            const mdzResult = await this.testMDZFlow();
            
            // Print summary
            this.printSummary();
            
        } catch (error) {
            console.error(`${colors.red}❌ Test suite failed: ${error.message}${colors.reset}`);
        } finally {
            await this.cleanup();
        }
    }

    printSummary() {
        console.log(`${colors.bright}\n📋 Test Summary${colors.reset}`);
        console.log(`${colors.cyan}===============${colors.reset}`);
        
        const passed = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        
        console.log(`${colors.blue}Total Tests: ${total}${colors.reset}`);
        console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
        console.log(`${colors.red}Failed: ${total - passed}${colors.reset}`);
        
        if (passed === total) {
            console.log(`${colors.green}\n🎉 All tests passed! Both VAM and MDZ flows are working correctly.${colors.reset}`);
            console.log(`${colors.green}✅ VAM messages are routed through VAM mediation service${colors.reset}`);
            console.log(`${colors.green}✅ MDZ messages skip VAM and go directly to accounting${colors.reset}`);
            console.log(`${colors.green}✅ Both flows successfully reach the accounting service${colors.reset}`);
        } else {
            console.log(`${colors.yellow}\n⚠️ Some tests failed. Check the individual test results above.${colors.reset}`);
        }
        
        console.log(`${colors.cyan}\n🔄 Flow Verification:${colors.reset}`);
        console.log(`${colors.blue}VAM Flow: validated-messages → vam-messages → vam-responses → accounting-service${colors.reset}`);
        console.log(`${colors.blue}MDZ Flow: validated-messages → accounting-service (direct)${colors.reset}`);
    }
}

// Run the test suite
async function main() {
    const tester = new VAMMDZFlowTester();
    await tester.runAllTests();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = VAMMDZFlowTester; 