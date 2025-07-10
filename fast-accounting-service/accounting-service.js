const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');

// Configuration
const PORT = process.env.PORT || 8002;
const SERVICE_NAME = 'fast-accounting-service';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fast-accounting-group';
const ACCOUNTING_KAFKA_TOPIC = process.env.ACCOUNTING_KAFKA_TOPIC || 'accounting-messages';

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

        // Main accounting processing endpoint
        this.app.post('/api/v1/accounting/process', async (req, res) => {
            try {
                const transaction = await this.processTransaction(req.body);
                res.json(transaction);
            } catch (error) {
                console.error(`${colors.red}❌ Error processing transaction: ${error.message}${colors.reset}`);
                res.status(500).json({
                    error: 'Transaction processing failed',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Get processed transactions
        this.app.get('/api/v1/accounting/transactions', (req, res) => {
            res.json({
                transactions: this.processedTransactions,
                count: this.processedTransactions.length,
                timestamp: new Date().toISOString()
            });
        });

        // Get specific transaction
        this.app.get('/api/v1/accounting/transactions/:transactionId', (req, res) => {
            const { transactionId } = req.params;
            const transaction = this.processedTransactions.find(t => 
                t.transactionId === transactionId || t.messageId === transactionId
            );
            
            if (!transaction) {
                return res.status(404).json({
                    error: 'Transaction not found',
                    transactionId,
                    timestamp: new Date().toISOString()
                });
            }
            
            res.json(transaction);
        });

        // Clear processed transactions (for testing)
        this.app.delete('/api/v1/accounting/transactions', (req, res) => {
            this.processedTransactions = [];
            res.json({
                message: 'All transactions cleared',
                timestamp: new Date().toISOString()
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

            // Create consumer
            this.consumer = this.kafka.consumer({ groupId: KAFKA_GROUP_ID });

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
        
        console.log(`${colors.green}💰 Processing accounting transaction:${colors.reset}`);
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
            this.processedTransactions = this.processedTransactions.slice(-100);
        }

        console.log(`${colors.green}✅ Accounting transaction processed successfully${colors.reset}`);
        console.log(`   Transaction ID: ${accountingTransaction.transactionId}`);
        console.log(`   Processing Time: ${processingTime}ms`);
        console.log(`   Total Transactions: ${this.processedTransactions.length}`);

        return accountingTransaction;
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
                    resolve();
                }
            });
        });
    }
}

// Create and start the service
const accountingService = new AccountingService();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(`${colors.yellow}🔄 Received SIGINT, shutting down gracefully...${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`${colors.yellow}🔄 Received SIGTERM, shutting down gracefully...${colors.reset}`);
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