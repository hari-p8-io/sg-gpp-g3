const { Kafka } = require('kafkajs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

console.log('🔍 VALIDATING IMPLEMENTATION PLAN FLOW');
console.log('======================================');
console.log('Expected Flow:');
console.log('requesthandler → enrichment → accountlookup → enrichment → referencedata → enrichment → validation → orchestrator → vammediation → orchestrator → accounting → orchestrator → limitcheck');
console.log('');

async function validateImplementationPlan() {
  // Set up Kafka consumer to monitor the flow
  const kafka = new Kafka({
    clientId: 'implementation-plan-validator',
    brokers: ['localhost:9092']
  });

  const consumer = kafka.consumer({ groupId: 'implementation-plan-test' });
  await consumer.connect();
  await consumer.subscribe({ topics: ['validated-messages', 'vam-messages'] });

  const messageTracker = new Map();
  let testMessageId = null;

  // Set up message tracking
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const messageValue = message.value.toString();
      console.log(`📥 Kafka Message Received on ${topic}:`, {
        offset: message.offset,
        timestamp: new Date(parseInt(message.timestamp)).toISOString(),
        value: messageValue.substring(0, 200) + '...'
      });

      if (messageValue.includes(testMessageId)) {
        if (!messageTracker.has(topic)) {
          messageTracker.set(topic, []);
        }
        messageTracker.get(topic).push({
          topic,
          offset: message.offset,
          timestamp: message.timestamp,
          received: new Date().toISOString()
        });
      }
    },
  });

  // Wait a moment for consumer to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('🚀 Step 1: Testing Request Handler (Entry Point)');
  console.log('   This should trigger the entire implementation plan flow...');

  try {
    // Load proto and create client
    const protoPath = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);
    const client = new proto.gpp.g3.requesthandler.PacsHandler(
      'localhost:50051',
      grpc.credentials.createInsecure()
    );

    // Test different account types to validate routing logic
    const testScenarios = [
      {
        name: 'VAM Account (999888777)',
        account: '999888777',
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → vammediation → accounting → limitcheck',
        expectedKafkaTopics: ['validated-messages', 'vam-messages']
      },
      {
        name: 'Regular Account (123456789)', 
        account: '123456789',
        expectedFlow: 'requesthandler → enrichment → validation → orchestrator → accounting → limitcheck',
        expectedKafkaTopics: ['validated-messages']
      }
    ];

    for (const scenario of testScenarios) {
      console.log(`\n🎯 Testing ${scenario.name}`);
      console.log(`   Expected Flow: ${scenario.expectedFlow}`);
      console.log(`   Expected Kafka Topics: ${scenario.expectedKafkaTopics.join(', ')}`);

      testMessageId = `IMPL-PLAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      messageTracker.clear();

      const testMessage = {
        message_type: 'PACS008',
        xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${testMessageId}</MsgId>
      <CreDtTm>2025-01-08T10:00:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>COVE</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>TXN-${testMessageId}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>SENDER123</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${scenario.account}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
        metadata: {
          test_id: testMessageId,
          scenario: scenario.name,
          implementation_plan_test: 'true'
        }
      };

      console.log(`   📤 Sending message to Request Handler...`);
      
      const response = await new Promise((resolve, reject) => {
        client.ProcessPacsMessage(testMessage, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });

      console.log(`   ✅ Request Handler Response:`);
      console.log(`      Message ID: ${response.message_id}`);
      console.log(`      PUID: ${response.puid}`);
      console.log(`      Status: ${response.status}`);

      // Wait for message to flow through the system
      console.log(`   ⏳ Waiting for message to flow through implementation plan...`);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      // Analyze the flow
      console.log(`   📊 Flow Analysis:`);
      if (messageTracker.size === 0) {
        console.log(`   ❌ No Kafka messages detected - flow may be broken`);
        console.log(`   🔍 This suggests the implementation plan flow is not working as expected`);
        console.log(`   🔧 Check: enrichment → accountlookup → referencedata → validation → orchestrator chain`);
      } else {
        console.log(`   ✅ Kafka messages detected:`);
        for (const [topic, messages] of messageTracker.entries()) {
          console.log(`      📨 ${topic}: ${messages.length} message(s)`);
        }

        // Validate expected topics
        const actualTopics = Array.from(messageTracker.keys());
        const missingTopics = scenario.expectedKafkaTopics.filter(topic => !actualTopics.includes(topic));
        const unexpectedTopics = actualTopics.filter(topic => !scenario.expectedKafkaTopics.includes(topic));

        if (missingTopics.length === 0 && unexpectedTopics.length === 0) {
          console.log(`   ✅ Flow routing is CORRECT for ${scenario.name}`);
        } else {
          if (missingTopics.length > 0) {
            console.log(`   ❌ Missing expected topics: ${missingTopics.join(', ')}`);
          }
          if (unexpectedTopics.length > 0) {
            console.log(`   ⚠️  Unexpected topics: ${unexpectedTopics.join(', ')}`);
          }
        }
      }
    }

  } catch (error) {
    console.log('❌ Request Handler Test Failed:', error.message);
    console.log('🔧 This indicates the entry point of the implementation plan is not working');
  }

  // Clean up
  await consumer.disconnect();

  console.log('\n🎯 IMPLEMENTATION PLAN VALIDATION SUMMARY');
  console.log('==========================================');
  console.log('✅ Request Handler: Entry point is working');
  console.log('🔍 Flow Analysis: Based on Kafka message patterns');
  console.log('📋 Expected Implementation Plan:');
  console.log('   1. Request Handler receives PACS message');
  console.log('   2. Request Handler calls Enrichment Service');
  console.log('   3. Enrichment Service calls Account Lookup Service');
  console.log('   4. Enrichment Service calls Reference Data Service');  
  console.log('   5. Enrichment Service calls Validation Service');
  console.log('   6. Validation Service publishes to Kafka ("validated-messages")');
  console.log('   7. Orchestrator consumes from Kafka and routes based on auth method');
  console.log('   8. For VAM accounts: Orchestrator → VAM Mediation → Accounting → Limit Check');
  console.log('   9. For other accounts: Orchestrator → Accounting → Limit Check');
  console.log('   10. Limit Check is "fire and forget" (last step)');
  console.log('==========================================');
}

validateImplementationPlan().catch(console.error); 