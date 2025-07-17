const { Kafka } = require('kafkajs');

// Test Kafka message flow directly
async function testKafkaMessageFlow() {
  console.log('🔍 Testing Kafka Message Flow');
  console.log('=============================');
  
  // Create Kafka client
  const kafka = new Kafka({
    clientId: 'kafka-flow-test',
    brokers: ['localhost:9092']
  });
  
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: 'test-group' });
  
  try {
    // Connect producer and consumer
    await producer.connect();
    await consumer.connect();
    
    console.log('✅ Connected to Kafka broker');
    
    // Subscribe to validated-messages topic
    await consumer.subscribe({ topic: 'validated-messages', fromBeginning: false });
    
    console.log('✅ Subscribed to validated-messages topic');
    
    // Set up message handler
    let receivedMessages = [];
    
    consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = message.value.toString();
          console.log('📨 Received message:', {
            topic,
            partition,
            offset: message.offset,
            value: messageValue.substring(0, 100) + '...'
          });
          receivedMessages.push(messageValue);
        } catch (error) {
          console.error('❌ Error processing message:', error);
        }
      },
    });
    
    // Send a test message to simulate validation service
    console.log('📤 Sending test message to validated-messages topic...');
    
    const testMessage = {
      messageId: 'test-kafka-flow-' + Date.now(),
      puid: 'G3IKAFKATEST12345',
      messageType: 'PACS008',
      status: 'VALIDATED',
      country: 'SG',
      currency: 'SGD',
      enrichmentData: {
        accountName: 'Test Account',
        bankCode: 'TESTBANK'
      },
      validationResults: {
        isValid: true,
        checks: ['SGD_CURRENCY', 'SG_COUNTRY', 'XSD_SCHEMA']
      },
      timestamp: new Date().toISOString()
    };
    
    await producer.send({
      topic: 'validated-messages',
      messages: [
        {
          key: testMessage.messageId,
          value: JSON.stringify(testMessage),
          headers: {
            'message-type': 'PACS008',
            'source': 'kafka-flow-test'
          }
        }
      ]
    });
    
    console.log('✅ Test message sent to Kafka');
    
    // Wait for message processing
    console.log('⏳ Waiting for message processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check orchestrator for messages
    console.log('🔍 Checking orchestrator for processed messages...');
    
    try {
      const response = await fetch('http://localhost:3004/api/v1/messages');
      const data = await response.json();
      
      console.log('📊 Orchestrator Response:', {
        messageCount: data.messages ? data.messages.length : 0,
        messages: data.messages || []
      });
      
      if (data.messages && data.messages.length > 0) {
        console.log('✅ Kafka message flow is working!');
        console.log('📋 Message Details:');
        data.messages.forEach((msg, index) => {
          console.log(`  ${index + 1}. ${msg.messageId} - ${msg.status} - ${msg.messageType}`);
        });
      } else {
        console.log('❌ No messages received by orchestrator');
      }
      
    } catch (error) {
      console.error('❌ Failed to check orchestrator:', error.message);
    }
    
    console.log('\n🎯 Kafka Flow Test Summary:');
    console.log(`📤 Messages sent: 1`);
    console.log(`📥 Messages received by consumer: ${receivedMessages.length}`);
    
    return receivedMessages.length > 0;
    
  } catch (error) {
    console.error('❌ Kafka test failed:', error.message);
    return false;
  } finally {
    await producer.disconnect();
    await consumer.disconnect();
  }
}

// Test direct gRPC validation service
async function testValidationServiceDirectly() {
  console.log('\n🔧 Testing Validation Service gRPC...');
  
  try {
    const grpc = require('@grpc/grpc-js');
    const protoLoader = require('@grpc/proto-loader');
    const path = require('path');
    
    // Load validation service proto
    const validationProto = protoLoader.loadSync(
      path.join(__dirname, 'fast-validation-service/proto/validation.proto'),
      { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
    );
    
    const validationService = grpc.loadPackageDefinition(validationProto);
    const validationClient = new validationService.gpp.g3.validation.ValidationService(
      'localhost:50053',
      grpc.credentials.createInsecure()
    );
    
    const testMessage = {
      message_id: 'test-validation-' + Date.now(),
      puid: 'G3IVALTEST12345',
      message_type: 'PACS008',
      xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG202501080001</MsgId>
      <CreDtTm>2025-01-08T04:06:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-SG-001</EndToEndId>
        <TxId>TXN-SG-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <CdtrAgt>
        <FinInstnId>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
      enrichment_data: {
        account_name: 'Test Account',
        bank_code: 'TESTBANK'
      }
    };
    
    console.log('📞 Calling ValidatePacsMessage...');
    
    const response = await new Promise((resolve, reject) => {
      validationClient.ValidatePacsMessage(testMessage, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
    
    console.log('✅ Validation Service Response:', response);
    validationClient.close();
    
    return response.success;
    
  } catch (error) {
    console.log('❌ Validation Service Test Failed:', error.message);
    return false;
  }
}

// Run both tests
async function runKafkaFlowTests() {
  console.log('🚀 Starting Kafka Flow Tests');
  console.log('============================');
  
  const validationTest = await testValidationServiceDirectly();
  const kafkaTest = await testKafkaMessageFlow();
  
  console.log('\n🎯 Test Results Summary:');
  console.log('========================');
  console.log(`✅ Validation Service: ${validationTest ? 'WORKING' : 'FAILED'}`);
  console.log(`✅ Kafka Message Flow: ${kafkaTest ? 'WORKING' : 'FAILED'}`);
  
  return validationTest && kafkaTest;
}

runKafkaFlowTests()
  .then(success => {
    console.log(`\n🏁 Overall Result: ${success ? 'SUCCESS' : 'PARTIAL/FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  }); 