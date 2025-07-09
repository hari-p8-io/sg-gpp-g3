const { Kafka } = require('kafkajs');

// Configuration
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const VAM_KAFKA_TOPIC = process.env.VAM_KAFKA_TOPIC || 'vam-messages';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fast-vammediation-group';

console.log('🚀 Starting Fast VAM Mediation Service');
console.log('=====================================');

// In-memory storage for processed VAM messages
const processedVamMessages = new Map();

// Kafka setup
const kafka = new Kafka({
  clientId: 'fast-vammediation-service',
  brokers: KAFKA_BROKERS,
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

// VAM message processing logic
async function processVamMessage(vamMessage) {
  const { messageId, puid, accountSystem, enrichmentData } = vamMessage;
  
  console.log(`📥 Processing VAM message: ${messageId}`);
  console.log(`   PUID: ${puid}`);
  console.log(`   Account System: ${accountSystem}`);
  console.log(`   Account ID: ${enrichmentData?.physicalAcctInfo?.acctId}`);
  
  try {
    // Simulate VAM-specific processing
    const vamProcessingResult = {
      messageId,
      puid,
      accountSystem,
      processedAt: new Date().toISOString(),
      vamStatus: 'PROCESSED',
      vamServices: {
        valueAddedValidation: 'PASSED',
        premiumAccountCheck: 'VALIDATED',
        serviceEnrichment: 'COMPLETED'
      },
      processingTimeMs: Math.floor(Math.random() * 500) + 100 // Simulate processing time
    };
    
    // Store the processed message
    processedVamMessages.set(messageId, {
      ...vamMessage,
      ...vamProcessingResult,
      receivedAt: new Date().toISOString()
    });
    
    // Simulate some processing delay
    await new Promise(resolve => setTimeout(resolve, vamProcessingResult.processingTimeMs));
    
    console.log(`✅ VAM processing completed for message ${messageId}`);
    console.log(`   Processing time: ${vamProcessingResult.processingTimeMs}ms`);
    console.log(`   VAM Status: ${vamProcessingResult.vamStatus}`);
    
    return vamProcessingResult;
    
  } catch (error) {
    console.error(`❌ VAM processing failed for message ${messageId}:`, error);
    
    const errorResult = {
      messageId,
      puid,
      accountSystem,
      processedAt: new Date().toISOString(),
      vamStatus: 'FAILED',
      error: error.message,
      processingTimeMs: 0
    };
    
    processedVamMessages.set(messageId, {
      ...vamMessage,
      ...errorResult,
      receivedAt: new Date().toISOString()
    });
    
    return errorResult;
  }
}

// Start Kafka consumer
async function startVamConsumer() {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: VAM_KAFKA_TOPIC, fromBeginning: false });

    console.log(`📥 VAM consumer started (topic: ${VAM_KAFKA_TOPIC})`);
    console.log(`👥 Consumer group: ${KAFKA_GROUP_ID}`);
    console.log(`🌐 Kafka brokers: ${KAFKA_BROKERS.join(', ')}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = message.value?.toString();
          if (!messageValue) return;

          const vamMessage = JSON.parse(messageValue);
          
          // Verify this is a VAM message
          if (vamMessage.accountSystem !== 'VAM') {
            console.warn(`⚠️ Received non-VAM message: ${vamMessage.messageId}`);
            return;
          }
          
          await processVamMessage(vamMessage);
          
        } catch (error) {
          console.error('❌ Error processing VAM Kafka message:', error);
        }
      },
    });
    
  } catch (error) {
    console.error('❌ Failed to start VAM consumer:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down VAM mediation service gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down VAM mediation service gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

// Start the VAM mediation service
startVamConsumer();

// Export for testing
module.exports = {
  processVamMessage,
  processedVamMessages
}; 