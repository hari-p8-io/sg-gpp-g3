const { Kafka } = require('kafkajs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuration
const CONFIG = {
    GRPC_SERVER: 'localhost:50051',
    KAFKA_BROKERS: ['localhost:9092'],
    KAFKA_TOPIC: 'pacs-response-messages',
    TIMEOUTS: {
        GRPC_CALL: 10000,
        KAFKA_MESSAGE: 20000
    }
};

// Test scenarios for PACS002 assertion
const PACS002_TEST_SCENARIOS = [
    {
        name: 'VAM High Value Transaction',
        messageType: 'PACS008',
        amount: 50000.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'High value transaction through VAM system'
    },
    {
        name: 'Regular Transaction',
        messageType: 'PACS008',
        amount: 1500.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'Regular transaction through MEPS system'
    },
    {
        name: 'Corporate Fast Transfer',
        messageType: 'PACS008',
        amount: 25000.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'Corporate transaction through FAST system'
    },
    {
        name: 'Error Scenario - Invalid Account',
        messageType: 'PACS008',
        amount: 1000.00,
        currency: 'SGD',
        expectedStatus: 'RJCT',
        description: 'Invalid account to test error handling'
    }
];

class PACS002TestRunner {
    constructor() {
        this.grpcClient = null;
        this.kafka = null;
        this.kafkaConsumer = null;
        this.messageTracker = new Map();
        this.testResults = [];
    }

    async initialize() {
        console.log('🚀 Initializing PACS002 Test Runner...');
        
        try {
            // Initialize gRPC client
            await this.initializeGrpcClient();
            
            // Initialize Kafka consumer
            await this.initializeKafka();
            
            console.log('✅ PACS002 Test Runner initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize test runner:', error.message);
            return false;
        }
    }

    async initializeGrpcClient() {
        const protoPath = path.join(__dirname, 'proto', 'message_handler.proto');
        const packageDefinition = protoLoader.loadSync(protoPath, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });

        const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
        this.grpcClient = new protoDescriptor.gpp.g3.requesthandler.MessageHandler(
            CONFIG.GRPC_SERVER,
            grpc.credentials.createInsecure()
        );

        // Test gRPC connection
        await this.testGrpcConnection();
    }

    async testGrpcConnection() {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + CONFIG.TIMEOUTS.GRPC_CALL;
            
            this.grpcClient.HealthCheck({}, { deadline }, (error, response) => {
                if (error) {
                    reject(new Error(`gRPC connection failed: ${error.message}`));
                } else {
                    console.log('✅ gRPC connection established');
                    resolve(response);
                }
            });
        });
    }

    async initializeKafka() {
        this.kafka = new Kafka({
            clientId: 'pacs002-test-runner',
            brokers: CONFIG.KAFKA_BROKERS,
            retry: {
                retries: 3,
                initialRetryTime: 1000
            }
        });

        this.kafkaConsumer = this.kafka.consumer({ 
            groupId: 'pacs002-test-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.kafkaConsumer.connect();
        await this.kafkaConsumer.subscribe({ 
            topic: CONFIG.KAFKA_TOPIC,
            fromBeginning: false
        });

        await this.kafkaConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = message.value?.toString();
                    if (!messageValue) return;

                    const pacsResponse = JSON.parse(messageValue);
                    
                    console.log(`📥 Received PACS002 response: ${pacsResponse.messageId || 'unknown'}`);
                    
                    this.messageTracker.set(pacsResponse.messageId, {
                        topic,
                        partition,
                        payload: pacsResponse,
                        timestamp: new Date().toISOString()
                    });

                } catch (error) {
                    console.error('❌ Error processing Kafka message:', error);
                }
            }
        });

        console.log('✅ Kafka consumer initialized');
    }

    async runAllTests() {
        console.log('\n🧪 Starting PACS002 End-to-End Test Suite...');
        console.log('=' .repeat(60));

        const startTime = Date.now();
        let passedTests = 0;
        let failedTests = 0;

        for (const scenario of PACS002_TEST_SCENARIOS) {
            console.log(`\n📋 Testing: ${scenario.name}`);
            console.log(`💰 Amount: ${scenario.amount} ${scenario.currency}`);
            console.log(`📝 Description: ${scenario.description}`);

            try {
                const result = await this.runSingleTest(scenario);
                
                if (result.success) {
                    console.log(`✅ ${scenario.name} - PASSED`);
                    passedTests++;
                } else {
                    console.log(`❌ ${scenario.name} - FAILED: ${result.error}`);
                    failedTests++;
                }

                this.testResults.push({
                    scenario: scenario.name,
                    ...result
                });

            } catch (error) {
                console.log(`❌ ${scenario.name} - ERROR: ${error.message}`);
                failedTests++;
                
                this.testResults.push({
                    scenario: scenario.name,
                    success: false,
                    error: error.message
                });
            }
        }

        const totalTime = Date.now() - startTime;
        
        console.log('\n' + '=' .repeat(60));
        console.log('📊 PACS002 Test Results Summary:');
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`⏱️  Total time: ${totalTime}ms`);
        console.log('=' .repeat(60));

        return {
            passed: passedTests,
            failed: failedTests,
            total: passedTests + failedTests,
            duration: totalTime,
            results: this.testResults
        };
    }

    async runSingleTest(scenario) {
        const testMessage = this.generateTestMessage(scenario);
        
        // Send message to request handler
        const response = await this.sendGrpcMessage(testMessage);
        
        if (!response.success) {
            return {
                success: false,
                error: `gRPC call failed: ${response.error_message}`,
                response
            };
        }

        console.log(`📤 Message sent successfully: ${response.message_id}`);
        console.log(`🏷️  PUID: ${response.puid}`);

        // Wait for PACS002 response
        const pacsResponse = await this.waitForPacsResponse(response.message_id);
        
        if (!pacsResponse) {
            return {
                success: false,
                error: 'No PACS002 response received within timeout',
                response
            };
        }

        // Validate PACS002 response
        const validationResult = this.validatePacsResponse(pacsResponse, scenario);
        
        return {
            success: validationResult.isValid,
            error: validationResult.error,
            response,
            pacsResponse: pacsResponse.payload,
            validation: validationResult
        };
    }

    generateTestMessage(scenario) {
        const messageId = uuidv4();
        const timestamp = new Date().toISOString();
        
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${messageId}</MsgId>
      <CreDtTm>${timestamp}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INST-${Date.now()}</InstrId>
        <EndToEndId>E2E-${Date.now()}</EndToEndId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${scenario.currency}">${scenario.amount.toFixed(2)}</IntrBkSttlmAmt>
      <Dbtr>
        <Nm>Test Debtor ${scenario.name}</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <PstCd>018956</PstCd>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>123456789012</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>OCBCSGSG</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>Test Creditor ${scenario.name}</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <PstCd>567890</PstCd>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${scenario.expectedStatus === 'RJCT' ? 'INVALID123' : '999888777666'}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>Test payment for ${scenario.description}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

        return {
            messageId,
            xmlPayload,
            messageType: scenario.messageType,
            metadata: {
                country: 'SG',
                currency: scenario.currency,
                testScenario: scenario.name
            }
        };
    }

    async sendGrpcMessage(testMessage) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + CONFIG.TIMEOUTS.GRPC_CALL;
            
            this.grpcClient.ProcessMessage({
                message_type: testMessage.messageType,
                xml_payload: testMessage.xmlPayload,
                metadata: testMessage.metadata
            }, { deadline }, (error, response) => {
                if (error) {
                    reject(new Error(`gRPC call failed: ${error.message}`));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async waitForPacsResponse(messageId, timeout = CONFIG.TIMEOUTS.KAFKA_MESSAGE) {
        const startTime = Date.now();
        const checkInterval = 1000;
        
        while (Date.now() - startTime < timeout) {
            const message = this.messageTracker.get(messageId);
            if (message) {
                return message;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        return null;
    }

    validatePacsResponse(pacsResponse, scenario) {
        const payload = pacsResponse.payload;
        
        // Basic structure validation
        if (!payload || !payload.status) {
            return {
                isValid: false,
                error: 'Invalid PACS002 response structure'
            };
        }

        // Status validation
        if (payload.status !== scenario.expectedStatus) {
            return {
                isValid: false,
                error: `Expected status '${scenario.expectedStatus}', got '${payload.status}'`
            };
        }

        // XML payload validation
        if (!payload.xmlPayload || !payload.xmlPayload.includes('FIToFIPmtStsRpt')) {
            return {
                isValid: false,
                error: 'Invalid PACS002 XML structure'
            };
        }

        return {
            isValid: true,
            error: null
        };
    }

    async cleanup() {
        if (this.kafkaConsumer) {
            await this.kafkaConsumer.disconnect();
        }
        console.log('✅ Test runner cleanup completed');
    }
}

// Main execution
async function main() {
    const testRunner = new PACS002TestRunner();
    
    try {
        const initialized = await testRunner.initialize();
        
        if (!initialized) {
            console.error('❌ Failed to initialize test runner');
            process.exit(1);
        }

        const results = await testRunner.runAllTests();
        
        console.log('\n📈 Detailed Results:');
        results.results.forEach((result, index) => {
            console.log(`${index + 1}. ${result.scenario}: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
            if (!result.success) {
                console.log(`   Error: ${result.error}`);
            }
        });

        process.exit(results.failed > 0 ? 1 : 0);
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    } finally {
        await testRunner.cleanup();
    }
}

// Run the tests
if (require.main === module) {
    main();
}

module.exports = { PACS002TestRunner }; 