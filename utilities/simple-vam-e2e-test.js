const axios = require('axios');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');

// ANSI color codes for better output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Test configuration
const config = {
    requestHandler: {
        host: 'localhost',
        port: 50051
    },
    vamMediationService: {
        host: 'localhost',
        port: 3005
    },
    kafka: {
        brokers: ['localhost:9092'],
        topic: 'vam-messages'
    },
    timeout: 30000
};

// VAM test accounts
const VAM_ACCOUNTS = ['999888777', 'VAMTEST123', 'VAM12345'];

async function testVAMEndToEnd() {
    console.log(`${colors.cyan}🚀 Starting VAM End-to-End Test...${colors.reset}`);
    
    try {
        // 1. Check services are healthy
        console.log(`${colors.blue}🏥 Checking service health...${colors.reset}`);
        await checkServiceHealth();
        
        // 2. Clear previous messages from VAM service
        console.log(`${colors.blue}🧹 Clearing previous messages...${colors.reset}`);
        await clearVAMMessages();
        
        // 3. Initialize gRPC client
        console.log(`${colors.blue}📡 Initializing gRPC client...${colors.reset}`);
        const requestHandlerClient = await initializeRequestHandlerClient();
        
        // 4. Test VAM routing for each account
        const results = [];
        
        for (const account of VAM_ACCOUNTS) {
            console.log(`${colors.magenta}🧪 Testing VAM account: ${account}${colors.reset}`);
            
            const testResult = await testVAMAccount(requestHandlerClient, account);
            results.push(testResult);
            
            console.log(`${colors.cyan}Result: ${testResult.success ? '✅ PASS' : '❌ FAIL'}${colors.reset}`);
            
            // Wait between tests
            await sleep(3000);
        }
        
        // 5. Print summary
        printSummary(results);
        
        // 6. Cleanup
        requestHandlerClient.close();
        
    } catch (error) {
        console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
        console.error(error.stack);
        process.exit(1);
    }
}

async function checkServiceHealth() {
    const services = [
        { name: 'Request Handler', url: 'http://localhost:50051/health' },
        { name: 'VAM Mediation', url: 'http://localhost:3005/health' }
    ];
    
    for (const service of services) {
        try {
            const response = await axios.get(service.url, { timeout: 5000 });
            console.log(`${colors.green}✅ ${service.name}: Healthy${colors.reset}`);
        } catch (error) {
            console.log(`${colors.red}❌ ${service.name}: Unhealthy - ${error.message}${colors.reset}`);
            throw new Error(`Service ${service.name} is not healthy`);
        }
    }
}

async function clearVAMMessages() {
    try {
        await axios.delete('http://localhost:3005/api/v1/messages', { timeout: 5000 });
        console.log(`${colors.green}✅ VAM messages cleared${colors.reset}`);
    } catch (error) {
        console.log(`${colors.yellow}⚠️  Could not clear VAM messages: ${error.message}${colors.reset}`);
    }
}

async function initializeRequestHandlerClient() {
    const packageDefinition = protoLoader.loadSync('./proto/pacs_service.proto', {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });

    const pacsProto = grpc.loadPackageDefinition(packageDefinition);
    
    const client = new pacsProto.PacsService(
        `${config.requestHandler.host}:${config.requestHandler.port}`,
        grpc.credentials.createInsecure()
    );

    return client;
}

async function testVAMAccount(client, account) {
    const testId = uuidv4();
    const messageId = `vam-test-${Date.now()}`;
    
    console.log(`${colors.blue}📤 Sending PACS message with account: ${account}${colors.reset}`);
    
    // Create PACS message
    const pacsMessage = createPACSMessage(messageId, account, testId);
    
    try {
        // Send message to request handler
        const response = await sendPACSMessage(client, pacsMessage);
        
        if (!response.success) {
            return {
                account,
                success: false,
                error: response.error,
                stage: 'REQUEST_HANDLER'
            };
        }
        
        console.log(`${colors.green}✅ Message sent successfully${colors.reset}`);
        
        // Wait for processing
        console.log(`${colors.yellow}⏳ Waiting for VAM processing...${colors.reset}`);
        await sleep(10000);
        
        // Check if VAM service received the message
        const vamResult = await checkVAMMessage(account, testId);
        
        return {
            account,
            success: vamResult.found,
            error: vamResult.error,
            stage: 'VAM_MEDIATION',
            messagesReceived: vamResult.count
        };
        
    } catch (error) {
        return {
            account,
            success: false,
            error: error.message,
            stage: 'REQUEST_HANDLER'
        };
    }
}

async function sendPACSMessage(client, pacsMessage) {
    return new Promise((resolve) => {
        client.ProcessPacsMessage(pacsMessage, (error, response) => {
            if (error) {
                resolve({ success: false, error: error.message });
            } else {
                resolve({ success: true, response });
            }
        });
    });
}

async function checkVAMMessage(account, testId) {
    try {
        const response = await axios.get('http://localhost:3005/api/v1/messages', { 
            timeout: 5000 
        });
        
        const messages = response.data.messages || [];
        
        // Look for message with our test ID or account
        const matchingMessage = messages.find(msg => 
            msg.originalMessage?.testId === testId ||
            msg.originalMessage?.cdtrAcct === account ||
            JSON.stringify(msg).includes(testId) ||
            JSON.stringify(msg).includes(account)
        );
        
        if (matchingMessage) {
            console.log(`${colors.green}✅ VAM message found for account ${account}${colors.reset}`);
            return {
                found: true,
                count: messages.length,
                message: matchingMessage
            };
        } else {
            console.log(`${colors.red}❌ No VAM message found for account ${account}${colors.reset}`);
            console.log(`   Total messages in VAM service: ${messages.length}`);
            return {
                found: false,
                count: messages.length,
                error: 'Message not found in VAM service'
            };
        }
        
    } catch (error) {
        console.log(`${colors.red}❌ Error checking VAM messages: ${error.message}${colors.reset}`);
        return {
            found: false,
            count: 0,
            error: error.message
        };
    }
}

function createPACSMessage(messageId, account, testId) {
    const timestamp = new Date().toISOString();
    
    return {
        messageId,
        messageType: 'PACS008',
        payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
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
        <TxId>${testId}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <ChrgBr>SLEV</ChrgBr>
      <Dbtr>
        <Nm>Test Debtor</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>987654321001</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <Cdtr>
        <Nm>Test Creditor VAM</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${account}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <Purp>
        <Cd>CBFF</Cd>
      </Purp>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
        testId,
        timestamp
    };
}

function printSummary(results) {
    console.log(`${colors.cyan}📊 VAM End-to-End Test Summary${colors.reset}`);
    console.log(`${'='.repeat(50)}`);
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`${colors.green}✅ Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${failed}${colors.reset}`);
    console.log(`📊 Total: ${results.length}`);
    
    console.log(`\n${colors.cyan}Detailed Results:${colors.reset}`);
    results.forEach((result, index) => {
        const status = result.success ? `${colors.green}✅ PASS` : `${colors.red}❌ FAIL`;
        console.log(`${index + 1}. ${result.account} ${status}${colors.reset}`);
        if (!result.success && result.error) {
            console.log(`   Error: ${result.error}`);
        }
        if (result.messagesReceived !== undefined) {
            console.log(`   Messages received: ${result.messagesReceived}`);
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
    testVAMEndToEnd().catch(console.error);
}

module.exports = { testVAMEndToEnd }; 