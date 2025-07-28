const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { Kafka } = require('kafkajs');

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

// Load gRPC proto
const PROTO_PATH = path.join(__dirname, '../fast-requesthandler-service/proto/message_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const messageProto = grpc.loadPackageDefinition(packageDefinition).gpp.g3.requesthandler;

// Sample PACS008 message
const samplePacs008 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
    <FIToFICstmrCdtTrf>
        <GrpHdr>
            <MsgId>G3TEST${Date.now()}</MsgId>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
            <NbOfTxs>1</NbOfTxs>
            <CtrlSum>1000.00</CtrlSum>
            <TtlIntrBkSttlmAmt Ccy="SGD">1000.00</TtlIntrBkSttlmAmt>
            <IntrBkSttlmDt>${new Date().toISOString().split('T')[0]}</IntrBkSttlmDt>
            <SttlmInf>
                <SttlmMtd>CLRG</SttlmMtd>
            </SttlmInf>
            <InstgAgt>
                <FinInstnId>
                    <BICFI>DBSSSGSG</BICFI>
                </FinInstnId>
            </InstgAgt>
            <InstdAgt>
                <FinInstnId>
                    <BICFI>OCBCSGSG</BICFI>
                </FinInstnId>
            </InstdAgt>
        </GrpHdr>
        <CdtTrfTxInf>
            <PmtId>
                <EndToEndId>E2E${Date.now()}</EndToEndId>
                <TxId>TXN${Date.now()}</TxId>
            </PmtId>
            <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
            <IntrBkSttlmDt>${new Date().toISOString().split('T')[0]}</IntrBkSttlmDt>
            <ChrgBr>SLEV</ChrgBr>
            <Dbtr>
                <Nm>Singapore Test Corp</Nm>
                <PstlAdr>
                    <Ctry>SG</Ctry>
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
                <Nm>Singapore Beneficiary</Nm>
                <PstlAdr>
                    <Ctry>SG</Ctry>
                </PstlAdr>
            </Cdtr>
            <CdtrAcct>
                <Id>
                    <Othr>
                        <Id>999888777666</Id>
                    </Othr>
                </Id>
            </CdtrAcct>
            <RmtInf>
                <Ustrd>Test payment with PACS.002 response</Ustrd>
            </RmtInf>
        </CdtTrfTxInf>
    </FIToFICstmrCdtTrf>
</Document>`;

class EnhancedFlowTester {
    constructor() {
        this.kafka = new Kafka({
            clientId: 'enhanced-flow-tester',
            brokers: ['localhost:9092'],
            retry: {
                retries: 3,
                initialRetryTime: 1000,
            },
        });
        
        this.consumer = this.kafka.consumer({ groupId: 'enhanced-flow-test-group' });
        this.responseTopic = 'pacs-response-messages';
        this.receivedResponses = [];
    }

    async initialize() {
        try {
            // Initialize Kafka consumer to listen for PACS.002 responses
            await this.consumer.connect();
            await this.consumer.subscribe({ topic: this.responseTopic, fromBeginning: false });
            
            // Start consuming responses
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const responseData = JSON.parse(message.value.toString());
                        this.receivedResponses.push(responseData);
                        
                        console.log(`${colors.green}📥 Received PACS.002 response:${colors.reset}`);
                        console.log(`   PUID: ${responseData.puid}`);
                        console.log(`   Status: ${responseData.status}`);
                        console.log(`   Response Type: ${responseData.responseType}`);
                        console.log(`   XML Size: ${responseData.xmlPayload.length} bytes`);
                        
                        // Display part of the XML response
                        const xmlLines = responseData.xmlPayload.split('\n');
                        console.log(`${colors.cyan}📄 PACS.002 XML Preview:${colors.reset}`);
                        xmlLines.slice(0, 10).forEach(line => {
                            console.log(`   ${line}`);
                        });
                        if (xmlLines.length > 10) {
                            console.log(`   ... (${xmlLines.length - 10} more lines)`);
                        }
                    } catch (error) {
                        console.error(`${colors.red}❌ Error parsing response:${colors.reset}`, error);
                    }
                },
            });
            
            console.log(`${colors.green}✅ Enhanced flow tester initialized${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Failed to initialize enhanced flow tester:${colors.reset}`, error);
            throw error;
        }
    }

    async testEnhancedFlow() {
        try {
            console.log(`${colors.yellow}🧪 Testing Enhanced Flow with PACS.002 Response Generation${colors.reset}`);
            console.log(`${colors.yellow}================================================================${colors.reset}`);
            
            // Create gRPC client
            const client = new messageProto.MessageHandler(
                'localhost:50051',
                grpc.credentials.createInsecure()
            );
            
            // Test 1: Send PACS008 message
            console.log(`${colors.blue}📤 Test 1: Sending PACS008 message to requesthandler...${colors.reset}`);
            
            const request = {
                message_type: 'PACS008',
                xml_payload: samplePacs008,
                metadata: {
                    source_system: 'TEST_SYSTEM',
                    country: 'SG',
                    currency: 'SGD'
                }
            };
            
            const response = await new Promise((resolve, reject) => {
                client.ProcessMessage(request, (error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log(`${colors.green}✅ Message processed successfully:${colors.reset}`);
            console.log(`   Message ID: ${response.message_id}`);
            console.log(`   PUID: ${response.puid}`);
            console.log(`   Status: ${response.status}`);
            console.log(`   Success: ${response.success}`);
            
            // Wait for the complete flow to process
            console.log(`${colors.yellow}⏳ Waiting for complete flow processing (including PACS.002 response)...${colors.reset}`);
            
            // Wait for PACS.002 response
            const startTime = Date.now();
            const timeout = 30000; // 30 seconds timeout
            
            while (Date.now() - startTime < timeout) {
                const matchingResponse = this.receivedResponses.find(r => r.puid === response.puid);
                if (matchingResponse) {
                    console.log(`${colors.green}✅ PACS.002 response received for PUID: ${response.puid}${colors.reset}`);
                    console.log(`${colors.green}🎉 Enhanced flow test completed successfully!${colors.reset}`);
                    
                    // Validate PACS.002 structure
                    this.validatePacs002Response(matchingResponse);
                    return;
                }
                await this.sleep(500);
            }
            
            console.log(`${colors.red}❌ Timeout waiting for PACS.002 response${colors.reset}`);
            
        } catch (error) {
            console.error(`${colors.red}❌ Enhanced flow test failed:${colors.reset}`, error);
        }
    }

    validatePacs002Response(response) {
        try {
            console.log(`${colors.cyan}🔍 Validating PACS.002 response structure...${colors.reset}`);
            
            // Check required fields
            const requiredFields = ['puid', 'responseType', 'xmlPayload', 'status'];
            const missingFields = requiredFields.filter(field => !response[field]);
            
            if (missingFields.length > 0) {
                console.log(`${colors.red}❌ Missing required fields: ${missingFields.join(', ')}${colors.reset}`);
                return false;
            }
            
            // Check response type
            if (response.responseType !== 'PACS.002') {
                console.log(`${colors.red}❌ Invalid response type: ${response.responseType}${colors.reset}`);
                return false;
            }
            
            // Check XML structure
            const xml = response.xmlPayload;
            const requiredXmlElements = [
                '<Document',
                '<FIToFIPmtStsRpt>',
                '<GrpHdr>',
                '<MsgId>',
                '<CreDtTm>',
                '<TxInfAndSts>',
                '<TxSts>'
            ];
            
            const missingXmlElements = requiredXmlElements.filter(element => !xml.includes(element));
            
            if (missingXmlElements.length > 0) {
                console.log(`${colors.red}❌ Missing XML elements: ${missingXmlElements.join(', ')}${colors.reset}`);
                return false;
            }
            
            console.log(`${colors.green}✅ PACS.002 response structure validation passed${colors.reset}`);
            return true;
            
        } catch (error) {
            console.error(`${colors.red}❌ Error validating PACS.002 response:${colors.reset}`, error);
            return false;
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async cleanup() {
        try {
            if (this.consumer) {
                await this.consumer.disconnect();
            }
            console.log(`${colors.yellow}🧹 Enhanced flow tester cleanup completed${colors.reset}`);
        } catch (error) {
            console.error(`${colors.red}❌ Error during cleanup:${colors.reset}`, error);
        }
    }
}

// Main execution
async function main() {
    const tester = new EnhancedFlowTester();
    
    try {
        await tester.initialize();
        await tester.testEnhancedFlow();
    } catch (error) {
        console.error(`${colors.red}❌ Test execution failed:${colors.reset}`, error);
    } finally {
        await tester.cleanup();
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log(`${colors.yellow}🛑 Received SIGINT, shutting down...${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`${colors.yellow}🛑 Received SIGTERM, shutting down...${colors.reset}`);
    process.exit(0);
});

// Run the test
main().catch(console.error); 