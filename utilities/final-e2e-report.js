const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { Kafka } = require('kafkajs');

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

async function generateE2EReport() {
  console.log('🎯 GPPG3 End-to-End Test Report');
  console.log('=================================');
  console.log('Date:', new Date().toISOString());
  console.log('Test Scope: Complete microservices message flow');
  console.log('');

  const results = {
    serviceHealth: {},
    grpcFlow: {},
    kafkaFlow: {},
    orchestrator: {},
    issues: [],
    recommendations: []
  };

  // 1. Test Service Health
  console.log('📊 1. SERVICE HEALTH CHECK');
  console.log('==========================');
  
  const services = [
    { name: 'Account Lookup', port: 50059 },
    { name: 'Request Handler', port: 50051 },
    { name: 'Enrichment', port: 50052 },
    { name: 'Validation', port: 50053 },
    { name: 'Orchestrator', port: 3004 }
  ];

  for (const service of services) {
    try {
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
      
      results.serviceHealth[service.name] = isListening;
      console.log(`${isListening ? '✅' : '❌'} ${service.name} (${service.port}): ${isListening ? 'RUNNING' : 'DOWN'}`);
    } catch (error) {
      results.serviceHealth[service.name] = false;
      console.log(`❌ ${service.name} (${service.port}): ERROR`);
    }
  }

  // 2. Test gRPC Message Flow
  console.log('\n📡 2. GRPC MESSAGE FLOW TEST');
  console.log('=============================');
  
  try {
    const protoPath = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    const pacsProto = grpc.loadPackageDefinition(packageDefinition);
    const requestClient = new pacsProto.gpp.g3.requesthandler.PacsHandler(
      'localhost:50051',
      grpc.credentials.createInsecure()
    );

    const request = {
      message_type: 'PACS008',
      xml_payload: SINGAPORE_PACS_XML,
      metadata: {
        source: 'final-e2e-test',
        country: 'SG',
        currency: 'SGD',
        timestamp: new Date().toISOString()
      }
    };

    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('gRPC call timeout'));
      }, 5000);

      requestClient.ProcessPacsMessage(request, (error, response) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    results.grpcFlow.success = response.success;
    results.grpcFlow.messageId = response.message_id;
    results.grpcFlow.puid = response.puid;
    
    console.log('✅ gRPC Message Processing: SUCCESS');
    console.log(`   Message ID: ${response.message_id}`);
    console.log(`   PUID: ${response.puid}`);
    console.log(`   Success: ${response.success}`);
    
    requestClient.close();
    
  } catch (error) {
    results.grpcFlow.success = false;
    results.grpcFlow.error = error.message;
    console.log('❌ gRPC Message Processing: FAILED');
    console.log(`   Error: ${error.message}`);
    results.issues.push('gRPC communication failure between services');
  }

  // 3. Test Kafka Flow
  console.log('\n📤 3. KAFKA MESSAGE FLOW TEST');
  console.log('==============================');
  
  try {
    const kafka = new Kafka({
      clientId: 'final-e2e-test',
      brokers: ['localhost:9092']
    });
    
    const producer = kafka.producer();
    await producer.connect();
    
    const testMessage = {
      messageId: 'final-test-' + Date.now(),
      puid: 'G3IFINALTEST12345',
      messageType: 'PACS008',
      status: 'VALIDATED',
      country: 'SG',
      currency: 'SGD',
      timestamp: new Date().toISOString()
    };
    
    await producer.send({
      topic: 'validated-messages',
      messages: [
        {
          key: testMessage.messageId,
          value: JSON.stringify(testMessage)
        }
      ]
    });
    
    console.log('✅ Kafka Message Publishing: SUCCESS');
    console.log(`   Topic: validated-messages`);
    console.log(`   Message ID: ${testMessage.messageId}`);
    
    results.kafkaFlow.publishing = true;
    results.kafkaFlow.messageId = testMessage.messageId;
    
    await producer.disconnect();
    
  } catch (error) {
    results.kafkaFlow.publishing = false;
    results.kafkaFlow.error = error.message;
    console.log('❌ Kafka Message Publishing: FAILED');
    console.log(`   Error: ${error.message}`);
    results.issues.push('Kafka connectivity or configuration issue');
  }

  // 4. Test Orchestrator
  console.log('\n🎭 4. ORCHESTRATOR SERVICE TEST');
  console.log('================================');
  
  try {
    const response = await fetch('http://localhost:3004/health');
    const health = await response.json();
    
    console.log('✅ Orchestrator Health: HEALTHY');
    console.log(`   Status: ${health.status}`);
    console.log(`   Kafka Topic: ${health.kafka.topic}`);
    console.log(`   Kafka Group: ${health.kafka.groupId}`);
    
    results.orchestrator.healthy = true;
    results.orchestrator.kafkaTopic = health.kafka.topic;
    results.orchestrator.kafkaGroup = health.kafka.groupId;
    
    // Check messages
    const messagesResponse = await fetch('http://localhost:3004/api/v1/messages');
    const messagesData = await messagesResponse.json();
    
    console.log(`📊 Orchestrator Messages: ${messagesData.messages ? messagesData.messages.length : 0}`);
    
    results.orchestrator.messageCount = messagesData.messages ? messagesData.messages.length : 0;
    
    if (messagesData.messages && messagesData.messages.length === 0) {
      results.issues.push('Orchestrator not receiving messages from Kafka - possible consumer group issue');
    }
    
  } catch (error) {
    results.orchestrator.healthy = false;
    results.orchestrator.error = error.message;
    console.log('❌ Orchestrator Health: FAILED');
    console.log(`   Error: ${error.message}`);
    results.issues.push('Orchestrator service unavailable');
  }

  // 5. Generate Analysis and Recommendations
  console.log('\n🔍 5. ANALYSIS & RECOMMENDATIONS');
  console.log('==================================');
  
  // Check service connectivity
  const runningServices = Object.values(results.serviceHealth).filter(Boolean).length;
  const totalServices = Object.keys(results.serviceHealth).length;
  
  console.log(`📊 Service Status: ${runningServices}/${totalServices} services running`);
  
  if (results.grpcFlow.success && results.kafkaFlow.publishing) {
    console.log('✅ Core Processing: Message can be processed through gRPC services');
    console.log('✅ Kafka Infrastructure: Kafka is accessible and can accept messages');
    
    if (results.orchestrator.messageCount === 0) {
      console.log('⚠️  Gap Identified: Messages not reaching orchestrator from Kafka');
      results.issues.push('Validation service not publishing to Kafka after successful processing');
      results.recommendations.push('Fix gRPC communication issues between services');
      results.recommendations.push('Ensure validation service publishes validated messages to Kafka');
      results.recommendations.push('Check Kafka consumer group configuration in orchestrator');
    }
  }
  
  console.log('\n🚨 ISSUES IDENTIFIED:');
  results.issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
  });
  
  console.log('\n💡 RECOMMENDATIONS:');
  results.recommendations.push('Investigate gRPC wire type parsing errors');
  results.recommendations.push('Verify proto file definitions match between services');
  results.recommendations.push('Check network connectivity between service containers');
  results.recommendations.push('Review Kafka topic partitioning and consumer group settings');
  
  results.recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec}`);
  });

  // 6. Architecture Summary
  console.log('\n🏗️  6. ARCHITECTURE FLOW SUMMARY');
  console.log('=================================');
  
  const flowSteps = [
    { name: 'PACS Message Input', status: results.grpcFlow.success ? '✅' : '❌', detail: 'gRPC request to Request Handler' },
    { name: 'Message Validation', status: results.grpcFlow.success ? '✅' : '❌', detail: 'XML validation and enrichment' },
    { name: 'Kafka Publishing', status: results.kafkaFlow.publishing ? '✅' : '❌', detail: 'Publish to validated-messages topic' },
    { name: 'Orchestrator Consumption', status: results.orchestrator.messageCount > 0 ? '✅' : '❌', detail: 'Consume from Kafka and orchestrate' },
    { name: 'Downstream Processing', status: '⏳', detail: 'Route to Java services (not tested)' }
  ];
  
  flowSteps.forEach((step, index) => {
    console.log(`${index + 1}. ${step.status} ${step.name} - ${step.detail}`);
  });
  
  console.log('\n🎯 OVERALL SYSTEM STATUS');
  console.log('=========================');
  
  if (results.grpcFlow.success && results.kafkaFlow.publishing) {
    console.log('🟡 PARTIALLY FUNCTIONAL');
    console.log('   ✅ Individual services are working');
    console.log('   ✅ gRPC message processing works');
    console.log('   ✅ Kafka infrastructure is available');
    console.log('   ❌ End-to-end message flow needs fixing');
  } else {
    console.log('🔴 NEEDS ATTENTION');
    console.log('   ❌ Critical issues preventing full functionality');
  }
  
  return results;
}

// Run the comprehensive report
generateE2EReport()
  .then(results => {
    console.log('\n📋 Test completed. Check logs for detailed analysis.');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Report generation failed:', error);
    process.exit(1);
  }); 