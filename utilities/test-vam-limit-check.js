const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

// Configuration
const KAFKA_BROKERS = ['localhost:9092'];
const VAM_ACCOUNT = '999888777666'; // GROUPLIMIT VAM account

// Create test message
const createTestMessage = () => ({
    messageId: uuidv4(),
    puid: `G3ITEST${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
    messageType: 'PACS008',
    jsonPayload: {
        msgId: `SG${Date.now()}001`,
        cdtrAcct: VAM_ACCOUNT,
        amount: '5000.00',
        currency: 'SGD'
    },
    timestamp: Date.now()
});

async function testVAMLimitCheck() {
    console.log('🚀 Testing VAM Limit Check Flow...');
    console.log(`📋 Using VAM account: ${VAM_ACCOUNT}`);
    
    const kafka = new Kafka({
        clientId: 'vam-limit-check-tester',
        brokers: KAFKA_BROKERS
    });
    
    const producer = kafka.producer();
    const consumer = kafka.consumer({ groupId: 'vam-limit-check-test-group' });
    
    try {
        // Connect producer and consumer
        await producer.connect();
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
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log(`📤 Received message on ${topic}:`, {
                        messageId: messageValue.messageId,
                        account: messageValue.jsonPayload?.cdtrAcct || messageValue.account,
                        authMethod: messageValue.authMethod || messageValue.enrichmentData?.authMethod
                    });
                } catch (error) {
                    console.warn(`⚠️ Could not parse message from ${topic}:`, error.message);
                }
            }
        });
        
        // Wait a moment for consumer to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Send test message
        const testMessage = createTestMessage();
        console.log(`📤 Sending message: ${testMessage.messageId}`);
        
        await producer.send({
            topic: 'request-messages',
            messages: [{
                key: testMessage.messageId,
                value: JSON.stringify(testMessage),
                headers: {
                    'message-type': testMessage.messageType,
                    'source': 'vam-limit-check-tester'
                }
            }]
        });
        
        console.log('⏳ Waiting for message processing...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Summary
        console.log('\n📊 Message Flow Summary:');
        console.log('='.repeat(50));
        
        const validatedMessages = messages.filter(m => m.topic === 'validated-messages');
        const vamMessages = messages.filter(m => m.topic === 'vam-messages');
        const limitCheckMessages = messages.filter(m => m.topic === 'limitcheck-messages');
        
        console.log(`✅ Validated Messages: ${validatedMessages.length}`);
        validatedMessages.forEach(m => {
            console.log(`   - ${m.messageId} | Account: ${m.account} | AuthMethod: ${m.authMethod || 'undefined'}`);
        });
        
        console.log(`🏦 VAM Messages: ${vamMessages.length}`);
        vamMessages.forEach(m => {
            console.log(`   - ${m.messageId} | Account: ${m.account} | AuthMethod: ${m.authMethod || 'undefined'}`);
        });
        
        console.log(`🔒 Limit Check Messages: ${limitCheckMessages.length}`);
        limitCheckMessages.forEach(m => {
            console.log(`   - ${m.messageId} | Account: ${m.account} | AuthMethod: ${m.authMethod || 'undefined'}`);
        });
        
        console.log('='.repeat(50));
        
        if (limitCheckMessages.length > 0) {
            console.log('🎉 SUCCESS: Limit check messages were created!');
        } else {
            console.log('❌ ISSUE: No limit check messages were created');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await producer.disconnect();
        await consumer.disconnect();
    }
}

// Run the test
testVAMLimitCheck().catch(console.error); 