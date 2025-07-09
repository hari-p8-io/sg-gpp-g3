const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logStep(message) {
  log(`🔄 ${message}`, colors.cyan);
}

// Load proto definition
const PROTO_PATH = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const pacsProto = grpc.loadPackageDefinition(packageDefinition);

// Create gRPC client
const client = new pacsProto.gpp.g3.requesthandler.PacsHandler(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Kafka setup
const kafka = new Kafka({
  clientId: 'grpc-flow-test',
  brokers: ['localhost:9092']
});

// Test message template
const testMessage = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG-${uuidv4()}</MsgId>
      <CreDtTm>2024-01-15T10:30:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>TXN-${uuidv4()}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">75000</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>999888777</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

// Kafka monitoring
async function setupKafkaMonitors() {
  const limitCheckMessages = [];
  const vamMessages = [];
  const validatedMessages = [];

  // Limit check consumer
  const limitCheckConsumer = kafka.consumer({ groupId: 'test-limit-check-grpc' });
  await limitCheckConsumer.connect();
  await limitCheckConsumer.subscribe({ topic: 'limitcheck-messages', fromBeginning: false });
  
  limitCheckConsumer.run({
    eachMessage: async ({ message }) => {
      try {
        const msg = JSON.parse(message.value.toString());
        limitCheckMessages.push(msg);
        logInfo(`📥 Post-Accounting Limit Check: ${msg.messageId} (${msg.authMethod})`);
      } catch (error) {
        logError(`Error parsing limit check message: ${error.message}`);
      }
    }
  });

  // VAM consumer
  const vamConsumer = kafka.consumer({ groupId: 'test-vam-grpc' });
  await vamConsumer.connect();
  await vamConsumer.subscribe({ topic: 'vam-messages', fromBeginning: false });
  
  vamConsumer.run({
    eachMessage: async ({ message }) => {
      try {
        const msg = JSON.parse(message.value.toString());
        vamMessages.push(msg);
        logInfo(`📥 VAM Message: ${msg.messageId}`);
      } catch (error) {
        logError(`Error parsing VAM message: ${error.message}`);
      }
    }
  });

  // Validated messages consumer
  const validatedConsumer = kafka.consumer({ groupId: 'test-validated-grpc' });
  await validatedConsumer.connect();
  await validatedConsumer.subscribe({ topic: 'validated-messages', fromBeginning: false });
  
  validatedConsumer.run({
    eachMessage: async ({ message }) => {
      try {
        const msg = JSON.parse(message.value.toString());
        validatedMessages.push(msg);
        logInfo(`📥 Validated Message: ${msg.messageId} (Auth: ${msg.enrichmentData?.authMethod})`);
      } catch (error) {
        logError(`Error parsing validated message: ${error.message}`);
      }
    }
  });

  return { limitCheckMessages, vamMessages, validatedMessages, 
           consumers: [limitCheckConsumer, vamConsumer, validatedConsumer] };
}

// Test scenarios
const testScenarios = [
  {
    name: 'GROUPLIMIT VAM Account',
    account: '999888777',
    amount: 75000,
    expectedAuthMethod: 'GROUPLIMIT',
    expectedSystem: 'VAM',
    expectLimitCheck: true,
    expectVAM: true
  },
  {
    name: 'GROUPLIMIT MDZ Account', 
    account: '999123456',
    amount: 25000,
    expectedAuthMethod: 'GROUPLIMIT',
    expectedSystem: 'MDZ',
    expectLimitCheck: true,
    expectVAM: false
  },
  {
    name: 'AFPTHENLIMIT Account',
    account: '888123456', 
    amount: 15000,
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedSystem: 'MDZ',
    expectLimitCheck: false,
    expectVAM: false
  },
  {
    name: 'AFPONLY Account',
    account: '777123456',
    amount: 5000,
    expectedAuthMethod: 'AFPONLY', 
    expectedSystem: 'MDZ',
    expectLimitCheck: false,
    expectVAM: false
  }
];

async function runGrpcFlowTest() {
  log(`${colors.bright}🚀 Starting gRPC End-to-End Flow Test${colors.reset}`);
  log(`Testing: Request Handler → Enrichment → Reference Data → Validation → Orchestration → Accounting → Limit Check\n`);

  // Setup monitoring
  logStep('Setting up Kafka monitors...');
  const { limitCheckMessages, vamMessages, validatedMessages, consumers } = await setupKafkaMonitors();
  logSuccess('Kafka monitors ready\n');

  // Test each scenario
  const results = [];
  
  for (const scenario of testScenarios) {
    log(`${colors.bright}🧪 Testing: ${scenario.name}${colors.reset}`);
    
    const messageId = uuidv4();
    const puid = `G3I${Date.now()}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // Create test message with specific account
    const xmlPayload = testMessage.replace('999888777', scenario.account)
                                 .replace('75000', scenario.amount.toString());
    
    try {
      // Send via gRPC
      const response = await new Promise((resolve, reject) => {
        client.ProcessPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: {
            messageId,
            puid,
            testName: scenario.name,
            sourceSystem: 'TEST',
            priority: 'NORMAL'
          }
        }, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });

      logSuccess(`Message sent successfully: ${messageId}`);
      logInfo(`Response: ${response.status} - ${response.message}`);
      
      results.push({
        scenario: scenario.name,
        messageId,
        puid,
        sent: true,
        response
      });
      
    } catch (error) {
      logError(`Failed to send message: ${error.message}`);
      results.push({
        scenario: scenario.name,
        messageId,
        puid,
        sent: false,
        error: error.message
      });
    }
    
    console.log();
  }

  // Wait for processing
  logStep('Waiting for message processing (30 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Analyze results
  log(`${colors.bright}📊 Flow Analysis Results${colors.reset}\n`);
  
  log(`${colors.bright}📥 Messages Received:${colors.reset}`);
  log(`   Validated Messages: ${validatedMessages.length}`);
  log(`   VAM Messages: ${vamMessages.length}`);
  log(`   Post-Accounting Limit Checks: ${limitCheckMessages.length}\n`);
  
  // Detailed analysis
  if (validatedMessages.length > 0) {
    log(`${colors.bright}✅ Validated Messages Details:${colors.reset}`);
    validatedMessages.forEach((msg, i) => {
      log(`   ${i+1}. ${msg.messageId}`);
      log(`      Auth Method: ${msg.enrichmentData?.authMethod || 'N/A'}`);
      log(`      Account System: ${msg.enrichmentData?.physicalAcctInfo?.acctSys || 'N/A'}`);
      log(`      Account ID: ${msg.enrichmentData?.physicalAcctInfo?.acctId || 'N/A'}`);
    });
    console.log();
  }
  
  if (vamMessages.length > 0) {
    log(`${colors.bright}🏦 VAM Messages Details:${colors.reset}`);
    vamMessages.forEach((msg, i) => {
      log(`   ${i+1}. ${msg.messageId} - System: ${msg.accountSystem || 'N/A'}`);
    });
    console.log();
  }
  
  if (limitCheckMessages.length > 0) {
    log(`${colors.bright}🔍 Post-Accounting Limit Check Details:${colors.reset}`);
    limitCheckMessages.forEach((msg, i) => {
      log(`   ${i+1}. ${msg.messageId}`);
      log(`      Auth Method: ${msg.authMethod || 'N/A'}`);
      log(`      Account: ${msg.accountInfo?.acctId || 'N/A'}`);
      log(`      Trigger Point: ${msg.triggerPoint || 'N/A'}`);
    });
    console.log();
  }

  // Verify flows
  log(`${colors.bright}🔍 Flow Verification:${colors.reset}`);
  
  const grouplimitMessages = validatedMessages.filter(msg => 
    msg.enrichmentData?.authMethod === 'GROUPLIMIT'
  );
  
  const vamGrouplimitMessages = grouplimitMessages.filter(msg =>
    msg.enrichmentData?.physicalAcctInfo?.acctSys === 'VAM'
  );
  
  log(`   GROUPLIMIT messages: ${grouplimitMessages.length}`);
  log(`   GROUPLIMIT + VAM messages: ${vamGrouplimitMessages.length}`);
  log(`   Expected post-accounting limit checks: ${grouplimitMessages.length}`);
  log(`   Actual post-accounting limit checks: ${limitCheckMessages.length}`);
  
  if (grouplimitMessages.length === limitCheckMessages.length) {
    logSuccess('✅ Post-accounting limit check flow working correctly!');
  } else {
    logError('❌ Post-accounting limit check flow mismatch!');
  }
  
  if (vamGrouplimitMessages.length === vamMessages.length) {
    logSuccess('✅ VAM routing working correctly!');
  } else {
    logError('❌ VAM routing mismatch!');
  }

  // Cleanup
  logStep('Cleaning up...');
  for (const consumer of consumers) {
    await consumer.disconnect();
  }
  
  logSuccess('End-to-End gRPC Flow Test Complete!');
}

// Run the test
runGrpcFlowTest().catch(error => {
  logError(`Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
}); 