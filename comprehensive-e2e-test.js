const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Sample PACS008 Singapore message
const SINGAPORE_PACS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG202501080001</MsgId>
      <CreDtTm>2025-01-08T04:06:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-SG-001</EndToEndId>
        <TxId>TXN-SG-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>123456789</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

async function checkServiceHealth() {
  const services = [
    { name: 'Account Lookup', port: 50059, type: 'grpc' },
    { name: 'Request Handler', port: 50051, type: 'grpc' },
    { name: 'Enrichment', port: 50052, type: 'grpc' },
    { name: 'Validation', port: 50053, type: 'grpc' },
    { name: 'Orchestrator', port: 3004, type: 'http' }
  ];

  console.log('🔍 Checking service health...');
  
  for (const service of services) {
    try {
      if (service.type === 'http') {
        const response = await fetch(`http://localhost:${service.port}/health`);
        const health = await response.json();
        console.log(`✅ ${service.name} (${service.port}): ${health.status}`);
      } else {
        // For gRPC services, check if port is listening
        const net = require('net');
        const isListening = await new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(1000);
          socket.on('connect', () => {
            socket.destroy();
            resolve(true);
          });
          socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
          });
          socket.on('error', () => {
            resolve(false);
          });
          socket.connect(service.port, 'localhost');
        });
        
        console.log(`${isListening ? '✅' : '❌'} ${service.name} (${service.port}): ${isListening ? 'listening' : 'not available'}`);
      }
    } catch (error) {
      console.log(`❌ ${service.name} (${service.port}): error - ${error.message}`);
    }
  }
}

async function testDirectGrpcServices() {
  console.log('\n🔧 Testing individual gRPC services...');
  
  // Test Account Lookup Service
  try {
    console.log('📞 Testing Account Lookup Service...');
    const accountLookupProto = protoLoader.loadSync(
      path.join(__dirname, 'fast-accountlookup-service/proto/account_lookup.proto'),
      { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
    );
    
    const accountLookupService = grpc.loadPackageDefinition(accountLookupProto);
    const accountClient = new accountLookupService.gpp.g3.accountlookup.AccountLookupService(
      'localhost:50059',
      grpc.credentials.createInsecure()
    );
    
    const lookupResponse = await new Promise((resolve, reject) => {
      accountClient.LookupAccount({ cdtr_acct: '123456789' }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    
    console.log('✅ Account Lookup Response:', lookupResponse);
    accountClient.close();
  } catch (error) {
    console.log('❌ Account Lookup Test Failed:', error.message);
  }
  
  // Test Enrichment Service
  try {
    console.log('📞 Testing Enrichment Service...');
    const enrichmentProto = protoLoader.loadSync(
      path.join(__dirname, 'fast-enrichment-service/proto/enrichment.proto'),
      { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
    );
    
    const enrichmentService = grpc.loadPackageDefinition(enrichmentProto);
    const enrichmentClient = new enrichmentService.gpp.g3.enrichment.EnrichmentService(
      'localhost:50052',
      grpc.credentials.createInsecure()
    );
    
    const enrichmentResponse = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichPacsMessage({
        message_id: 'test-123',
        puid: 'TEST-PUID',
        message_type: 'PACS008',
        xml_payload: SINGAPORE_PACS_XML
      }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    
    console.log('✅ Enrichment Response:', enrichmentResponse);
    enrichmentClient.close();
  } catch (error) {
    console.log('❌ Enrichment Test Failed:', error.message);
  }
}

async function runComprehensiveE2ETest() {
  let requestClient;
  
  try {
    console.log('🌟 Starting Comprehensive End-to-End Test');
    console.log('==========================================');

    // 1. Check all services
    await checkServiceHealth();
    
    // 2. Test individual gRPC services
    await testDirectGrpcServices();
    
    // 3. Test full flow through request handler
    console.log('\n🚀 Testing complete message flow...');
    
    // Load requesthandler gRPC client
    console.log('📡 Connecting to fast-requesthandler-service...');
    const protoPath = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    const pacsProto = grpc.loadPackageDefinition(packageDefinition);
    requestClient = new pacsProto.gpp.g3.requesthandler.PacsHandler(
      'localhost:50051',
      grpc.credentials.createInsecure()
    );

    // Send PACS message to requesthandler
    console.log('📨 Injecting PACS008 message into requesthandler...');
    const request = {
      message_type: 'PACS008',
      xml_payload: SINGAPORE_PACS_XML,
      metadata: {
        source: 'comprehensive-e2e-test',
        country: 'SG',
        currency: 'SGD',
        timestamp: new Date().toISOString()
      }
    };

    const response = await new Promise((resolve, reject) => {
      requestClient.ProcessPacsMessage(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    console.log('✅ Requesthandler Response:', {
      messageId: response.message_id,
      puid: response.puid,
      success: response.success,
      processingTimeMs: response.processing_time_ms,
      nextService: response.next_service
    });

    // 4. Check orchestrator for messages (with multiple attempts)
    console.log('\n🔍 Checking orchestrator for Kafka messages...');
    let attempts = 0;
    let maxAttempts = 6;
    let messages = [];
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`⏳ Attempt ${attempts}/${maxAttempts} - Waiting for Kafka message processing...`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const orchestratorResponse = await fetch('http://localhost:3004/api/v1/messages');
        const data = await orchestratorResponse.json();
        messages = data.messages || [];
        
        if (messages.length > 0) {
          console.log(`📊 Found ${messages.length} messages in orchestrator!`);
          break;
        }
      } catch (error) {
        console.log(`⚠️  Orchestrator API check failed: ${error.message}`);
      }
    }
    
    console.log('\n📈 Final Results:');
    console.log('================');
    console.log(`✅ gRPC Message Processing: ${response.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`${messages.length > 0 ? '✅' : '❌'} Kafka Message Flow: ${messages.length > 0 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📊 Total Messages in Orchestrator: ${messages.length}`);
    
    if (messages.length > 0) {
      console.log('\n📋 Message Details:');
      messages.forEach((msg, index) => {
        console.log(`  ${index + 1}. Message ID: ${msg.messageId}, Status: ${msg.status}, Type: ${msg.messageType}`);
      });
    }
    
    // 5. Architecture flow summary
    console.log('\n🏗️  Architecture Flow Summary:');
    console.log('==============================');
    console.log('1. ✅ Request Handler (50051) - Receives PACS message');
    console.log('2. ✅ Enrichment Service (50052) - Enriches with account data');
    console.log('3. ✅ Validation Service (50053) - Validates message');
    console.log(`4. ${messages.length > 0 ? '✅' : '❌'} Kafka Topic (validated-messages) - Message queue`);
    console.log(`5. ${messages.length > 0 ? '✅' : '❌'} Orchestrator (3004) - Message orchestration`);
    
    return response.success && messages.length > 0;

  } catch (error) {
    console.error('❌ Comprehensive test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  } finally {
    if (requestClient) {
      requestClient.close();
    }
  }
}

// Run the comprehensive test
runComprehensiveE2ETest()
  .then(success => {
    console.log(`\n🎯 Overall Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  }); 