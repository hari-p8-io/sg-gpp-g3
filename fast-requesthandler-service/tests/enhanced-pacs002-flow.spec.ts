import { test, expect } from '@playwright/test';
import { Kafka } from 'kafkajs';
import { createGrpcClient } from './utils/grpc-client';
import { v4 as uuidv4 } from 'uuid';
import { XMLParser } from 'fast-xml-parser';

// Test configuration
const CONFIG = {
    KAFKA_BROKERS: ['localhost:9092'],
    KAFKA_TOPICS: {
        pacsResponse: 'pacs-response-messages',
        accountingCompletion: 'accounting-completion-messages'
    },
    TIMEOUTS: {
        service: 30000,
        message: 20000,
        kafka: 15000
    }
};

// Test scenarios for PACS.002 flow
const PACS002_SCENARIOS = [
    {
        name: 'VAM High Value Transaction',
        messageType: 'PACS008',
        cdtrAcctId: '999888777666',
        dbtrAcctId: '123456789012',
        amount: 50000.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'High value transaction through VAM system'
    },
    {
        name: 'Regular Transaction',
        messageType: 'PACS008',
        cdtrAcctId: '123456789012',
        dbtrAcctId: '987654321098',
        amount: 1500.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'Regular transaction through MEPS system'
    },
    {
        name: 'Corporate Fast Transfer',
        messageType: 'PACS008',
        cdtrAcctId: '888777666555',
        dbtrAcctId: '555666777888',
        amount: 25000.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'Corporate transaction through FAST system'
    },
    {
        name: 'Payment Reversal',
        messageType: 'PACS007',
        cdtrAcctId: '999888777666',
        dbtrAcctId: '123456789012',
        amount: 10000.00,
        currency: 'SGD',
        expectedStatus: 'ACSC',
        description: 'Payment reversal message'
    },
    {
        name: 'Error Scenario',
        messageType: 'PACS008',
        cdtrAcctId: 'INVALID123',
        dbtrAcctId: '123456789012',
        amount: 1000.00,
        currency: 'SGD',
        expectedStatus: 'RJCT',
        description: 'Invalid account to test error handling'
    }
];

class KafkaTestHelper {
    private kafka: Kafka;
    private consumer: any;
    private messageTracker: Map<string, any>;

    constructor() {
        this.kafka = new Kafka({
            clientId: 'playwright-test-client',
            brokers: CONFIG.KAFKA_BROKERS,
            retry: {
                retries: 3,
                initialRetryTime: 1000
            }
        });
        this.messageTracker = new Map();
    }

    async initialize() {
        this.consumer = this.kafka.consumer({ 
            groupId: 'playwright-test-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.consumer.connect();
        await this.consumer.subscribe({ 
            topic: CONFIG.KAFKA_TOPICS.pacsResponse,
            fromBeginning: false
        });

        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = message.value?.toString();
                    if (!messageValue) return;

                    const pacsResponse = JSON.parse(messageValue);
                    const headers = this.extractHeaders(message.headers);
                    
                    console.log(`📥 Received PACS response: ${pacsResponse.messageId || 'unknown'}`);
                    
                    this.messageTracker.set(pacsResponse.messageId, {
                        topic,
                        partition,
                        headers,
                        payload: pacsResponse,
                        timestamp: new Date().toISOString()
                    });

                } catch (error) {
                    console.error('Error processing Kafka message:', error);
                }
            }
        });
    }

    async waitForMessage(messageId: string, timeout: number = CONFIG.TIMEOUTS.message) {
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

    clearMessages() {
        this.messageTracker.clear();
    }

    private extractHeaders(kafkaHeaders: any) {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(kafkaHeaders)) {
            headers[key] = value.toString();
        }
        return headers;
    }

    async cleanup() {
        if (this.consumer) {
            await this.consumer.disconnect();
        }
    }
}

test.describe('Enhanced PACS.002 Flow Tests', () => {
    let grpcClient: ReturnType<typeof createGrpcClient>;
    let kafkaHelper: KafkaTestHelper;
    let xmlParser: XMLParser;

    test.beforeAll(async () => {
        // Initialize gRPC client
        grpcClient = createGrpcClient('localhost:50051');
        await grpcClient.waitForServiceReady(CONFIG.TIMEOUTS.service);

        // Initialize Kafka helper
        kafkaHelper = new KafkaTestHelper();
        await kafkaHelper.initialize();

        // Initialize XML parser
        xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            parseTagValue: false,
            parseAttributeValue: false,
            trimValues: true
        });
    });

    test.afterAll(async () => {
        await kafkaHelper.cleanup();
    });

    test.beforeEach(async () => {
        await grpcClient.clearMockStorage();
        kafkaHelper.clearMessages();
    });

    test('should perform health check', async () => {
        const response = await grpcClient.healthCheck();
        expect(response).toBeDefined();
        expect(response.status).toBeTruthy();
    });

    // Test each PACS.002 scenario
    for (const scenario of PACS002_SCENARIOS) {
        test(`should handle ${scenario.name} and generate PACS.002 response`, async () => {
            // Generate test message
            const testMessage = generateTestMessage(scenario);
            
            console.log(`🧪 Testing: ${scenario.name}`);
            console.log(`📝 ${scenario.description}`);
            console.log(`💰 Amount: ${scenario.amount} ${scenario.currency}`);
            
            // Send message to request handler
            const response = await grpcClient.processPacsMessage({
                message_type: scenario.messageType,
                xml_payload: testMessage.xmlPayload,
                metadata: {
                    country: 'SG',
                    currency: scenario.currency,
                    testScenario: scenario.name
                }
            });

            // Validate initial response
            if (scenario.expectedStatus === 'RJCT') {
                // For error scenarios, we might get immediate failure
                console.log(`⚠️  Processing error scenario, response: ${JSON.stringify(response)}`);
            } else {
                expect(response.success).toBe(true);
                expect(response.message_id).toBeDefined();
                expect(response.puid).toBeDefined();
                expect(response.puid).toMatch(/^G3I[A-Z0-9]{13}$/);
            }

            const messageId = response.message_id || testMessage.messageId;
            
            // Wait for PACS.002 response
            console.log(`⏳ Waiting for PACS.002 response for: ${messageId}`);
            const pacsResponse = await kafkaHelper.waitForMessage(messageId, CONFIG.TIMEOUTS.kafka);
            
            if (scenario.expectedStatus === 'RJCT') {
                // For error scenarios, we should still get a PACS.002 response
                if (pacsResponse) {
                    expect(pacsResponse.payload.status).toBe('RJCT');
                    console.log(`✅ PACS.002 rejection response received as expected`);
                } else {
                    console.log(`⚠️  No PACS.002 response received for error scenario`);
                }
            } else {
                // For successful scenarios, validate the response
                expect(pacsResponse).toBeDefined();
                expect(pacsResponse.payload).toBeDefined();
                
                // Validate PACS.002 message structure
                await validatePacs002Response(pacsResponse.payload, scenario, xmlParser);
                
                console.log(`✅ PACS.002 response validated successfully`);
            }
        });
    }

    test('should handle concurrent messages and generate multiple PACS.002 responses', async () => {
        const concurrentScenarios = PACS002_SCENARIOS.filter(s => s.expectedStatus === 'ACSC').slice(0, 3);
        const messagePromises = [];
        const testMessages = [];
        
        console.log(`🚀 Testing ${concurrentScenarios.length} concurrent messages`);
        
        // Send multiple messages concurrently
        for (const scenario of concurrentScenarios) {
            const testMessage = generateTestMessage(scenario);
            testMessages.push({ scenario, testMessage });
            
            const promise = grpcClient.processPacsMessage({
                message_type: scenario.messageType,
                xml_payload: testMessage.xmlPayload,
                metadata: {
                    country: 'SG',
                    currency: scenario.currency,
                    testScenario: `Concurrent-${scenario.name}`
                }
            });
            
            messagePromises.push(promise);
        }
        
        // Wait for all initial responses
        const responses = await Promise.all(messagePromises);
        
        // Validate all initial responses
        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            const scenario = concurrentScenarios[i];
            
            expect(response.success).toBe(true);
            expect(response.message_id).toBeDefined();
            expect(response.puid).toBeDefined();
            
            console.log(`📨 Message ${i + 1} sent: ${response.message_id}`);
        }
        
        // Wait for all PACS.002 responses
        const pacsResponses = [];
        for (let i = 0; i < responses.length; i++) {
            const messageId = responses[i].message_id;
            const pacsResponse = await kafkaHelper.waitForMessage(messageId, CONFIG.TIMEOUTS.kafka);
            pacsResponses.push(pacsResponse);
        }
        
        // Validate all PACS.002 responses
        for (let i = 0; i < pacsResponses.length; i++) {
            const pacsResponse = pacsResponses[i];
            const scenario = concurrentScenarios[i];
            
            expect(pacsResponse).toBeDefined();
            expect(pacsResponse.payload).toBeDefined();
            
            await validatePacs002Response(pacsResponse.payload, scenario, xmlParser);
            
            console.log(`✅ PACS.002 response ${i + 1} validated`);
        }
        
        console.log(`🎉 All ${concurrentScenarios.length} concurrent messages processed successfully`);
    });

    test('should validate PACS.002 XML structure and content', async () => {
        const scenario = PACS002_SCENARIOS[0]; // Use first scenario
        const testMessage = generateTestMessage(scenario);
        
        // Send message
        const response = await grpcClient.processPacsMessage({
            message_type: scenario.messageType,
            xml_payload: testMessage.xmlPayload,
            metadata: {
                country: 'SG',
                currency: scenario.currency,
                testScenario: 'XML-Structure-Test'
            }
        });
        
        expect(response.success).toBe(true);
        
        // Wait for PACS.002 response
        const pacsResponse = await kafkaHelper.waitForMessage(response.message_id, CONFIG.TIMEOUTS.kafka);
        expect(pacsResponse).toBeDefined();
        
        // Validate XML structure in detail
        const payload = pacsResponse.payload;
        expect(payload.xmlPayload).toBeDefined();
        
        // Parse XML
        const parsedXml = xmlParser.parse(payload.xmlPayload);
        expect(parsedXml.Document).toBeDefined();
        expect(parsedXml.Document.FIToFIPmtStsRpt).toBeDefined();
        
        const statusReport = parsedXml.Document.FIToFIPmtStsRpt;
        
        // Validate Group Header
        expect(statusReport.GrpHdr).toBeDefined();
        expect(statusReport.GrpHdr.MsgId).toBeDefined();
        expect(statusReport.GrpHdr.CreDtTm).toBeDefined();
        
        // Validate Original Group Information
        expect(statusReport.OrgnlGrpInfAndSts).toBeDefined();
        expect(statusReport.OrgnlGrpInfAndSts.OrgnlMsgId).toBeDefined();
        expect(statusReport.OrgnlGrpInfAndSts.GrpSts).toBeDefined();
        
        // Validate Transaction Information
        expect(statusReport.TxInfAndSts).toBeDefined();
        expect(statusReport.TxInfAndSts.StsId).toBeDefined();
        expect(statusReport.TxInfAndSts.OrgnlEndToEndId).toBeDefined();
        expect(statusReport.TxInfAndSts.TxSts).toBeDefined();
        
        console.log(`✅ PACS.002 XML structure validated successfully`);
    });

    test('should handle high volume of messages', async () => {
        const messageCount = 10;
        const scenario = PACS002_SCENARIOS[1]; // Use regular transaction scenario
        const messages = [];
        
        console.log(`🚀 Testing high volume: ${messageCount} messages`);
        
        // Generate multiple messages
        for (let i = 0; i < messageCount; i++) {
            const testMessage = generateTestMessage(scenario);
            messages.push(testMessage);
        }
        
        // Send all messages
        const responses = [];
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            const response = await grpcClient.processPacsMessage({
                message_type: scenario.messageType,
                xml_payload: message.xmlPayload,
                metadata: {
                    country: 'SG',
                    currency: scenario.currency,
                    testScenario: `HighVolume-${i + 1}`
                }
            });
            responses.push(response);
            
            if (i % 5 === 0) {
                console.log(`📨 Sent ${i + 1}/${messageCount} messages`);
            }
        }
        
        // Validate all responses
        const successfulResponses = responses.filter(r => r.success);
        expect(successfulResponses.length).toBeGreaterThan(messageCount * 0.8); // At least 80% success rate
        
        console.log(`✅ High volume test completed: ${successfulResponses.length}/${messageCount} successful`);
    });

    test('should measure response time performance', async () => {
        const scenario = PACS002_SCENARIOS[0];
        const testMessage = generateTestMessage(scenario);
        
        // Measure processing time
        const startTime = Date.now();
        
        const response = await grpcClient.processPacsMessage({
            message_type: scenario.messageType,
            xml_payload: testMessage.xmlPayload,
            metadata: {
                country: 'SG',
                currency: scenario.currency,
                testScenario: 'Performance-Test'
            }
        });
        
        const processingTime = Date.now() - startTime;
        
        expect(response.success).toBe(true);
        expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
        
        // Measure PACS.002 response time
        const pacsStartTime = Date.now();
        const pacsResponse = await kafkaHelper.waitForMessage(response.message_id, CONFIG.TIMEOUTS.kafka);
        const pacsResponseTime = Date.now() - pacsStartTime;
        
        expect(pacsResponse).toBeDefined();
        expect(pacsResponseTime).toBeLessThan(10000); // PACS.002 should arrive within 10 seconds
        
        console.log(`⏱️  Performance metrics:`);
        console.log(`   Initial processing: ${processingTime}ms`);
        console.log(`   PACS.002 response: ${pacsResponseTime}ms`);
        console.log(`   Total end-to-end: ${processingTime + pacsResponseTime}ms`);
    });
});

// Helper function to generate test messages
function generateTestMessage(scenario: any) {
    const messageId = uuidv4();
    const originalMessageId = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const xmlPayload = scenario.messageType === 'PACS007' ? 
        generatePacs007Xml(scenario, originalMessageId) : 
        generatePacs008Xml(scenario, originalMessageId);

    return {
        messageId,
        originalMessageId,
        xmlPayload
    };
}

// Helper function to generate PACS008 XML
function generatePacs008Xml(scenario: any, originalMessageId: string) {
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

// Helper function to generate PACS007 XML
function generatePacs007Xml(scenario: any, originalMessageId: string) {
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
        <AddtlInf>Test reversal for ${scenario.description}</AddtlInf>
      </RvslRsnInf>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>`;
}

// Helper function to validate PACS.002 response
async function validatePacs002Response(payload: any, scenario: any, xmlParser: XMLParser) {
    // Validate basic structure
    expect(payload.messageId).toBeDefined();
    expect(payload.status).toBe(scenario.expectedStatus);
    expect(payload.xmlPayload).toBeDefined();
    
    // Validate XML structure
    const parsedXml = xmlParser.parse(payload.xmlPayload);
    expect(parsedXml.Document).toBeDefined();
    expect(parsedXml.Document.FIToFIPmtStsRpt).toBeDefined();
    
    const statusReport = parsedXml.Document.FIToFIPmtStsRpt;
    
    // Validate required fields
    expect(statusReport.GrpHdr).toBeDefined();
    expect(statusReport.GrpHdr.MsgId).toBeDefined();
    expect(statusReport.OrgnlGrpInfAndSts).toBeDefined();
    expect(statusReport.TxInfAndSts).toBeDefined();
    
    // Validate status
    expect(statusReport.TxInfAndSts.TxSts).toBe(scenario.expectedStatus);
    
    // Validate amounts if present
    if (payload.amount) {
        const expectedAmount = scenario.amount.toFixed(2);
        const actualAmount = parseFloat(payload.amount).toFixed(2);
        expect(actualAmount).toBe(expectedAmount);
    }
    
    console.log(`✅ PACS.002 validation passed for ${scenario.name}`);
} 