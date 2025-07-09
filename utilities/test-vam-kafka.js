const { Kafka } = require('kafkajs');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

async function testVAMKafka() {
    console.log(`${colors.cyan}🧪 Testing VAM Kafka Integration...${colors.reset}`);
    
    // Initialize Kafka
    const kafka = new Kafka({
        clientId: 'vam-test-producer',
        brokers: ['localhost:9092']
    });
    
    const producer = kafka.producer();
    
    try {
        // Connect to Kafka
        console.log(`${colors.blue}📡 Connecting to Kafka...${colors.reset}`);
        await producer.connect();
        console.log(`${colors.green}✅ Connected to Kafka${colors.reset}`);
        
        // Create test message
        const testMessage = {
            messageId: `test-vam-${Date.now()}`,
            testId: `VAM-TEST-${Date.now()}`,
            cdtrAcct: '999888777', // VAM account
            acctSys: 'VAM',
            amount: '1000.00',
            currency: 'SGD',
            puid: `G3ITEST${Date.now()}`,
            timestamp: new Date().toISOString(),
            routing: 'VAM',
            source: 'manual-test'
        };
        
        console.log(`${colors.yellow}📤 Sending test message to vam-messages topic...${colors.reset}`);
        console.log('Message:', JSON.stringify(testMessage, null, 2));
        
        // Send message to VAM topic
        await producer.send({
            topic: 'vam-messages',
            messages: [
                {
                    key: testMessage.messageId,
                    value: JSON.stringify(testMessage),
                    headers: {
                        'content-type': 'application/json',
                        'source': 'vam-test'
                    }
                }
            ]
        });
        
        console.log(`${colors.green}✅ Message sent successfully${colors.reset}`);
        
        // Wait for VAM service to process
        console.log(`${colors.blue}⏳ Waiting 5 seconds for VAM service to process...${colors.reset}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check VAM service for processed messages
        console.log(`${colors.blue}🔍 Checking VAM service for processed messages...${colors.reset}`);
        
        const response = await fetch('http://localhost:3005/api/v1/messages');
        const data = await response.json();
        
        console.log(`${colors.cyan}📊 VAM Service Status:${colors.reset}`);
        console.log(`   Messages processed: ${data.count}`);
        console.log(`   Service timestamp: ${data.timestamp}`);
        
        if (data.count > 0) {
            console.log(`${colors.green}✅ SUCCESS: VAM service consumed the message!${colors.reset}`);
            console.log(`${colors.blue}📥 Latest processed message:${colors.reset}`);
            const latestMessage = data.messages[data.messages.length - 1];
            console.log(JSON.stringify(latestMessage, null, 2));
        } else {
            console.log(`${colors.red}❌ FAILURE: VAM service did not consume any messages${colors.reset}`);
        }
        
    } catch (error) {
        console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
        console.error(error.stack);
    } finally {
        // Disconnect producer
        console.log(`${colors.blue}🧹 Disconnecting from Kafka...${colors.reset}`);
        await producer.disconnect();
        console.log(`${colors.green}✅ Test completed${colors.reset}`);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log(`${colors.yellow}\n🛑 Test interrupted${colors.reset}`);
    process.exit(0);
});

// Run the test
if (require.main === module) {
    testVAMKafka().catch(console.error);
} 