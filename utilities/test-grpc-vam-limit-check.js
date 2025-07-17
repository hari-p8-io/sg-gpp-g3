const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configuration
const KAFKA_BROKERS = ['localhost:9092'];
const REQUEST_HANDLER_URL = 'localhost:50051';
const VAM_ACCOUNT = '999888777666'; // GROUPLIMIT VAM account

// Load the proto file
const PROTO_PATH = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const pacsProto = grpc.loadPackageDefinition(packageDefinition).gpp.g3.pacs;

// Create gRPC client
const requestHandlerClient = new pacsProto.PacsHandler(REQUEST_HANDLER_URL, grpc.credentials.createInsecure());

// Create test PACS message
const createPacsMessage = () => ({
    messageId: uuidv4(),
    messageType: 'PACS008',
    xmlPayload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG${Date.now()}001</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>TX${Date.now()}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">5000.00</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${VAM_ACCOUNT}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
    sourceSystem: 'TEST',
    priority: 'NORMAL',
    metadata: {
        testCase: 'GROUPLIMIT_VAM_LIMIT_CHECK',
        expectedAuthMethod: 'GROUPLIMIT',
        expectedAccountSystem: 'VAM'
    }
});

async function testGrpcVamLimitCheck() {
    console.log('🚀 Testing GROUPLIMIT VAM Limit Check via gRPC Request Handler...');
    console.log(`📋 Using VAM account: ${VAM_ACCOUNT}`);
    console.log(`🔌 Request Handler: ${REQUEST_HANDLER_URL}`);
    
    const kafka = new Kafka({
        clientId: 'grpc-vam-limit-check-tester',
        brokers: KAFKA_BROKERS
    });
    
    const consumer = kafka.consumer({ groupId: 'grpc-vam-limit-check-test-group' });
    
    try {
        // Connect Kafka consumer to monitor topics
        await consumer.connect();
        
        // Subscribe to topics we want to monitor
        await consumer.subscribe({ topic: 'validated-messages', fromBeginning: false });
        await consumer.subscribe({ topic: 'vam-messages', fromBeginning: false });
        await consumer.subscribe({ topic: 'limitcheck-messages', fromBeginning: false });
        
        const messages = [];
        
        // Listen for messages
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const messageValue = JSON.parse(message.value.toString());
                    messages.push({
                        topic,
                        messageId: messageValue.messageId,
                        account: messageValue.jsonPayload?.cdtrAcct || messageValue.account,
                        authMethod: messageValue.authMethod || messageValue.enrichmentData?.authMethod,
                        accountSystem: messageValue.enrichmentData?.physicalAcctInfo?.acctSys,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`📤 Received message on ${topic}:`, {
                        messageId: messageValue.messageId,
                        account: messageValue.jsonPayload?.cdtrAcct || messageValue.account,
                        authMethod: messageValue.authMethod || messageValue.enrichmentData?.authMethod,
                        accountSystem: messageValue.enrichmentData?.physicalAcctInfo?.acctSys
                    });
                } catch (error) {
                    console.warn(`⚠️ Could not parse message from ${topic}:`, error.message);
                }
            }
        });
        
        // Wait a moment for consumer to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Create test message
        const testMessage = createPacsMessage();
        console.log(`📤 Sending gRPC request: ${testMessage.messageId}`);
        
        // Send message via gRPC to Request Handler
        const grpcResponse = await new Promise((resolve, reject) => {
            requestHandlerClient.ProcessPacsMessage(testMessage, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
        
        console.log('✅ gRPC Response:', {
            messageId: grpcResponse.messageId,
            success: grpcResponse.success,
            processingStatus: grpcResponse.processingStatus,
            errorMessage: grpcResponse.errorMessage
        });
        
        console.log('⏳ Waiting for message processing through the pipeline...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Summary
        console.log('\n📊 Message Flow Summary:');
        console.log('='.repeat(60));
        
        const validatedMessages = messages.filter(m => m.topic === 'validated-messages');
        const vamMessages = messages.filter(m => m.topic === 'vam-messages');
        const limitCheckMessages = messages.filter(m => m.topic === 'limitcheck-messages');
        
        console.log(`✅ Validated Messages: ${validatedMessages.length}`);
        validatedMessages.forEach(m => {
            console.log(`   - ${m.messageId} | Account: ${m.account} | AuthMethod: ${m.authMethod || 'undefined'} | System: ${m.accountSystem || 'undefined'}`);
        });
        
        console.log(`🏦 VAM Messages: ${vamMessages.length}`);
        vamMessages.forEach(m => {
            console.log(`   - ${m.messageId} | Account: ${m.account} | AuthMethod: ${m.authMethod || 'undefined'} | System: ${m.accountSystem || 'undefined'}`);
        });
        
        console.log(`🔒 Limit Check Messages: ${limitCheckMessages.length}`);
        limitCheckMessages.forEach(m => {
            console.log(`   - ${m.messageId} | Account: ${m.account} | AuthMethod: ${m.authMethod || 'undefined'} | System: ${m.accountSystem || 'undefined'}`);
        });
        
        console.log('='.repeat(60));
        
        // Verification
        const hasValidatedMessage = validatedMessages.some(m => m.messageId === testMessage.messageId);
        const hasLimitCheckMessage = limitCheckMessages.some(m => m.messageId === testMessage.messageId);
        const hasCorrectAuthMethod = validatedMessages.some(m => m.authMethod === 'GROUPLIMIT');
        const hasCorrectAccountSystem = validatedMessages.some(m => m.accountSystem === 'VAM');
        
        console.log('\n🔍 Verification Results:');
        console.log(`✅ Message processed through validation: ${hasValidatedMessage ? 'YES' : 'NO'}`);
        console.log(`✅ Auth method set to GROUPLIMIT: ${hasCorrectAuthMethod ? 'YES' : 'NO'}`);
        console.log(`✅ Account system set to VAM: ${hasCorrectAccountSystem ? 'YES' : 'NO'}`);
        console.log(`✅ Limit check message created: ${hasLimitCheckMessage ? 'YES' : 'NO'}`);
        
        if (hasValidatedMessage && hasCorrectAuthMethod && hasCorrectAccountSystem && hasLimitCheckMessage) {
            console.log('\n🎉 SUCCESS: Complete GROUPLIMIT VAM limit check flow working!');
        } else {
            console.log('\n❌ ISSUE: Some part of the flow is not working correctly');
            
            if (!hasValidatedMessage) {
                console.log('   - Message not reaching validation service');
            }
            if (!hasCorrectAuthMethod) {
                console.log('   - Auth method not being set to GROUPLIMIT');
            }
            if (!hasCorrectAccountSystem) {
                console.log('   - Account system not being set to VAM');
            }
            if (!hasLimitCheckMessage) {
                console.log('   - Limit check message not being created');
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.code === grpc.status.UNAVAILABLE) {
            console.error('   - Request Handler service appears to be down');
        }
    } finally {
        await consumer.disconnect();
    }
}

// Run the test
testGrpcVamLimitCheck().catch(console.error); 