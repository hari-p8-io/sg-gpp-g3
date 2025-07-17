const { Kafka } = require('kafkajs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

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
        orchestrator: { port: 3004, url: 'http://localhost:3004' },
        vamMediation: { port: 3005, url: 'http://localhost:3005' },
        accounting: { port: 8002, url: 'http://localhost:8002' }
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

class SimpleVAMMDZTest {
    constructor() {
        this.kafka = null;
        this.producer = null;
        this.testResults = [];
        this.messageTracker = new Map();
    }

    log(message, color = colors.cyan) {
        console.log(`${color}${message}${colors.reset}`);
    }

    async init() {
        this.log('🚀 Initializing Simple VAM/MDZ E2E Test', colors.bright);
        
        // Initialize Kafka
        this.kafka = new Kafka({
            clientId: 'simple-e2e-test',
            brokers: CONFIG.kafka.brokers
        });

        this.producer = this.kafka.producer();
        await this.producer.connect();
        
        this.log('✅ Kafka producer connected', colors.green);
    }

    async checkServiceHealth() {
        this.log('🔍 Checking service health...');
        
        const healthChecks = [];
        
        for (const [serviceName, config] of Object.entries(CONFIG.services)) {
            healthChecks.push(this.checkHttpHealth(serviceName, config));
        }
        
        const results = await Promise.allSettled(healthChecks);
        
        let allHealthy = true;
        for (let i = 0; i < results.length; i++) {
            const serviceName = Object.keys(CONFIG.services)[i];
            const result = results[i];
            
            if (result.status === 'fulfilled' && result.value) {
                this.log(`✅ ${serviceName} service: healthy`);
            } else {
                this.log(`❌ ${serviceName} service: unhealthy`, colors.red);
                allHealthy = false;
            }
        }
        
        return allHealthy;
    }

    async checkHttpHealth(serviceName, config) {
        try {
            const response = await axios.get(`${config.url}/health`, { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    async runVAMFlowTest() {
        this.log('🏦 Running VAM Flow Test...', colors.blue);
        
        const testMessage = {
            messageId: uuidv4(),
            puid: `G3ITEST${Date.now()}`,
            messageType: 'PACS008',
            timestamp: Date.now(),
            jsonPayload: {
                messageId: uuidv4(),
                extractedFields: {
                    cdtrAcct: '999888777', // VAM account
                    currency: 'SGD',
                    country: 'SG',
                    amount: '1000.00'
                }
            },
            enrichmentData: {
                receivedAcctId: '999888777',
                lookupStatusCode: 200,
                lookupStatusDesc: 'Success',
                physicalAcctInfo: {
                    acctSys: 'VAM',
                    acctGroup: 'VAM',
                    country: 'SG',
                    acctId: '999888777'
                }
            },
            validationResult: {
                isValid: true,
                errors: []
            },
            service: 'simple-e2e-test'
        };
        
        const result = await this.runFlowTest(testMessage, 'VAM');
        this.testResults.push({
            testName: 'VAM Flow Test',
            account: '999888777',
            result: result
        });
        
        return result;
    }

    async runMDZFlowTest() {
        this.log('🏛️ Running MDZ Flow Test...', colors.blue);
        
        const testMessage = {
            messageId: uuidv4(),
            puid: `G3ITEST${Date.now()}`,
            messageType: 'PACS008',
            timestamp: Date.now(),
            jsonPayload: {
                messageId: uuidv4(),
                extractedFields: {
                    cdtrAcct: 'MDZ123456', // MDZ account
                    currency: 'SGD',
                    country: 'SG',
                    amount: '500.00'
                }
            },
            enrichmentData: {
                receivedAcctId: 'MDZ123456',
                lookupStatusCode: 200,
                lookupStatusDesc: 'Success',
                physicalAcctInfo: {
                    acctSys: 'MDZ',
                    acctGroup: 'MDZ',
                    country: 'SG',
                    acctId: 'MDZ123456'
                }
            },
            validationResult: {
                isValid: true,
                errors: []
            },
            service: 'simple-e2e-test'
        };
        
        const result = await this.runFlowTest(testMessage, 'MDZ');
        this.testResults.push({
            testName: 'MDZ Flow Test',
            account: 'MDZ123456',
            result: result
        });
        
        return result;
    }

    async runFlowTest(testMessage, expectedFlow) {
        this.log(`📨 Starting ${expectedFlow} flow for account: ${testMessage.jsonPayload.extractedFields.cdtrAcct}`);
        
        const startTime = Date.now();
        
        try {
            // Step 1: Send message to validated-messages topic
            this.log('  📤 Sending to validated-messages topic...');
            await this.producer.send({
                topic: CONFIG.kafka.topics.validated,
                messages: [{
                    key: testMessage.messageId,
                    value: JSON.stringify(testMessage)
                }]
            });
            
            this.log('  ✅ Message sent to Kafka');
            
            // Step 2: Wait for orchestrator to process
            this.log('  ⏳ Waiting for orchestrator to process...');
            await this.waitForSeconds(5);
            
            // Step 3: Check orchestrator received message
            this.log('  🔍 Checking orchestrator status...');
            const orchestratorStatus = await this.checkOrchestratorStatus(testMessage.messageId);
            
            if (!orchestratorStatus.success) {
                return { success: false, stage: 'Orchestrator', error: 'Message not processed by orchestrator' };
            }
            
            // Step 4: Check VAM mediation (for VAM flow only)
            let vamMediationStatus = { success: true, skipped: true };
            if (expectedFlow === 'VAM') {
                this.log('  🏦 Checking VAM mediation...');
                await this.waitForSeconds(3);
                vamMediationStatus = await this.checkVAMMediation(testMessage.messageId);
                
                if (!vamMediationStatus.success) {
                    return { success: false, stage: 'VAM Mediation', error: 'VAM mediation failed' };
                }
            }
            
            // Step 5: Check accounting service
            this.log('  💰 Checking accounting service...');
            await this.waitForSeconds(3);
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

    async checkOrchestratorStatus(messageId) {
        try {
            const response = await axios.get(`${CONFIG.services.orchestrator.url}/api/v1/messages`, {
                timeout: 5000
            });
            
            const messages = response.data.messages || response.data || [];
            const message = messages.find(msg => 
                msg.messageId === messageId || 
                msg.message_id === messageId ||
                (msg.jsonPayload && msg.jsonPayload.messageId === messageId)
            );
            
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
            const response = await axios.get(`${CONFIG.services.vamMediation.url}/api/v1/messages`, {
                timeout: 5000
            });
            
            const messages = response.data.messages || response.data || [];
            const message = messages.find(msg => 
                msg.messageId === messageId || 
                msg.message_id === messageId ||
                (msg.jsonPayload && msg.jsonPayload.messageId === messageId)
            );
            
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
            const response = await axios.get(`${CONFIG.services.accounting.url}/api/v1/accounting/transactions`, {
                timeout: 5000
            });
            
            const transactions = response.data.transactions || response.data || [];
            const transaction = transactions.find(tx => 
                tx.messageId === messageId || 
                tx.message_id === messageId ||
                (tx.originalMessage && tx.originalMessage.messageId === messageId)
            );
            
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
        console.log(`${colors.bright}📋 SIMPLE VAM/MDZ E2E TEST REPORT${colors.reset}`);
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
        console.log(`\n${colors.cyan}🔄 Flow Summary:${colors.reset}`);
        console.log(`  VAM Flow: validated-messages → orchestrator → vam-messages → accounting`);
        console.log(`  MDZ Flow: validated-messages → orchestrator → accounting (direct)`);
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
            if (this.producer) {
                await this.producer.disconnect();
            }
            
            this.log('✅ Cleanup completed', colors.green);
        } catch (error) {
            this.log(`⚠️  Cleanup error: ${error.message}`, colors.yellow);
        }
    }

    async run() {
        try {
            await this.init();
            
            const servicesHealthy = await this.checkServiceHealth();
            if (!servicesHealthy) {
                this.log('❌ Some services are unhealthy, continuing anyway...', colors.yellow);
            }
            
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
    const test = new SimpleVAMMDZTest();
    const success = await test.run();
    
    console.log(`\n${colors.bright}🎯 Test Result: ${success ? `${colors.green}ALL TESTS PASSED` : `${colors.red}SOME TESTS FAILED`}${colors.reset}`);
    
    process.exit(success ? 0 : 1);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleVAMMDZTest; 