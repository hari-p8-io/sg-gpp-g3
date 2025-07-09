const { Kafka } = require('kafkajs');
const express = require('express');

// Configuration
const config = {
    kafka: {
        brokers: ['localhost:9092'],
        topic: 'vam-messages',
        groupId: 'vam-mediation-group',
        responseTopic: 'vam-responses'
    },
    port: 3005,
    serviceName: 'fast-vammediation-service'
};

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

class VAMMediationService {
    constructor() {
        this.kafka = new Kafka({
            clientId: config.serviceName,
            brokers: config.kafka.brokers
        });
        
        this.consumer = null;
        this.producer = null;
        this.app = express();
        this.processedMessages = [];
        this.isRunning = false;
        
        this.setupExpress();
    }

    setupExpress() {
        this.app.use(express.json());
        
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: config.serviceName,
                kafkaConnected: this.consumer !== null,
                processedMessages: this.processedMessages.length,
                timestamp: new Date().toISOString()
            });
        });

        // Get processed messages endpoint
        this.app.get('/api/v1/messages', (req, res) => {
            res.json({
                messages: this.processedMessages,
                count: this.processedMessages.length,
                timestamp: new Date().toISOString()
            });
        });

        // Clear processed messages (for testing)
        this.app.delete('/api/v1/messages', (req, res) => {
            this.processedMessages = [];
            res.json({
                message: 'All processed messages cleared',
                timestamp: new Date().toISOString()
            });
        });
    }

    async initialize() {
        console.log(`${colors.cyan}🚀 Starting VAM Mediation Service...${colors.reset}`);
        
        try {
            // Initialize Kafka producer first
            await this.initializeKafkaProducer();
            
            // Initialize Kafka consumer
            await this.initializeKafkaConsumer();
            
            // Start HTTP server
            await this.startHTTPServer();
            
            console.log(`${colors.green}✅ VAM Mediation Service initialized successfully${colors.reset}`);
            this.isRunning = true;
            
        } catch (error) {
            console.error(`${colors.red}❌ Failed to initialize VAM Mediation Service: ${error.message}${colors.reset}`);
            process.exit(1);
        }
    }

    async initializeKafkaProducer() {
        console.log(`${colors.blue}📡 Initializing Kafka producer...${colors.reset}`);
        
        this.producer = this.kafka.producer();
        await this.producer.connect();
        
        console.log(`${colors.green}✅ Kafka producer initialized${colors.reset}`);
    }

    async initializeKafkaConsumer() {
        console.log(`${colors.blue}📡 Initializing Kafka consumer...${colors.reset}`);
        
        this.consumer = this.kafka.consumer({ 
            groupId: config.kafka.groupId,
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.consumer.connect();
        await this.consumer.subscribe({ topics: [config.kafka.topic] });

        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                await this.processVAMMessage(topic, partition, message);
            }
        });

        console.log(`${colors.green}✅ Kafka consumer initialized for topic: ${config.kafka.topic}${colors.reset}`);
    }

    async startHTTPServer() {
        return new Promise((resolve, reject) => {
            this.app.listen(config.port, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`${colors.green}🌐 VAM Mediation Service HTTP server listening on port ${config.port}${colors.reset}`);
                    resolve();
                }
            });
        });
    }

    async processVAMMessage(topic, partition, message) {
        try {
            const messageValue = message.value.toString();
            const timestamp = new Date().toISOString();
            
            console.log(`${colors.magenta}📥 VAM Message received:${colors.reset}`);
            console.log(`   Topic: ${topic}`);
            console.log(`   Partition: ${partition}`);
            console.log(`   Offset: ${message.offset}`);
            console.log(`   Timestamp: ${timestamp}`);
            
            // Parse the message
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(messageValue);
            } catch (parseError) {
                console.log(`${colors.yellow}⚠️  Message is not JSON, treating as plain text${colors.reset}`);
                parsedMessage = { 
                    raw: messageValue,
                    type: 'text'
                };
            }

            // Check if response is required
            const responseRequired = parsedMessage.responseRequired || 
                                   (message.headers && message.headers['response-required'] === 'true');
            const responseTopic = parsedMessage.responseTopic || 
                                (message.headers && message.headers['response-topic']?.toString()) || 
                                config.kafka.responseTopic;

            // Process the VAM message
            const processingStartTime = Date.now();
            const processedMessage = await this.performVAMProcessing(parsedMessage, timestamp);
            const processingTime = Date.now() - processingStartTime;

            // Store the processed message
            this.processedMessages.push(processedMessage);

            // Keep only last 100 messages
            if (this.processedMessages.length > 100) {
                this.processedMessages = this.processedMessages.slice(-100);
            }

            console.log(`${colors.green}✅ VAM Message processed successfully${colors.reset}`);
            console.log(`   Message ID: ${processedMessage.id}`);
            console.log(`   Processing Status: ${processedMessage.processing.status}`);
            console.log(`   Processing Time: ${processingTime}ms`);
            console.log(`   Total Messages Processed: ${this.processedMessages.length}`);

            // Log VAM-specific processing
            if (processedMessage.processing.vamSpecificFields) {
                console.log(`${colors.cyan}🏦 VAM-specific processing:${colors.reset}`);
                console.log(`   Account: ${processedMessage.processing.vamSpecificFields.account || 'N/A'}`);
                console.log(`   Amount: ${processedMessage.processing.vamSpecificFields.amount || 'N/A'}`);
                console.log(`   Routing: ${processedMessage.processing.vamSpecificFields.routing || 'VAM'}`);
                console.log(`   PUID: ${processedMessage.processing.vamSpecificFields.puid || 'N/A'}`);
            }

            // Send response back if required
            if (responseRequired && responseTopic) {
                await this.sendVAMResponse(parsedMessage, processedMessage, responseTopic, processingTime);
            }

        } catch (error) {
            console.error(`${colors.red}❌ Error processing VAM message: ${error.message}${colors.reset}`);
            console.error(error.stack);
            
            // Store error information
            const errorMessage = {
                id: `vam-error-${Date.now()}`,
                receivedAt: new Date().toISOString(),
                topic,
                partition,
                offset: message.offset.toString(),
                error: error.message,
                processing: {
                    status: 'error',
                    error: error.message
                }
            };
            
            this.processedMessages.push(errorMessage);

            // Send error response if required
            try {
                const messageValue = message.value.toString();
                const parsedMessage = JSON.parse(messageValue);
                const responseRequired = parsedMessage.responseRequired || 
                                       (message.headers && message.headers['response-required'] === 'true');
                const responseTopic = parsedMessage.responseTopic || 
                                    (message.headers && message.headers['response-topic']?.toString()) || 
                                    config.kafka.responseTopic;

                if (responseRequired && responseTopic) {
                    await this.sendVAMErrorResponse(parsedMessage, error, responseTopic);
                }
            } catch (responseError) {
                console.error(`${colors.red}❌ Failed to send error response: ${responseError.message}${colors.reset}`);
            }
        }
    }

    async performVAMProcessing(parsedMessage, timestamp) {
        // Simulate VAM processing time
        const processingDelay = Math.floor(Math.random() * 300) + 100; // 100-400ms
        await new Promise(resolve => setTimeout(resolve, processingDelay));

        const processedMessage = {
            id: `vam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            receivedAt: timestamp,
            originalMessage: parsedMessage,
            processing: {
                status: 'processed',
                processedAt: timestamp,
                processingTime: processingDelay,
                vamSpecificFields: this.extractVAMFields(parsedMessage),
                vamServices: {
                    valueAddedValidation: 'PASSED',
                    premiumAccountCheck: 'VALIDATED',
                    serviceEnrichment: 'COMPLETED',
                    riskAssessment: 'APPROVED'
                }
            }
        };

        return processedMessage;
    }

    async sendVAMResponse(originalMessage, processedMessage, responseTopic, processingTime) {
        try {
            const response = {
                messageId: originalMessage.messageId,
                puid: originalMessage.puid,
                status: 'success',
                processingStatus: 'processed',
                processingTimeMs: processingTime,
                vamResult: {
                    status: 'completed',
                    services: processedMessage.processing.vamServices,
                    vamSpecificFields: processedMessage.processing.vamSpecificFields
                },
                responseAt: new Date().toISOString(),
                sourceService: 'fast-vammediation-service',
                originalMessageId: originalMessage.messageId
            };

            await this.producer.send({
                topic: responseTopic,
                messages: [{
                    key: originalMessage.messageId,
                    value: JSON.stringify(response),
                    headers: {
                        'message-type': 'vam-response',
                        'status': 'success',
                        'source': 'vam-mediation-service'
                    }
                }]
            });

            console.log(`${colors.green}📤 VAM response sent to topic: ${responseTopic}${colors.reset}`);
            console.log(`   Message ID: ${originalMessage.messageId}`);
            console.log(`   Status: success`);
            console.log(`   Processing Time: ${processingTime}ms`);

        } catch (error) {
            console.error(`${colors.red}❌ Failed to send VAM response: ${error.message}${colors.reset}`);
            throw error;
        }
    }

    async sendVAMErrorResponse(originalMessage, error, responseTopic) {
        try {
            const response = {
                messageId: originalMessage.messageId,
                puid: originalMessage.puid,
                status: 'error',
                processingStatus: 'failed',
                error: error.message,
                responseAt: new Date().toISOString(),
                sourceService: 'fast-vammediation-service',
                originalMessageId: originalMessage.messageId
            };

            await this.producer.send({
                topic: responseTopic,
                messages: [{
                    key: originalMessage.messageId,
                    value: JSON.stringify(response),
                    headers: {
                        'message-type': 'vam-response',
                        'status': 'error',
                        'source': 'vam-mediation-service'
                    }
                }]
            });

            console.log(`${colors.red}📤 VAM error response sent to topic: ${responseTopic}${colors.reset}`);
            console.log(`   Message ID: ${originalMessage.messageId}`);
            console.log(`   Status: error`);
            console.log(`   Error: ${error.message}`);

        } catch (responseError) {
            console.error(`${colors.red}❌ Failed to send VAM error response: ${responseError.message}${colors.reset}`);
            throw responseError;
        }
    }

    extractVAMFields(message) {
        try {
            // Extract VAM-specific fields from the message
            const vamFields = {
                routing: 'VAM',
                processedBy: 'VAM Mediation Service'
            };

            // Extract account information
            if (message.cdtrAcct || message.creditorAccount) {
                vamFields.account = message.cdtrAcct || message.creditorAccount;
            }

            // Extract from enrichment data if available
            if (message.enrichmentData) {
                if (message.enrichmentData.messageData) {
                    vamFields.account = vamFields.account || message.enrichmentData.messageData.creditorAccount;
                    vamFields.amount = message.enrichmentData.messageData.amount;
                    vamFields.currency = message.enrichmentData.messageData.currency;
                    vamFields.debtorAccount = message.enrichmentData.messageData.debtorAccount;
                }
                
                if (message.enrichmentData.physicalAcctInfo) {
                    vamFields.accountSystem = message.enrichmentData.physicalAcctInfo.acctSys;
                    vamFields.accountId = message.enrichmentData.physicalAcctInfo.acctId;
                }
            }

            // Extract amount information
            if (message.amount || message.intrBkSttlmAmt) {
                vamFields.amount = message.amount || message.intrBkSttlmAmt;
            }

            // Extract transaction ID
            if (message.txId || message.transactionId || message.messageId) {
                vamFields.transactionId = message.txId || message.transactionId || message.messageId;
            }

            // Extract PUID
            if (message.puid) {
                vamFields.puid = message.puid;
            }

            // Extract account system
            if (message.acctSys) {
                vamFields.accountSystem = message.acctSys;
            }

            return vamFields;
        } catch (error) {
            console.error(`${colors.red}❌ Error extracting VAM fields: ${error.message}${colors.reset}`);
            return {
                routing: 'VAM',
                processedBy: 'VAM Mediation Service',
                error: error.message
            };
        }
    }

    async shutdown() {
        console.log(`${colors.yellow}🛑 Shutting down VAM Mediation Service...${colors.reset}`);
        
        try {
            if (this.consumer) {
                await this.consumer.disconnect();
                console.log(`${colors.green}✅ Kafka consumer disconnected${colors.reset}`);
            }
            
            if (this.producer) {
                await this.producer.disconnect();
                console.log(`${colors.green}✅ Kafka producer disconnected${colors.reset}`);
            }
            
            this.isRunning = false;
            console.log(`${colors.green}✅ VAM Mediation Service shutdown complete${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Error during shutdown: ${error.message}${colors.reset}`);
        }
    }
}

// Create and start the service
const vamMediationService = new VAMMediationService();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log(`${colors.yellow}🔄 Received SIGINT, shutting down gracefully...${colors.reset}`);
    await vamMediationService.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`${colors.yellow}🔄 Received SIGTERM, shutting down gracefully...${colors.reset}`);
    await vamMediationService.shutdown();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`${colors.red}❌ Unhandled Rejection at: ${promise}, reason: ${reason}${colors.reset}`);
    process.exit(1);
});

// Initialize the service
vamMediationService.initialize().catch(error => {
    console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
}); 