const { Kafka } = require('kafkajs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto definition for request handler
const PROTO_PATH = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const pacsProto = grpc.loadPackageDefinition(packageDefinition);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Configuration
const KAFKA_BROKERS = ['localhost:9092'];
const SERVICES = {
  requestHandler: 'localhost:50051', // gRPC service
  enrichment: 'http://localhost:50052',
  referenceData: 'http://localhost:50060',
  validation: 'http://localhost:50053',
  orchestrator: 'http://localhost:3004',
  limitCheck: 'http://localhost:3006',
  accounting: 'http://localhost:8002',
  vamMediation: 'http://localhost:3005'
};

const KAFKA_TOPICS = {
  limitCheck: 'limitcheck-messages',
  vamMessages: 'vam-messages',
  validatedMessages: 'validated-messages'
};

// Test message templates
const TEST_MESSAGES = {
  // GROUPLIMIT + VAM account (should go to VAM mediation, then accounting, then limit check fire-and-forget)
  grouplimitVAM: {
    messageType: 'PACS008',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>
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
</Document>`,
    expectedAuthMethod: 'GROUPLIMIT',
    expectedAccountSystem: 'VAM',
    expectedFlow: 'VAM → Accounting → Limit Check (Fire & Forget)'
  },

  // GROUPLIMIT + MDZ account (should go to accounting, then limit check fire-and-forget)
  grouplimitMDZ: {
    messageType: 'PACS008',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>
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
      <IntrBkSttlmAmt Ccy="SGD">25000</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>999123456</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
    expectedAuthMethod: 'GROUPLIMIT',
    expectedAccountSystem: 'MDZ',
    expectedFlow: 'Accounting → Limit Check (Fire & Forget)'
  },

  // AFPTHENLIMIT + MDZ account (should go directly to accounting, no limit check)
  afpThenLimitMDZ: {
    messageType: 'PACS008',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>
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
      <IntrBkSttlmAmt Ccy="SGD">15000</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>888123456</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedAccountSystem: 'MDZ',
    expectedFlow: 'Accounting (No Limit Check)'
  },

  // AFPONLY + MDZ account (should go directly to accounting, no limit check)
  afpOnlyMDZ: {
    messageType: 'PACS008',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>
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
      <IntrBkSttlmAmt Ccy="SGD">5000</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>777123456</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
    expectedAuthMethod: 'AFPONLY',
    expectedAccountSystem: 'MDZ',
    expectedFlow: 'Accounting (No Limit Check)'
  }
};

// Create gRPC client for request handler
const requestHandlerClient = new pacsProto.gpp.g3.requesthandler.PacsHandler(
  SERVICES.requestHandler,
  grpc.credentials.createInsecure()
);

// Utility functions
function log(message, color = colors.white) {
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

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logStep(message) {
  log(`🔄 ${message}`, colors.cyan);
}

// Health check function
async function checkServiceHealth(serviceName, url) {
  try {
    const response = await axios.get(`${url}/health`, { timeout: 5000 });
    if (response.status === 200) {
      logSuccess(`${serviceName} is healthy`);
      return true;
    } else {
      logError(`${serviceName} returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`${serviceName} health check failed: ${error.message}`);
    return false;
  }
}

// Kafka consumer setup
async function setupKafkaConsumer(topic, groupId, messageHandler) {
  const kafka = new Kafka({
    clientId: 'enhanced-flow-test',
    brokers: KAFKA_BROKERS
  });

  const consumer = kafka.consumer({ groupId });
  
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const messageValue = message.value?.toString();
        if (messageValue) {
          const parsedMessage = JSON.parse(messageValue);
          messageHandler(parsedMessage);
        }
      } catch (error) {
        logError(`Error processing Kafka message: ${error.message}`);
      }
    }
  });

  return consumer;
}

// Test execution
async function runEnhancedFlowTest() {
  log(`${colors.bright}🚀 Starting Enhanced Flow Test with Post-Accounting Limit Check${colors.reset}`);
  log(`${colors.dim}Testing: Reference Data Service → Auth Method → Orchestration → Accounting → Limit Check (Fire & Forget)${colors.reset}`);
  console.log();

  // Step 1: Health checks
  logStep('Step 1: Performing service health checks');
  const healthResults = {};
  
  for (const [serviceName, url] of Object.entries(SERVICES)) {
    healthResults[serviceName] = await checkServiceHealth(serviceName, url);
  }
  
  const healthyServices = Object.values(healthResults).filter(Boolean).length;
  const totalServices = Object.keys(healthResults).length;
  
  if (healthyServices === totalServices) {
    logSuccess(`All ${totalServices} services are healthy`);
  } else {
    logWarning(`${healthyServices}/${totalServices} services are healthy`);
  }
  console.log();

  // Step 2: Setup Kafka consumers for monitoring
  logStep('Step 2: Setting up Kafka consumers for monitoring');
  const limitCheckMessages = [];
  const vamMessages = [];
  const validatedMessages = [];

  const consumers = await Promise.all([
    setupKafkaConsumer(KAFKA_TOPICS.limitCheck, 'test-limit-check-monitor', (msg) => {
      limitCheckMessages.push(msg);
      logInfo(`📥 Limit Check Message (Post-Accounting): ${msg.messageId} (${msg.authMethod}) - Trigger: ${msg.triggerPoint || 'unknown'}`);
    }),
    setupKafkaConsumer(KAFKA_TOPICS.vamMessages, 'test-vam-monitor', (msg) => {
      vamMessages.push(msg);
      logInfo(`📥 VAM Message: ${msg.messageId} (${msg.accountSystem})`);
    }),
    setupKafkaConsumer(KAFKA_TOPICS.validatedMessages, 'test-validated-monitor', (msg) => {
      validatedMessages.push(msg);
      logInfo(`📥 Validated Message: ${msg.messageId} (${msg.enrichmentData?.authMethod})`);
    })
  ]);

  logSuccess('Kafka consumers ready');
  console.log();

  // Step 3: Test each message type
  logStep('Step 3: Testing different auth method flows');
  
  const testResults = {};
  
  for (const [testName, testMessage] of Object.entries(TEST_MESSAGES)) {
    log(`${colors.bright}🧪 Testing ${testName}: ${testMessage.expectedFlow}${colors.reset}`);
    
    try {
      // Send message to request handler
      const messageId = uuidv4();
      const puid = `TEST-${testName}-${Date.now()}`;
      
      const requestPayload = {
        messageId,
        puid,
        messageType: testMessage.messageType,
        xmlPayload: testMessage.xmlPayload,
        metadata: {
          testName,
          expectedAuthMethod: testMessage.expectedAuthMethod,
          expectedAccountSystem: testMessage.expectedAccountSystem,
          expectedFlow: testMessage.expectedFlow
        }
      };

      logInfo(`📤 Sending ${testName} message (${messageId})`);
      
      const response = await axios.post(
        `${SERVICES.requestHandler}/api/v1/messages`,
        requestPayload,
        { timeout: 30000 }
      );

      if (response.status === 200) {
        logSuccess(`${testName} message sent successfully`);
        testResults[testName] = {
          messageId,
          puid,
          sent: true,
          response: response.data
        };
      } else {
        logError(`${testName} message failed with status ${response.status}`);
        testResults[testName] = {
          messageId,
          puid,
          sent: false,
          error: `HTTP ${response.status}`
        };
      }
      
    } catch (error) {
      logError(`${testName} test failed: ${error.message}`);
      testResults[testName] = {
        sent: false,
        error: error.message
      };
    }
    
    console.log();
  }

  // Step 4: Wait for processing and analyze results
  logStep('Step 4: Waiting for message processing (30 seconds)');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Step 5: Analyze results
  logStep('Step 5: Analyzing results');
  
  log(`${colors.bright}📊 Test Results Summary${colors.reset}`);
  console.log();
  
  // Check limit check messages
  log(`${colors.bright}🔍 Limit Check Messages (Post-Accounting) (${limitCheckMessages.length}):${colors.reset}`);
  limitCheckMessages.forEach((msg, index) => {
    const triggerPoint = msg.triggerPoint === 'post_accounting' ? '(Post-Accounting ✅)' : '(Unknown Trigger ⚠️)';
    log(`  ${index + 1}. ${msg.messageId} - Auth: ${msg.authMethod} - Account: ${msg.accountInfo?.acctId} ${triggerPoint}`);
  });
  console.log();
  
  // Check VAM messages
  log(`${colors.bright}🏦 VAM Messages (${vamMessages.length}):${colors.reset}`);
  vamMessages.forEach((msg, index) => {
    log(`  ${index + 1}. ${msg.messageId} - System: ${msg.accountSystem}`);
  });
  console.log();
  
  // Check validated messages
  log(`${colors.bright}✅ Validated Messages (${validatedMessages.length}):${colors.reset}`);
  validatedMessages.forEach((msg, index) => {
    log(`  ${index + 1}. ${msg.messageId} - Auth: ${msg.enrichmentData?.authMethod} - System: ${msg.enrichmentData?.physicalAcctInfo?.acctSys}`);
  });
  console.log();

  // Step 6: Verify flows
  logStep('Step 6: Verifying expected flows');
  
  // Verify GROUPLIMIT messages went to limit check (post-accounting)
  const grouplimitMessages = validatedMessages.filter(msg => 
    msg.enrichmentData?.authMethod === 'GROUPLIMIT'
  );
  
  const grouplimitInLimitCheck = limitCheckMessages.filter(msg => 
    msg.authMethod === 'GROUPLIMIT' && msg.triggerPoint === 'post_accounting'
  );
  
  if (grouplimitMessages.length > 0 && grouplimitInLimitCheck.length > 0) {
    logSuccess(`✅ GROUPLIMIT messages correctly routed to post-accounting limit check service`);
    logInfo(`   Expected: ${grouplimitMessages.length}, Got: ${grouplimitInLimitCheck.length} post-accounting limit checks`);
  } else if (grouplimitMessages.length > 0) {
    logError(`❌ GROUPLIMIT post-accounting routing failed - Expected: ${grouplimitMessages.length}, Got: ${grouplimitInLimitCheck.length}`);
  } else {
    logInfo(`ℹ️  No GROUPLIMIT messages in this test run`);
  }
  
  // Verify VAM messages went to VAM mediation
  const vamMessages2 = validatedMessages.filter(msg => 
    msg.enrichmentData?.physicalAcctInfo?.acctSys === 'VAM'
  );
  
  const vamInMediation = vamMessages.filter(msg => 
    msg.accountSystem === 'VAM'
  );
  
  if (vamMessages2.length > 0 && vamInMediation.length > 0) {
    logSuccess(`✅ VAM messages correctly routed to VAM mediation service`);
  } else if (vamMessages2.length > 0) {
    logError(`❌ VAM routing failed - Expected: ${vamMessages2.length}, Got: ${vamInMediation.length}`);
  } else {
    logInfo(`ℹ️  No VAM messages in this test run`);
  }

  // Verify non-GROUPLIMIT messages did NOT go to limit check
  const nonGrouplimitMessages = validatedMessages.filter(msg => 
    msg.enrichmentData?.authMethod !== 'GROUPLIMIT' && 
    (msg.enrichmentData?.authMethod === 'AFPONLY' || msg.enrichmentData?.authMethod === 'AFPTHENLIMIT')
  );
  
  const nonGrouplimitInLimitCheck = limitCheckMessages.filter(msg => 
    msg.authMethod !== 'GROUPLIMIT'
  );
  
  if (nonGrouplimitMessages.length > 0 && nonGrouplimitInLimitCheck.length === 0) {
    logSuccess(`✅ Non-GROUPLIMIT messages correctly skipped limit check service`);
  } else if (nonGrouplimitMessages.length > 0 && nonGrouplimitInLimitCheck.length > 0) {
    logError(`❌ Non-GROUPLIMIT messages incorrectly sent to limit check - Expected: 0, Got: ${nonGrouplimitInLimitCheck.length}`);
  } else {
    logInfo(`ℹ️  No non-GROUPLIMIT messages to verify`);
  }
  
  console.log();

  // Step 7: Check service endpoints
  logStep('Step 7: Checking service endpoints for processed messages');
  
  try {
    // Check orchestrator status
    const orchestratorStatus = await axios.get(`${SERVICES.orchestrator}/api/v1/orchestration`);
    log(`🔄 Orchestrator processed ${orchestratorStatus.data.count} messages`);
    
    // Check accounting service
    const accountingStatus = await axios.get(`${SERVICES.accounting}/api/v1/accounting`);
    log(`💰 Accounting processed ${accountingStatus.data.count} messages`);
    
  } catch (error) {
    logWarning(`Could not retrieve all endpoint statuses: ${error.message}`);
  }
  
  console.log();

  // Step 8: Summary
  log(`${colors.bright}📋 Final Summary${colors.reset}`);
  log(`📊 Messages Processed:`);
  log(`   - Validated Messages: ${validatedMessages.length}`);
  log(`   - VAM Messages: ${vamMessages.length}`);
  log(`   - Post-Accounting Limit Checks: ${limitCheckMessages.filter(msg => msg.triggerPoint === 'post_accounting').length}/${limitCheckMessages.length}`);
  console.log();
  
  log(`🔄 Flow Verification:`);
  log(`   - GROUPLIMIT → Post-Accounting Limit Check: ${grouplimitInLimitCheck.length > 0 ? '✅ Working' : '❌ Failed'}`);
  log(`   - VAM → VAM Mediation: ${vamInMediation.length > 0 ? '✅ Working' : '❌ Failed'}`);
  log(`   - Non-GROUPLIMIT → No Limit Check: ${nonGrouplimitInLimitCheck.length === 0 ? '✅ Working' : '❌ Failed'}`);
  console.log();

  log(`${colors.bright}✅ Enhanced Flow Test Completed${colors.reset}`);
  log(`${colors.dim}New Architecture: Limit Check is now a fire-and-forget call AFTER accounting for GROUPLIMIT auth method only${colors.reset}`);

  // Clean up
  await Promise.all(consumers.map(consumer => consumer.disconnect()));
  process.exit(0);
}

// Error handling
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Start the test
runEnhancedFlowTest().catch(error => {
  logError(`Test failed: ${error.message}`);
  process.exit(1);
}); 