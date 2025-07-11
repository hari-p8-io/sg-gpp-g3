#!/usr/bin/env node

const { Kafka } = require('kafkajs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { XMLParser } = require('fast-xml-parser');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Test configuration
const CONFIG = {
    KAFKA_BROKERS: ['localhost:9092'],
    GRPC_ENDPOINTS: {
        requestHandler: 'localhost:50051',
        enrichment: 'localhost:50052',
        validation: 'localhost:50053',
        accountLookup: 'localhost:50059',
        referenceData: 'localhost:50060'
    },
    KAFKA_TOPICS: {
        pacsResponse: 'pacs-response-messages',
        accountingCompletion: 'accounting-completion-messages',
        validatedMessages: 'validated-messages',
        accountingMessages: 'accounting-messages'
    },
    HTTP_ENDPOINTS: {
        orchestrator: 'http://localhost:3004',
        accounting: 'http://localhost:8002',
        limitCheck: 'http://localhost:3006'
    },
    TIMEOUTS: {
        service: 30000,
        message: 15000,
        kafka: 20000
    }
};

// Test scenarios
const TEST_SCENARIOS = [
    {
        name: 'VAM Account - High Value Transaction',
        description: 'VAM account with high-value transaction requiring GROUPLIMIT',
        messageType: 'PACS008',
        cdtrAcctId: '999888777666',
        dbtrAcctId: '123456789012',
        amount: 75000.00,
        currency: 'SGD',
        expectedAuthMethod: 'GROUPLIMIT',
        expectedSystem: 'VAM',
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → accounting → limitcheck',
        expectedPacs002Status: 'ACSC' // Accepted Settlement Complete
    },
    {
        name: 'Regular Account - Medium Value Transaction',
        description: 'Regular account with medium-value transaction',
        messageType: 'PACS008',
        cdtrAcctId: '123456789012',
        dbtrAcctId: '987654321098',
        amount: 5000.00,
        currency: 'SGD',
        expectedAuthMethod: 'AFPONLY',
        expectedSystem: 'MEPS',
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → accounting',
        expectedPacs002Status: 'ACSC'
    },
    {
        name: 'Corporate Account - FAST Transfer',
        description: 'Corporate account with FAST transfer',
        messageType: 'PACS008',
        cdtrAcctId: '888777666555',
        dbtrAcctId: '555666777888',
        amount: 25000.00,
        currency: 'SGD',
        expectedAuthMethod: 'AFPTHENLIMIT',
        expectedSystem: 'FAST',
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → accounting',
        expectedPacs002Status: 'ACSC'
    },
    {
        name: 'Payment Reversal',
        description: 'PACS007 payment reversal message',
        messageType: 'PACS007',
        cdtrAcctId: '999888777666',
        dbtrAcctId: '123456789012',
        amount: 10000.00,
        currency: 'SGD',
        expectedAuthMethod: 'GROUPLIMIT',
        expectedSystem: 'VAM',
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → accounting',
        expectedPacs002Status: 'ACSC'
    },
    {
        name: 'Error Scenario - Invalid Account',
        description: 'Test with invalid account to trigger error response',
        messageType: 'PACS008',
        cdtrAcctId: 'INVALID123',
        dbtrAcctId: '123456789012',
        amount: 1000.00,
        currency: 'SGD',
        expectedAuthMethod: null,
        expectedSystem: null,
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → accounting',
        expectedPacs002Status: 'RJCT' // Rejected
    }
];

class PACS002EnhancedFlowTest {
    constructor() {
        this.kafka = null;
        this.pacsResponseConsumer = null;
        this.requestHandlerClient = null;
        this.testResults = [];
        this.kafkaMessageTracker = new Map();
        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            parseTagValue: false,
            parseAttributeValue: false,
            trimValues: true
        });
    }

    async initialize() {
        console.log(`${colors.cyan}🚀 Initializing PACS.002 Enhanced Flow Test${colors.reset}`);
        
        // Initialize Kafka
        await this.initializeKafka();
        
        // Initialize gRPC client
        await this.initializeGrpcClient();
        
        // Check service health
        await this.checkServicesHealth();
        
        console.log(`${colors.green}✅ Test initialization completed${colors.reset}`);
    }

    async initializeKafka() {
        console.log(`${colors.blue}📡 Initializing Kafka client...${colors.reset}`);
        
        this.kafka = new Kafka({
            clientId: 'pacs002-test-client',
            brokers: CONFIG.KAFKA_BROKERS,
            retry: {
                retries: 3,
                initialRetryTime: 1000
            }
        });

        // Create consumer for PACS response messages
        this.pacsResponseConsumer = this.kafka.consumer({ 
            groupId: 'pacs002-test-consumer-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.pacsResponseConsumer.connect();
        await this.pacsResponseConsumer.subscribe({ 
            topic: CONFIG.KAFKA_TOPICS.pacsResponse,
            fromBeginning: false
        });

        // Start consuming messages
        await this.pacsResponseConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = message.value?.toString();
                    if (!messageValue) return;

                    const pacsResponse = JSON.parse(messageValue);
                    const headers = this.extractHeaders(message.headers);
                    
                    console.log(`${colors.magenta}📥 Received PACS response: ${pacsResponse.messageId || 'unknown'}${colors.reset}`);
                    
                    // Store the message for validation
                    this.kafkaMessageTracker.set(pacsResponse.messageId, {
                        topic,
                        partition,
                        headers,
                        payload: pacsResponse,
                        timestamp: new Date().toISOString()
                    });

                } catch (error) {
                    console.error(`${colors.red}❌ Error processing Kafka message:${colors.reset}`, error);
                }
            }
        });

        console.log(`${colors.green}✅ Kafka consumer initialized for topic: ${CONFIG.KAFKA_TOPICS.pacsResponse}${colors.reset}`);
    }

    async initializeGrpcClient() {
        console.log(`${colors.blue}📡 Initializing gRPC client...${colors.reset}`);
        
        const protoPath = path.join(__dirname, '../fast-requesthandler-service/proto/message_handler.proto');
        const packageDefinition = protoLoader.loadSync(protoPath, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });

        const proto = grpc.loadPackageDefinition(packageDefinition);
        this.requestHandlerClient = new proto.gpp.g3.requesthandler.MessageHandler(
            CONFIG.GRPC_ENDPOINTS.requestHandler,
            grpc.credentials.createInsecure()
        );

        console.log(`${colors.green}✅ gRPC client initialized${colors.reset}`);
    }

    async checkServicesHealth() {
        console.log(`${colors.blue}🏥 Checking service health...${colors.reset}`);
        
        const healthChecks = [
            { name: 'Request Handler', url: CONFIG.GRPC_ENDPOINTS.requestHandler },
            { name: 'Orchestrator', url: CONFIG.HTTP_ENDPOINTS.orchestrator },
            { name: 'Accounting', url: CONFIG.HTTP_ENDPOINTS.accounting }
        ];

        for (const service of healthChecks) {
            try {
                if (service.url.startsWith('http')) {
                    const response = await fetch(`${service.url}/health`);
                    if (response.ok) {
                        console.log(`${colors.green}✅ ${service.name} is healthy${colors.reset}`);
                    } else {
                        console.log(`${colors.yellow}⚠️  ${service.name} returned ${response.status}${colors.reset}`);
                    }
                } else {
                    // For gRPC services, we'll check during first test
                    console.log(`${colors.cyan}ℹ️  ${service.name} will be checked during test${colors.reset}`);
                }
            } catch (error) {
                console.log(`${colors.red}❌ ${service.name} health check failed: ${error.message}${colors.reset}`);
            }
        }
    }

    generatePacsMessage(scenario) {
        const messageId = uuidv4();
        const originalMessageId = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const baseXml = scenario.messageType === 'PACS007' ? 
            this.generatePacs007Xml(scenario, originalMessageId) : 
            this.generatePacs008Xml(scenario, originalMessageId);

        return {
            messageId,
            originalMessageId,
            messageType: scenario.messageType,
            xmlPayload: baseXml,
            metadata: {
                country: 'SG',
                currency: scenario.currency,
                testScenario: scenario.name,
                timestamp: new Date().toISOString()
            }
        };
    }

    generatePacs008Xml(scenario, originalMessageId) {
        const timestamp = new Date().toISOString();
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${originalMessageId}</MsgId>
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
            <Id>${scenario.dbtrAcctId}</Id>
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
            <Id>${scenario.cdtrAcctId}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>Test payment for ${scenario.description}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
    }

    generatePacs007Xml(scenario, originalMessageId) {
        const timestamp = new Date().toISOString();
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.10">
  <FIToFIPmtRvsl>
    <GrpHdr>
      <MsgId>${originalMessageId}</MsgId>
      <CreDtTm>${timestamp}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <TxInf>
      <RvslId>REV-${Date.now()}</RvslId>
      <OrgnlEndToEndId>E2E-ORIGINAL-${Date.now()}</OrgnlEndToEndId>
      <OrgnlTxId>TXN-ORIGINAL-${Date.now()}</OrgnlTxId>
      <OrgnlIntrBkSttlmAmt Ccy="${scenario.currency}">${scenario.amount.toFixed(2)}</OrgnlIntrBkSttlmAmt>
      <RvslRsnInf>
        <Rsn>
          <Cd>AC03</Cd>
        </Rsn>
        <AddtlInf>Invalid account number</AddtlInf>
      </RvslRsnInf>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>`;
    }

    async runTest(scenario) {
        console.log(`${colors.cyan}🧪 Running test: ${scenario.name}${colors.reset}`);
        console.log(`${colors.blue}📝 ${scenario.description}${colors.reset}`);
        
        const testResult = {
            scenario: scenario.name,
            description: scenario.description,
            startTime: new Date().toISOString(),
            success: false,
            steps: [],
            errors: [],
            pacsResponse: null,
            timings: {},
            validations: {}
        };

        try {
            // Generate test message
            const testMessage = this.generatePacsMessage(scenario);
            const stepStartTime = Date.now();
            
            console.log(`${colors.magenta}📨 Sending ${scenario.messageType} message: ${testMessage.messageId}${colors.reset}`);
            
            // Clear any previous messages for this test
            this.kafkaMessageTracker.clear();
            
            // Send message to request handler
            const response = await this.sendMessage(testMessage);
            const processingTime = Date.now() - stepStartTime;
            
            testResult.steps.push({
                step: 'Message Sent',
                timestamp: new Date().toISOString(),
                processingTime,
                success: response.success,
                data: response
            });

            testResult.timings.messageSent = processingTime;
            
            if (!response.success) {
                testResult.errors.push(`Message processing failed: ${response.error}`);
                if (scenario.expectedPacs002Status === 'RJCT') {
                    console.log(`${colors.yellow}⚠️  Expected failure for error scenario${colors.reset}`);
                } else {
                    console.log(`${colors.red}❌ Message processing failed: ${response.error}${colors.reset}`);
                    return testResult;
                }
            } else {
                console.log(`${colors.green}✅ Message sent successfully: ${response.messageId}${colors.reset}`);
                console.log(`${colors.cyan}   PUID: ${response.puid}${colors.reset}`);
            }

            // Wait for PACS.002 response
            const pacsResponse = await this.waitForPacsResponse(testMessage.messageId, CONFIG.TIMEOUTS.message);
            
            if (pacsResponse) {
                testResult.pacsResponse = pacsResponse;
                testResult.steps.push({
                    step: 'PACS.002 Response Received',
                    timestamp: new Date().toISOString(),
                    success: true,
                    data: pacsResponse
                });

                // Validate PACS.002 response
                await this.validatePacsResponse(pacsResponse, scenario, testResult);
                
                console.log(`${colors.green}✅ PACS.002 response received and validated${colors.reset}`);
                testResult.success = true;
                
            } else {
                testResult.errors.push('No PACS.002 response received within timeout');
                console.log(`${colors.red}❌ No PACS.002 response received within ${CONFIG.TIMEOUTS.message}ms${colors.reset}`);
            }

        } catch (error) {
            testResult.errors.push(`Test execution failed: ${error.message}`);
            console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
        }

        testResult.endTime = new Date().toISOString();
        testResult.duration = Date.now() - new Date(testResult.startTime).getTime();
        
        return testResult;
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            const request = {
                message_type: message.messageType,
                xml_payload: message.xmlPayload,
                metadata: message.metadata
            };

            const deadline = new Date(Date.now() + CONFIG.TIMEOUTS.service);
            
            this.requestHandlerClient.ProcessMessage(request, { deadline }, (error, response) => {
                if (error) {
                    resolve({ success: false, error: error.message });
                } else {
                    resolve({
                        success: response.success,
                        messageId: response.message_id,
                        puid: response.puid,
                        error: response.error_message
                    });
                }
            });
        });
    }

    async waitForPacsResponse(messageId, timeout) {
        console.log(`${colors.blue}⏳ Waiting for PACS.002 response for message: ${messageId}${colors.reset}`);
        
        const startTime = Date.now();
        const checkInterval = 1000;
        
        while (Date.now() - startTime < timeout) {
            const response = this.kafkaMessageTracker.get(messageId);
            if (response) {
                console.log(`${colors.green}✅ PACS.002 response found (${Date.now() - startTime}ms)${colors.reset}`);
                return response;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        console.log(`${colors.red}❌ PACS.002 response timeout after ${timeout}ms${colors.reset}`);
        return null;
    }

    async validatePacsResponse(pacsResponse, scenario, testResult) {
        console.log(`${colors.blue}🔍 Validating PACS.002 response...${colors.reset}`);
        
        const validations = {
            messageIdMatches: false,
            hasCorrectStatus: false,
            hasValidXml: false,
            hasCorrectAmount: false,
            hasCorrectAccounts: false,
            hasValidTimestamp: false
        };

        try {
            // Check message ID
            if (pacsResponse.payload.messageId) {
                validations.messageIdMatches = true;
                console.log(`${colors.green}✅ Message ID matches${colors.reset}`);
            } else {
                console.log(`${colors.red}❌ Message ID missing or doesn't match${colors.reset}`);
            }

            // Check status
            if (pacsResponse.payload.status === scenario.expectedPacs002Status) {
                validations.hasCorrectStatus = true;
                console.log(`${colors.green}✅ Status matches expected: ${scenario.expectedPacs002Status}${colors.reset}`);
            } else {
                console.log(`${colors.red}❌ Status mismatch. Expected: ${scenario.expectedPacs002Status}, Got: ${pacsResponse.payload.status}${colors.reset}`);
            }

            // Check XML structure
            if (pacsResponse.payload.xmlPayload) {
                try {
                    const parsedXml = this.xmlParser.parse(pacsResponse.payload.xmlPayload);
                    if (parsedXml.Document && parsedXml.Document.FIToFIPmtStsRpt) {
                        validations.hasValidXml = true;
                        console.log(`${colors.green}✅ PACS.002 XML structure is valid${colors.reset}`);
                        
                        // Preview XML structure
                        console.log(`${colors.cyan}📋 PACS.002 XML Preview:${colors.reset}`);
                        console.log(this.formatXmlPreview(pacsResponse.payload.xmlPayload));
                    } else {
                        console.log(`${colors.red}❌ Invalid PACS.002 XML structure${colors.reset}`);
                    }
                } catch (error) {
                    console.log(`${colors.red}❌ Failed to parse PACS.002 XML: ${error.message}${colors.reset}`);
                }
            } else {
                console.log(`${colors.red}❌ No XML payload in PACS.002 response${colors.reset}`);
            }

            // Check amount if present
            if (pacsResponse.payload.amount) {
                const expectedAmount = scenario.amount.toFixed(2);
                const actualAmount = parseFloat(pacsResponse.payload.amount).toFixed(2);
                if (actualAmount === expectedAmount) {
                    validations.hasCorrectAmount = true;
                    console.log(`${colors.green}✅ Amount matches: ${expectedAmount} ${scenario.currency}${colors.reset}`);
                } else {
                    console.log(`${colors.red}❌ Amount mismatch. Expected: ${expectedAmount}, Got: ${actualAmount}${colors.reset}`);
                }
            }

            // Check accounts if present
            if (pacsResponse.payload.creditorAccount === scenario.cdtrAcctId) {
                validations.hasCorrectAccounts = true;
                console.log(`${colors.green}✅ Creditor account matches${colors.reset}`);
            } else {
                console.log(`${colors.yellow}⚠️  Creditor account info not available or doesn't match${colors.reset}`);
            }

            // Check timestamp
            if (pacsResponse.payload.timestamp) {
                const responseTime = new Date(pacsResponse.payload.timestamp);
                const now = new Date();
                const timeDiff = Math.abs(now.getTime() - responseTime.getTime());
                if (timeDiff < 300000) { // 5 minutes
                    validations.hasValidTimestamp = true;
                    console.log(`${colors.green}✅ Timestamp is valid and recent${colors.reset}`);
                } else {
                    console.log(`${colors.red}❌ Timestamp seems too old: ${pacsResponse.payload.timestamp}${colors.reset}`);
                }
            }

        } catch (error) {
            console.log(`${colors.red}❌ Validation error: ${error.message}${colors.reset}`);
        }

        testResult.validations = validations;
        
        const passedValidations = Object.values(validations).filter(v => v).length;
        const totalValidations = Object.keys(validations).length;
        
        console.log(`${colors.cyan}📊 Validation Summary: ${passedValidations}/${totalValidations} passed${colors.reset}`);
        
        return validations;
    }

    formatXmlPreview(xmlString) {
        const lines = xmlString.split('\n');
        const preview = lines.slice(0, 10).map(line => `   ${line}`).join('\n');
        return preview + (lines.length > 10 ? `\n   ... (${lines.length - 10} more lines)` : '');
    }

    extractHeaders(kafkaHeaders) {
        const headers = {};
        for (const [key, value] of Object.entries(kafkaHeaders)) {
            headers[key] = value.toString();
        }
        return headers;
    }

    async runAllTests() {
        console.log(`${colors.cyan}🚀 Starting PACS.002 Enhanced Flow Test Suite${colors.reset}`);
        console.log(`${colors.blue}📋 Running ${TEST_SCENARIOS.length} test scenarios${colors.reset}`);
        
        for (const scenario of TEST_SCENARIOS) {
            const testResult = await this.runTest(scenario);
            this.testResults.push(testResult);
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Print summary
        this.printTestSummary();
        
        return this.testResults;
    }

    printTestSummary() {
        console.log(`${colors.cyan}📊 Test Summary${colors.reset}`);
        console.log(`${colors.blue}═════════════════════════════════════════════════════════════════════${colors.reset}`);
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`${colors.white}Total Tests: ${totalTests}${colors.reset}`);
        console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
        console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
        console.log(`${colors.cyan}Success Rate: ${((passedTests/totalTests)*100).toFixed(1)}%${colors.reset}`);
        
        console.log(`${colors.blue}\n📋 Test Results:${colors.reset}`);
        
        for (const result of this.testResults) {
            const status = result.success ? `${colors.green}✅ PASS${colors.reset}` : `${colors.red}❌ FAIL${colors.reset}`;
            console.log(`${status} ${result.scenario}`);
            
            if (result.pacsResponse) {
                console.log(`     📨 PACS.002 Status: ${result.pacsResponse.payload.status}`);
                console.log(`     ⏱️  Duration: ${result.duration}ms`);
                
                const validations = result.validations;
                if (validations) {
                    const passed = Object.values(validations).filter(v => v).length;
                    const total = Object.keys(validations).length;
                    console.log(`     ✅ Validations: ${passed}/${total}`);
                }
            }
            
            if (result.errors.length > 0) {
                console.log(`     ${colors.red}❌ Errors: ${result.errors.join(', ')}${colors.reset}`);
            }
        }
        
        console.log(`${colors.blue}═════════════════════════════════════════════════════════════════════${colors.reset}`);
    }

    async cleanup() {
        console.log(`${colors.yellow}🧹 Cleaning up test resources...${colors.reset}`);
        
        try {
            if (this.pacsResponseConsumer) {
                await this.pacsResponseConsumer.disconnect();
            }
            
            if (this.requestHandlerClient) {
                this.requestHandlerClient.close();
            }
            
            console.log(`${colors.green}✅ Cleanup completed${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Cleanup error: ${error.message}${colors.reset}`);
        }
    }
}

// Main execution
async function main() {
    const test = new PACS002EnhancedFlowTest();
    
    try {
        await test.initialize();
        await test.runAllTests();
        
        const results = test.testResults;
        const allPassed = results.every(r => r.success);
        
        if (allPassed) {
            console.log(`${colors.green}🎉 All tests passed! PACS.002 enhanced flow is working correctly.${colors.reset}`);
            process.exit(0);
        } else {
            console.log(`${colors.red}❌ Some tests failed. Please review the results above.${colors.reset}`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
        process.exit(1);
    } finally {
        await test.cleanup();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log(`${colors.yellow}🛑 Received SIGINT, shutting down gracefully...${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`${colors.yellow}🛑 Received SIGTERM, shutting down gracefully...${colors.reset}`);
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = PACS002EnhancedFlowTest; 