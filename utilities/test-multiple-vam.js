const { Kafka } = require('kafkajs');

async function testMultipleVAMMessages() {
    console.log('🧪 Testing Multiple VAM Messages...');
    
    const kafka = new Kafka({
        clientId: 'vam-multi-test',
        brokers: ['localhost:9092']
    });
    
    const producer = kafka.producer();
    
    try {
        await producer.connect();
        console.log('✅ Connected to Kafka');
        
        const vamAccounts = ['999888777', 'VAMTEST123', 'VAM12345'];
        
        for (const account of vamAccounts) {
            const message = {
                messageId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                cdtrAcct: account,
                acctSys: 'VAM',
                amount: '500.00',
                currency: 'SGD',
                source: 'multi-test',
                timestamp: new Date().toISOString()
            };
            
            console.log(`📤 Sending message for account: ${account}`);
            
            await producer.send({
                topic: 'vam-messages',
                messages: [{
                    key: message.messageId,
                    value: JSON.stringify(message)
                }]
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('✅ All messages sent');
        
        // Wait and check results
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const response = await fetch('http://localhost:3005/api/v1/messages');
        const data = await response.json();
        
        console.log(`\n📊 VAM Service Status:`);
        console.log(`   Total messages processed: ${data.count}`);
        
        if (data.messages.length > 0) {
            console.log('\n📥 Recent messages:');
            data.messages.slice(-3).forEach((msg, idx) => {
                console.log(`   ${idx + 1}. Account: ${msg.originalMessage.cdtrAcct} | Status: ${msg.processing.status}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await producer.disconnect();
        console.log('✅ Test completed');
    }
}

testMultipleVAMMessages().catch(console.error); 