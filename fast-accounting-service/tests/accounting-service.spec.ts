import { test, expect } from '@playwright/test';
import { Kafka } from 'kafkajs';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

// Test configuration
const CONFIG = {
    KAFKA_BROKERS: ['localhost:9092'],
    KAFKA_TOPICS: {
        accountingMessages: 'accounting-messages',
        completionMessages: 'accounting-completion-messages'
    },
    HTTP_ENDPOINTS: {
        accounting: 'http://localhost:8002'
    },
    TIMEOUTS: {
        service: 30000,
        message: 15000,
        kafka: 10000
    }
};

// Test scenarios for accounting service
const ACCOUNTING_SCENARIOS = [
    {
        name: 'VAM High Value Transaction',
        messageType: 'PACS008',
        amount: 75000.00,
        currency: 'SGD',
        debtorAccount: '123456789012',
        creditorAccount: '999888777666',
        expectedStatus: 'COMPLETED',
        description: 'High value VAM transaction requiring processing'
    },
    {
        name: 'Regular Transaction',
        messageType: 'PACS008',
        amount: 1500.00,
        currency: 'SGD',
        debtorAccount: '987654321098',
        creditorAccount: '123456789012',
        expectedStatus: 'COMPLETED',
        description: 'Regular transaction processing'
    },
    {
        name: 'Corporate Transaction',
        messageType: 'PACS008',
        amount: 25000.00,
        currency: 'SGD',
        debtorAccount: '555666777888',
        creditorAccount: '888777666555',
        expectedStatus: 'COMPLETED',
        description: 'Corporate transaction processing'
    },
    {
        name: 'Payment Reversal',
        messageType: 'PACS007',
        amount: 10000.00,
        currency: 'SGD',
        debtorAccount: '123456789012',
        creditorAccount: '999888777666',
        expectedStatus: 'COMPLETED',
        description: 'Payment reversal processing'
    },
    {
        name: 'Low Value Transaction',
        messageType: 'PACS008',
        amount: 50.00,
        currency: 'SGD',
        debtorAccount: '111222333444',
        creditorAccount: '444333222111',
        expectedStatus: 'COMPLETED',
        description: 'Low value transaction processing'
    }
];

class AccountingKafkaHelper {
    private kafka: Kafka;
    private producer: any;
    private consumer: any;
    private completionTracker: Map<string, any>;

    constructor() {
        this.kafka = new Kafka({
            clientId: 'accounting-test-client',
            brokers: CONFIG.KAFKA_BROKERS,
            retry: {
                retries: 3,
                initialRetryTime: 1000
            }
        });
        this.completionTracker = new Map();
    }

    async initialize() {
        // Initialize producer for sending accounting messages
        this.producer = this.kafka.producer({
            retry: {
                retries: 3,
                initialRetryTime: 1000
            }
        });

        // Initialize consumer for completion messages
        this.consumer = this.kafka.consumer({ 
            groupId: 'accounting-test-consumer',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.producer.connect();
        await this.consumer.connect();
        
        await this.consumer.subscribe({ 
            topic: CONFIG.KAFKA_TOPICS.completionMessages,
            fromBeginning: false
        });

        // Start consuming completion messages
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = message.value?.toString();
                    if (!messageValue) return;

                    const completionMessage = JSON.parse(messageValue);
                    const headers = this.extractHeaders(message.headers);
                    
                    console.log(`📥 Received completion message: ${completionMessage.messageId || 'unknown'}`);
                    
                    this.completionTracker.set(completionMessage.messageId, {
                        topic,
                        partition,
                        headers,
                        payload: completionMessage,
                        timestamp: new Date().toISOString()
                    });

                } catch (error) {
                    console.error('Error processing completion message:', error);
                }
            }
        });
    }

    async sendAccountingMessage(accountingData: any) {
        const message = {
            key: accountingData.puid,
            value: JSON.stringify(accountingData),
            headers: {
                'messageId': accountingData.messageId,
                'puid': accountingData.puid,
                'messageType': accountingData.messageType,
                'timestamp': new Date().toISOString(),
                'source': 'accounting-test'
            }
        };

        await this.producer.send({
            topic: CONFIG.KAFKA_TOPICS.accountingMessages,
            messages: [message]
        });

        console.log(`📤 Sent accounting message: ${accountingData.messageId}`);
    }

    async waitForCompletionMessage(messageId: string, timeout: number = CONFIG.TIMEOUTS.message) {
        const startTime = Date.now();
        const checkInterval = 1000;
        
        while (Date.now() - startTime < timeout) {
            const completion = this.completionTracker.get(messageId);
            if (completion) {
                return completion;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        return null;
    }

    clearCompletions() {
        this.completionTracker.clear();
    }

    private extractHeaders(kafkaHeaders: any) {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(kafkaHeaders)) {
            headers[key] = value.toString();
        }
        return headers;
    }

    async cleanup() {
        if (this.producer) {
            await this.producer.disconnect();
        }
        if (this.consumer) {
            await this.consumer.disconnect();
        }
    }
}

test.describe('Accounting Service Enhanced Flow Tests', () => {
    let kafkaHelper: AccountingKafkaHelper;

    test.beforeAll(async () => {
        // Initialize Kafka helper
        kafkaHelper = new AccountingKafkaHelper();
        await kafkaHelper.initialize();
    });

    test.afterAll(async () => {
        await kafkaHelper.cleanup();
    });

    test.beforeEach(async () => {
        kafkaHelper.clearCompletions();
    });

    test('should check accounting service health', async () => {
        const response = await fetch(`${CONFIG.HTTP_ENDPOINTS.accounting}/health`);
        expect(response.ok).toBe(true);
        
        const healthData = await response.json();
        expect(healthData.status).toBe('healthy');
        expect(healthData.service).toBe('fast-accounting-service');
        expect(healthData.processedTransactions).toBeDefined();
        
        console.log(`✅ Accounting service is healthy`);
    });

    test('should check actuator endpoints', async () => {
        // Test actuator health endpoint
        const healthResponse = await fetch(`${CONFIG.HTTP_ENDPOINTS.accounting}/actuator/health`);
        expect(healthResponse.ok).toBe(true);
        
        const healthData = await healthResponse.json();
        expect(healthData.status).toBe('UP');
        expect(healthData.components).toBeDefined();
        
        // Test actuator info endpoint
        const infoResponse = await fetch(`${CONFIG.HTTP_ENDPOINTS.accounting}/actuator/info`);
        expect(infoResponse.ok).toBe(true);
        
        const infoData = await infoResponse.json();
        expect(infoData.service).toBe('fast-accounting-service');
        expect(infoData.version).toBe('1.0.0');
        
        console.log(`✅ Actuator endpoints are working`);
    });

    // Test each accounting scenario
    for (const scenario of ACCOUNTING_SCENARIOS) {
        test(`should process ${scenario.name} and send completion message`, async () => {
            const accountingData = generateAccountingMessage(scenario);
            
            console.log(`🧪 Testing: ${scenario.name}`);
            console.log(`💰 Amount: ${scenario.amount} ${scenario.currency}`);
            console.log(`📊 From: ${scenario.debtorAccount} To: ${scenario.creditorAccount}`);
            
            // Send accounting message
            await kafkaHelper.sendAccountingMessage(accountingData);
            
            // Wait for completion message
            console.log(`⏳ Waiting for completion message: ${accountingData.messageId}`);
            const completion = await kafkaHelper.waitForCompletionMessage(
                accountingData.messageId, 
                CONFIG.TIMEOUTS.kafka
            );
            
            // Validate completion message
            expect(completion).toBeDefined();
            expect(completion.payload).toBeDefined();
            
            const payload = completion.payload;
            
            // Validate completion message structure
            expect(payload.messageId).toBe(accountingData.messageId);
            expect(payload.puid).toBe(accountingData.puid);
            expect(payload.transactionId).toBeDefined();
            expect(payload.status).toBe(scenario.expectedStatus);
            expect(payload.completedAt).toBeDefined();
            expect(payload.processingTimeMs).toBeDefined();
            expect(payload.amount).toBe(scenario.amount);
            expect(payload.currency).toBe(scenario.currency);
            expect(payload.debtorAccount).toBe(scenario.debtorAccount);
            expect(payload.creditorAccount).toBe(scenario.creditorAccount);
            
            // Validate accounting result
            expect(payload.accountingResult).toBeDefined();
            expect(payload.accountingResult.transactionId).toBeDefined();
            expect(payload.accountingResult.accountingEntries).toBeDefined();
            expect(payload.accountingResult.validations).toBeDefined();
            
            // Validate accounting entries
            const entries = payload.accountingResult.accountingEntries;
            expect(entries).toHaveLength(2);
            
            const debitEntry = entries.find((e: any) => e.entryType === 'DEBIT');
            const creditEntry = entries.find((e: any) => e.entryType === 'CREDIT');
            
            expect(debitEntry).toBeDefined();
            expect(debitEntry.account).toBe(scenario.debtorAccount);
            expect(debitEntry.amount).toBe(scenario.amount);
            expect(debitEntry.currency).toBe(scenario.currency);
            
            expect(creditEntry).toBeDefined();
            expect(creditEntry.account).toBe(scenario.creditorAccount);
            expect(creditEntry.amount).toBe(scenario.amount);
            expect(creditEntry.currency).toBe(scenario.currency);
            
            // Validate validations
            const validations = payload.accountingResult.validations;
            expect(validations.accountValidation).toBe('PASSED');
            expect(validations.balanceCheck).toBe('SUFFICIENT');
            expect(validations.limitCheck).toBe('APPROVED');
            expect(validations.complianceCheck).toBe('CLEARED');
            
            // Validate response requirements
            expect(payload.responseRequired).toBe(true);
            expect(payload.responseType).toBe('PACS.002');
            
            // Validate original message data
            expect(payload.originalMessageData).toBeDefined();
            expect(payload.originalMessageData.originalMessageId).toBeDefined();
            expect(payload.originalMessageData.originalCreationTime).toBeDefined();
            
            console.log(`✅ ${scenario.name} processed successfully`);
            console.log(`   Transaction ID: ${payload.transactionId}`);
            console.log(`   Processing Time: ${payload.processingTimeMs}ms`);
            console.log(`   Status: ${payload.status}`);
        });
    }

    test('should handle concurrent accounting messages', async () => {
        const concurrentScenarios = ACCOUNTING_SCENARIOS.slice(0, 3);
        const accountingMessages = [];
        
        console.log(`🚀 Testing ${concurrentScenarios.length} concurrent accounting messages`);
        
        // Generate all messages
        for (const scenario of concurrentScenarios) {
            const accountingData = generateAccountingMessage(scenario);
            accountingMessages.push({ scenario, data: accountingData });
        }
        
        // Send all messages concurrently
        const sendPromises = accountingMessages.map(msg => 
            kafkaHelper.sendAccountingMessage(msg.data)
        );
        
        await Promise.all(sendPromises);
        
        // Wait for all completion messages
        const completionPromises = accountingMessages.map(msg => 
            kafkaHelper.waitForCompletionMessage(msg.data.messageId, CONFIG.TIMEOUTS.kafka)
        );
        
        const completions = await Promise.all(completionPromises);
        
        // Validate all completions
        for (let i = 0; i < completions.length; i++) {
            const completion = completions[i];
            const scenario = concurrentScenarios[i];
            
            expect(completion).toBeDefined();
            expect(completion.payload.status).toBe(scenario.expectedStatus);
            expect(completion.payload.transactionId).toBeDefined();
            
            console.log(`✅ Concurrent message ${i + 1} processed: ${completion.payload.transactionId}`);
        }
        
        console.log(`🎉 All ${concurrentScenarios.length} concurrent messages processed successfully`);
    });

    test('should handle high volume of accounting messages', async () => {
        const messageCount = 10;
        const scenario = ACCOUNTING_SCENARIOS[1]; // Use regular transaction scenario
        const messages = [];
        
        console.log(`🚀 Testing high volume: ${messageCount} accounting messages`);
        
        // Generate multiple messages
        for (let i = 0; i < messageCount; i++) {
            const accountingData = generateAccountingMessage(scenario);
            accountingData.messageId = `${accountingData.messageId}-${i}`;
            accountingData.puid = `${accountingData.puid}-${i}`;
            messages.push(accountingData);
        }
        
        // Send all messages
        for (let i = 0; i < messages.length; i++) {
            await kafkaHelper.sendAccountingMessage(messages[i]);
            
            if (i % 5 === 0) {
                console.log(`📤 Sent ${i + 1}/${messageCount} messages`);
            }
        }
        
        // Wait for all completion messages
        const completions = [];
        for (let i = 0; i < messages.length; i++) {
            const completion = await kafkaHelper.waitForCompletionMessage(
                messages[i].messageId, 
                CONFIG.TIMEOUTS.kafka
            );
            completions.push(completion);
        }
        
        // Validate results
        const successfulCompletions = completions.filter(c => c && c.payload.status === 'COMPLETED');
        expect(successfulCompletions.length).toBeGreaterThan(messageCount * 0.8); // At least 80% success rate
        
        console.log(`✅ High volume test completed: ${successfulCompletions.length}/${messageCount} successful`);
    });

    test('should measure processing time performance', async () => {
        const scenario = ACCOUNTING_SCENARIOS[0]; // Use high value transaction
        const accountingData = generateAccountingMessage(scenario);
        
        console.log(`⏱️  Testing processing time performance`);
        
        // Measure total processing time
        const startTime = Date.now();
        
        // Send accounting message
        await kafkaHelper.sendAccountingMessage(accountingData);
        
        // Wait for completion
        const completion = await kafkaHelper.waitForCompletionMessage(
            accountingData.messageId, 
            CONFIG.TIMEOUTS.kafka
        );
        
        const totalTime = Date.now() - startTime;
        
        expect(completion).toBeDefined();
        expect(completion.payload.processingTimeMs).toBeDefined();
        
        const serviceProcessingTime = completion.payload.processingTimeMs;
        
        // Validate performance expectations
        expect(serviceProcessingTime).toBeLessThan(5000); // Service should process within 5 seconds
        expect(totalTime).toBeLessThan(10000); // Total time should be within 10 seconds
        
        console.log(`⏱️  Performance metrics:`);
        console.log(`   Service processing time: ${serviceProcessingTime}ms`);
        console.log(`   Total end-to-end time: ${totalTime}ms`);
        console.log(`   Message size: ${JSON.stringify(accountingData).length} bytes`);
    });

    test('should validate accounting entries for different transaction types', async () => {
        const scenarios = [
            ACCOUNTING_SCENARIOS[0], // High value
            ACCOUNTING_SCENARIOS[1], // Regular
            ACCOUNTING_SCENARIOS[3]  // Reversal
        ];
        
        for (const scenario of scenarios) {
            const accountingData = generateAccountingMessage(scenario);
            
            console.log(`🧪 Testing accounting entries for: ${scenario.name}`);
            
            // Send message
            await kafkaHelper.sendAccountingMessage(accountingData);
            
            // Wait for completion
            const completion = await kafkaHelper.waitForCompletionMessage(
                accountingData.messageId, 
                CONFIG.TIMEOUTS.kafka
            );
            
            expect(completion).toBeDefined();
            
            const entries = completion.payload.accountingResult.accountingEntries;
            
            // Validate entry structure
            expect(entries).toHaveLength(2);
            
            const debitEntry = entries.find((e: any) => e.entryType === 'DEBIT');
            const creditEntry = entries.find((e: any) => e.entryType === 'CREDIT');
            
            // Validate debit entry
            expect(debitEntry).toBeDefined();
            expect(debitEntry.account).toBe(scenario.debtorAccount);
            expect(debitEntry.amount).toBe(scenario.amount);
            expect(debitEntry.currency).toBe(scenario.currency);
            expect(debitEntry.description).toContain(scenario.creditorAccount);
            expect(debitEntry.timestamp).toBeDefined();
            
            // Validate credit entry
            expect(creditEntry).toBeDefined();
            expect(creditEntry.account).toBe(scenario.creditorAccount);
            expect(creditEntry.amount).toBe(scenario.amount);
            expect(creditEntry.currency).toBe(scenario.currency);
            expect(creditEntry.description).toContain(scenario.debtorAccount);
            expect(creditEntry.timestamp).toBeDefined();
            
            console.log(`✅ Accounting entries validated for ${scenario.name}`);
        }
    });

    test('should handle VAM transactions with enhanced processing', async () => {
        const vamScenario = ACCOUNTING_SCENARIOS[0]; // High value VAM transaction
        const accountingData = generateAccountingMessage(vamScenario);
        
        // Add VAM-specific enrichment data
        accountingData.enrichmentData = {
            physicalAcctInfo: {
                acctSys: 'VAM',
                acctId: vamScenario.creditorAccount,
                acctType: 'CORPORATE'
            },
            authMethod: 'GROUPLIMIT',
            lookupSource: 'STUB'
        };
        
        console.log(`🏦 Testing VAM transaction processing`);
        
        // Send VAM accounting message
        await kafkaHelper.sendAccountingMessage(accountingData);
        
        // Wait for completion
        const completion = await kafkaHelper.waitForCompletionMessage(
            accountingData.messageId, 
            CONFIG.TIMEOUTS.kafka
        );
        
        expect(completion).toBeDefined();
        
        const payload = completion.payload;
        
        // Validate VAM-specific processing
        expect(payload.enrichmentData).toBeDefined();
        expect(payload.enrichmentData.physicalAcctInfo.acctSys).toBe('VAM');
        expect(payload.enrichmentData.authMethod).toBe('GROUPLIMIT');
        
        // VAM transactions might take longer to process
        expect(payload.processingTimeMs).toBeDefined();
        
        console.log(`✅ VAM transaction processed successfully`);
        console.log(`   Account System: ${payload.enrichmentData.physicalAcctInfo.acctSys}`);
        console.log(`   Auth Method: ${payload.enrichmentData.authMethod}`);
        console.log(`   Processing Time: ${payload.processingTimeMs}ms`);
    });
});

// Helper function to generate accounting message
function generateAccountingMessage(scenario: any) {
    const messageId = uuidv4();
    const puid = `G3I${Math.random().toString(36).substr(2, 13).toUpperCase()}`;
    
    return {
        messageId,
        puid,
        messageType: scenario.messageType,
        amount: scenario.amount,
        currency: scenario.currency,
        debtorAccount: scenario.debtorAccount,
        creditorAccount: scenario.creditorAccount,
        sourceService: 'fast-orchestrator-service',
        originalMessageId: `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalCreationTime: new Date().toISOString(),
        originalXmlPayload: `<?xml version="1.0"?><test>Placeholder for ${scenario.messageType}</test>`,
        enrichmentData: {
            physicalAcctInfo: {
                acctSys: scenario.creditorAccount.startsWith('999') ? 'VAM' : 'MEPS',
                acctId: scenario.creditorAccount,
                acctType: 'RETAIL'
            },
            authMethod: scenario.creditorAccount.startsWith('999') ? 'GROUPLIMIT' : 'AFPONLY',
            lookupSource: 'STUB'
        },
        metadata: {
            testScenario: scenario.name,
            description: scenario.description,
            timestamp: new Date().toISOString()
        }
    };
} 