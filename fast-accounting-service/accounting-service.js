const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');

// Configuration
const PORT = process.env.PORT || 8002;
const SERVICE_NAME = 'fast-accounting-service';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fast-accounting-group';
const ACCOUNTING_KAFKA_TOPIC = process.env.ACCOUNTING_KAFKA_TOPIC || 'accounting-messages';
const COMPLETION_KAFKA_TOPIC = process.env.COMPLETION_KAFKA_TOPIC || 'accounting-completion-messages';

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

class AccountingService {
    constructor() {
        this.app = express();
        this.processedTransactions = [];
        this.kafka = null;
        this.consumer = null;
        this.producer = null;
        this.setupMiddleware();
        this.setupRoutes();
        this.initializeKafka();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${colors.cyan}📝 ${req.method} ${req.path}${colors.reset}`);
            next();
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: SERVICE_NAME,
                processedTransactions: this.processedTransactions.length,
                timestamp: new Date().toISOString()
            });
        });

        // Actuator endpoints for compatibility with Java services
        this.app.get('/actuator/health', (req, res) => {
            res.json({
                status: 'UP',
                components: {
                    'accounting-service': { status: 'UP' }
                }
            });
        });

        this.app.get('/actuator/info', (req, res) => {
            res.json({
                service: SERVICE_NAME,
                version: '1.0.0',
                description: 'Fast Accounting Service - Node.js implementation'
            });
        });

    }

    async initializeKafka() {
        try {
            // Initialize Kafka client
            this.kafka = new Kafka({
                clientId: SERVICE_NAME,
                brokers: KAFKA_BROKERS,
                retry: {
                    retries: 3,
                    initialRetryTime: 1000
                }
            });

            // Create consumer for incoming accounting messages
            this.consumer = this.kafka.consumer({ groupId: KAFKA_GROUP_ID });
            
            // Create producer for completion messages
            this.producer = this.kafka.producer({
                retry: {
                    retries: 3,
                    initialRetryTime: 1000
                }
            });

            // Connect producer
            await this.producer.connect();
            console.log(`${colors.green}📤 Kafka producer connected for completion messages${colors.reset}`);

            // Connect and subscribe to topics
            await this.consumer.connect();
            await this.consumer.subscribe({ topic: ACCOUNTING_KAFKA_TOPIC, fromBeginning: false });

            // Start consuming messages
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const messageValue = message.value?.toString();
                        if (!messageValue) return;

                        const accountingMessage = JSON.parse(messageValue);
                        console.log(`${colors.blue}📥 Received accounting message from Kafka: ${accountingMessage.messageId}${colors.reset}`);
                        
                        // Process the accounting message
                        await this.processTransaction(accountingMessage);
                        
                    } catch (error) {
                        console.error(`${colors.red}❌ Error processing Kafka message:${colors.reset}`, error);
                    }
                }
            });

            console.log(`${colors.green}✅ Kafka consumer initialized for topic: ${ACCOUNTING_KAFKA_TOPIC}${colors.reset}`);
            
        } catch (error) {
            console.error(`${colors.red}❌ Failed to initialize Kafka:${colors.reset}`, error);
        }
    }

    async processTransaction(transactionData) {
        const processingStartTime = Date.now();
        
        console.log(`${colors.magenta}💰 Processing accounting transaction:${colors.reset}`);
        console.log(`   Message ID: ${transactionData.messageId}`);
        console.log(`   PUID: ${transactionData.puid}`);
        console.log(`   Amount: ${transactionData.amount} ${transactionData.currency}`);
        console.log(`   From: ${transactionData.debtorAccount}`);
        console.log(`   To: ${transactionData.creditorAccount}`);

        // Simulate accounting processing
        await this.simulateAccountingProcessing(transactionData);

        const processingTime = Date.now() - processingStartTime;
        
        const accountingTransaction = {
            transactionId: uuidv4(),
            messageId: transactionData.messageId,
            puid: transactionData.puid,
            messageType: transactionData.messageType,
            amount: transactionData.amount,
            currency: transactionData.currency || 'SGD',
            debtorAccount: transactionData.debtorAccount,
            creditorAccount: transactionData.creditorAccount,
            accountingEntries: this.generateAccountingEntries(transactionData),
            processing: {
                status: 'completed',
                processedAt: new Date().toISOString(),
                processingTimeMs: processingTime,
                validations: {
                    accountValidation: 'PASSED',
                    balanceCheck: 'SUFFICIENT',
                    limitCheck: 'APPROVED',
                    complianceCheck: 'CLEARED'
                }
            },
            metadata: {
                sourceService: transactionData.sourceService,
                enrichmentData: transactionData.enrichmentData,
                processedBy: SERVICE_NAME
            }
        };

        // Store the transaction
        this.processedTransactions.push(accountingTransaction);

        // Keep only last 100 transactions
        if (this.processedTransactions.length > 100) {
            this.processedTransactions.shift();
        }

        console.log(`${colors.green}✅ Accounting transaction processed successfully${colors.reset}`);
        console.log(`   Transaction ID: ${accountingTransaction.transactionId}`);
        console.log(`   Processing Time: ${processingTime}ms`);
        console.log(`   Total Transactions: ${this.processedTransactions.length}`);

        // Send completion message to requesthandler
        await this.sendCompletionMessage(accountingTransaction, transactionData);

        return accountingTransaction;
    }

    async sendCompletionMessage(accountingTransaction, originalTransactionData) {
        try {
            const completionMessage = {
                messageId: accountingTransaction.messageId,
                puid: accountingTransaction.puid,
                transactionId: accountingTransaction.transactionId,
                messageType: accountingTransaction.messageType,
                status: 'COMPLETED',
                completedAt: new Date().toISOString(),
                processingTimeMs: accountingTransaction.processing.processingTimeMs,
                amount: accountingTransaction.amount,
                currency: accountingTransaction.currency,
                debtorAccount: accountingTransaction.debtorAccount,
                creditorAccount: accountingTransaction.creditorAccount,
                originalMessageData: {
                    originalMessageId: originalTransactionData.originalMessageId,
                    originalCreationTime: originalTransactionData.originalCreationTime,
                    originalXmlPayload: originalTransactionData.originalXmlPayload
                },
                enrichmentData: accountingTransaction.metadata.enrichmentData,
                accountingResult: {
                    transactionId: accountingTransaction.transactionId,
                    accountingEntries: accountingTransaction.accountingEntries,
                    validations: accountingTransaction.processing.validations
                },
                responseRequired: true,
                responseType: 'PACS.002'
            };

            const message = {
                key: accountingTransaction.puid,
                value: JSON.stringify(completionMessage),
                headers: {
                    'messageId': accountingTransaction.messageId,
                    'puid': accountingTransaction.puid,
                    'messageType': accountingTransaction.messageType,
                    'timestamp': new Date().toISOString(),
                    'source': SERVICE_NAME
                }
            };

            await this.producer.send({
                topic: COMPLETION_KAFKA_TOPIC,
                messages: [message]
            });

            console.log(`${colors.cyan}📤 Completion message sent to requesthandler: ${accountingTransaction.puid}${colors.reset}`);
            console.log(`   Topic: ${COMPLETION_KAFKA_TOPIC}`);
            console.log(`   Response Type: PACS.002`);
            
        } catch (error) {
            console.error(`${colors.red}❌ Failed to send completion message:${colors.reset}`, error);
        }
    }

    async simulateAccountingProcessing(transactionData) {
        // Simulate different processing times based on transaction type
        const baseProcessingTime = 200;
        const amount = parseFloat(transactionData.amount) || 0;
        
        let processingTime = baseProcessingTime;
        
        // Higher amounts take longer to process
        if (amount > 50000) {
            processingTime += 300; // High-value transactions
        } else if (amount > 10000) {
            processingTime += 150; // Medium-value transactions
        }
        
        // VAM transactions take slightly longer
        if (transactionData.enrichmentData?.physicalAcctInfo?.acctSys === 'VAM') {
            processingTime += 100;
        }
        
        // Add some randomness
        processingTime += Math.floor(Math.random() * 100);
        
        await new Promise(resolve => setTimeout(resolve, processingTime));
    }

    generateAccountingEntries(transactionData) {
        const amount = parseFloat(transactionData.amount) || 0;
        const currency = transactionData.currency || 'SGD';
        
        return [
            {
                entryType: 'DEBIT',
                account: transactionData.debtorAccount,
                amount: amount,
                currency: currency,
                description: `Transfer to ${transactionData.creditorAccount}`,
                timestamp: new Date().toISOString()
            },
            {
                entryType: 'CREDIT',
                account: transactionData.creditorAccount,
                amount: amount,
                currency: currency,
                description: `Transfer from ${transactionData.debtorAccount}`,
                timestamp: new Date().toISOString()
            }
        ];
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.app.listen(PORT, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`${colors.green}🚀 ${SERVICE_NAME} listening on port ${PORT}${colors.reset}`);
                    console.log(`${colors.blue}📊 Health check: http://localhost:${PORT}/health${colors.reset}`);
                    console.log(`${colors.blue}📊 Actuator health: http://localhost:${PORT}/actuator/health${colors.reset}`);
                    console.log(`${colors.blue}💰 Process endpoint: http://localhost:${PORT}/api/v1/accounting/process${colors.reset}`);
                    console.log(`${colors.cyan}📤 Completion messages topic: ${COMPLETION_KAFKA_TOPIC}${colors.reset}`);
                    resolve();
                }
            });
        });
    }

    async shutdown() {
        try {
            if (this.producer) {
                await this.producer.disconnect();
                console.log(`${colors.yellow}📤 Kafka producer disconnected${colors.reset}`);
            }
            if (this.consumer) {
                await this.consumer.disconnect();
                console.log(`${colors.yellow}📥 Kafka consumer disconnected${colors.reset}`);
            }
        } catch (error) {
            console.error(`${colors.red}❌ Error during shutdown:${colors.reset}`, error);
        }
    }
}

// Create and start the service
const accountingService = new AccountingService();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log(`${colors.yellow}🔄 Received SIGINT, shutting down gracefully...${colors.reset}`);
    await accountingService.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`${colors.yellow}🔄 Received SIGTERM, shutting down gracefully...${colors.reset}`);
    await accountingService.shutdown();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`${colors.red}❌ Unhandled Rejection at: ${promise}, reason: ${reason}${colors.reset}`);
    process.exit(1);
});

// Start the service
accountingService.start().catch(error => {
    console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
}); 