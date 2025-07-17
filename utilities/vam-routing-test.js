const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { Kafka } = require('kafkajs');

// VAM test PACS008 message with special account that triggers VAM routing
const VAM_PACS_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
        <EndToEndId>E2E-VAM-001</EndToEndId>
        <TxId>TXN-VAM-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">5000.00</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>999888777</Id>
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

async function runVamRoutingTest() {
  console.log('🎯 VAM Routing End-to-End Test');
  console.log('===============================');
  console.log('Testing: Account Lookup → Enrichment → Validation → Orchestrator → VAM Mediation');
  console.log('');

  let requestClient;
  let vamConsumer;
  let receivedVamMessages = [];

  try {
    // Step 1: Set up VAM Kafka consumer to monitor VAM messages
    console.log('📡 1. Setting up VAM message monitoring...');
    
    const kafka = new Kafka({
      clientId: 'vam-test-monitor',
      brokers: ['localhost:9092']
    });
    
    vamConsumer = kafka.consumer({ groupId: 'vam-test-group' });
    await vamConsumer.connect();
    await vamConsumer.subscribe({ topic: 'vam-messages', fromBeginning: false });
    
    vamConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = message.value.toString();
          const vamMessage = JSON.parse(messageValue);
          console.log(`📥 VAM Monitor: Received message ${vamMessage.messageId} on topic ${topic}`);
          receivedVamMessages.push(vamMessage);
        } catch (error) {
          console.error('❌ VAM Monitor error:', error);
        }
      },
    });
    
    console.log('✅ VAM message monitoring active');

    // Step 2: Test Account Lookup Service with VAM account
    console.log('\n📞 2. Testing Account Lookup with VAM account (999888777)...');
    
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
      accountClient.LookupAccount({ cdtr_acct: '999888777' }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    
    console.log('✅ Account Lookup Response:');
    console.log(`   Account System: ${lookupResponse.enrichment_data.physical_acct_info.acct_sys}`);
    console.log(`   Account ID: ${lookupResponse.enrichment_data.physical_acct_info.acct_id}`);
    console.log(`   Lookup Status: ${lookupResponse.enrichment_data.lookup_status_desc}`);
    
    if (lookupResponse.enrichment_data.physical_acct_info.acct_sys !== 'VAM') {
      throw new Error(`Expected acct_sys to be 'VAM', but got '${lookupResponse.enrichment_data.physical_acct_info.acct_sys}'`);
    }
    
    accountClient.close();

    // Step 3: Send full PACS message through request handler
    console.log('\n📨 3. Sending VAM PACS message through request handler...');
    
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

    const request = {
      message_type: 'PACS008',
      xml_payload: VAM_PACS_XML,
      metadata: {
        source: 'vam-routing-test',
        country: 'SG',
        currency: 'SGD',
        testScenario: 'VAM_ROUTING',
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

    console.log('✅ Request Handler Response:');
    console.log(`   Message ID: ${response.message_id}`);
    console.log(`   PUID: ${response.puid}`);
    console.log(`   Success: ${response.success}`);

    // Step 4: Check orchestrator for message processing
    console.log('\n🎭 4. Checking orchestrator for VAM routing...');
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for async processing
    
    const orchestratorResponse = await fetch('http://localhost:3004/api/v1/messages');
    const orchestratorData = await orchestratorResponse.json();
    
    console.log(`📊 Orchestrator Messages: ${orchestratorData.messages.length}`);
    
    // Find our specific message
    const ourMessage = orchestratorData.messages.find(msg => msg.messageId === response.message_id);
    if (ourMessage) {
      console.log('✅ Found our message in orchestrator:');
      console.log(`   Status: ${ourMessage.status}`);
      console.log(`   Received At: ${ourMessage.receivedAt}`);
    }

    // Check orchestration details
    const orchestrationResponse = await fetch(`http://localhost:3004/api/v1/orchestration/${response.message_id}`);
    if (orchestrationResponse.ok) {
      const orchestrationData = await orchestrationResponse.json();
      console.log('✅ Orchestration Details:');
      console.log(`   Status: ${orchestrationData.orchestration.status}`);
      console.log(`   Route: ${orchestrationData.orchestration.routingInfo?.route}`);
      console.log(`   Account System: ${orchestrationData.orchestration.routingInfo?.acctSys}`);
      console.log(`   Special Routing: ${orchestrationData.orchestration.routingInfo?.specialRouting}`);
      
      // Check VAM routing step
      const vamStep = orchestrationData.orchestration.steps.find(step => step.stepName === 'vam_routing');
      if (vamStep) {
        console.log('✅ VAM Routing Step Found:');
        console.log(`   Status: ${vamStep.status}`);
        console.log(`   Kafka Topic: ${vamStep.data?.kafkaTopic}`);
      }
    }

    // Step 5: Verify VAM message was sent to Kafka
    console.log('\n📤 5. Verifying VAM message routing to Kafka...');
    
    // Wait a bit more for Kafka message processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (receivedVamMessages.length > 0) {
      console.log(`✅ Received ${receivedVamMessages.length} VAM message(s):`);
      receivedVamMessages.forEach((msg, index) => {
        console.log(`   ${index + 1}. Message ID: ${msg.messageId}`);
        console.log(`      PUID: ${msg.puid}`);
        console.log(`      Account System: ${msg.accountSystem}`);
        console.log(`      Routed At: ${msg.routedAt}`);
        console.log(`      Source Service: ${msg.sourceService}`);
      });
    } else {
      console.log('⚠️ No VAM messages received yet - this might indicate a routing issue');
    }

    // Step 6: Test results summary
    console.log('\n📋 6. VAM Routing Test Results');
    console.log('==============================');
    
    const testResults = {
      accountLookupVam: lookupResponse.enrichment_data.physical_acct_info.acct_sys === 'VAM',
      requestProcessing: response.success,
      orchestratorProcessing: !!ourMessage,
      vamKafkaRouting: receivedVamMessages.length > 0,
      endToEndSuccess: lookupResponse.enrichment_data.physical_acct_info.acct_sys === 'VAM' && 
                      response.success && 
                      !!ourMessage && 
                      receivedVamMessages.length > 0
    };
    
    console.log(`✅ Account Lookup VAM Detection: ${testResults.accountLookupVam ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Request Processing: ${testResults.requestProcessing ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Orchestrator Processing: ${testResults.orchestratorProcessing ? 'PASS' : 'FAIL'}`);
    console.log(`✅ VAM Kafka Routing: ${testResults.vamKafkaRouting ? 'PASS' : 'FAIL'}`);
    console.log(`\n🎯 Overall VAM Routing Test: ${testResults.endToEndSuccess ? 'SUCCESS' : 'PARTIAL/FAILED'}`);

    if (testResults.endToEndSuccess) {
      console.log('\n🎉 VAM routing is working correctly!');
      console.log('The complete flow is functional:');
      console.log('   1. Account 999888777 is detected as VAM system');
      console.log('   2. Message is processed through all services');
      console.log('   3. Orchestrator detects VAM account system');
      console.log('   4. Message is routed to vam-messages Kafka topic');
      console.log('   5. VAM mediation service can consume the message');
    } else {
      console.log('\n⚠️ VAM routing test completed with some issues');
      console.log('Check the individual test results above for details');
    }

    return testResults.endToEndSuccess;

  } catch (error) {
    console.error('❌ VAM routing test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  } finally {
    if (requestClient) {
      requestClient.close();
    }
    if (vamConsumer) {
      await vamConsumer.disconnect();
    }
  }
}

// Run the VAM routing test
runVamRoutingTest()
  .then(success => {
    console.log(`\n🏁 VAM Routing Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  }); 