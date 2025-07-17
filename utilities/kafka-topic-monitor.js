#!/usr/bin/env node

const { Kafka } = require('kafkajs');
const chalk = require('chalk');

// Configuration
const KAFKA_CONFIG = {
  brokers: ['localhost:9092'],
  topics: [
    'validated-messages',
    'vam-messages',
    'vam-responses',
    'limitcheck-messages',
    'accounting-messages',
    'enriched-messages',
    'processed-messages'
  ]
};

class KafkaTopicMonitor {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'kafka-topic-monitor',
      brokers: KAFKA_CONFIG.brokers
    });
    this.messageCount = {};
    this.startTime = Date.now();
    this.consumers = [];
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    
    let color = chalk.white;
    let icon = '📋';
    
    switch (level) {
      case 'SUCCESS': color = chalk.green; icon = '✅'; break;
      case 'ERROR': color = chalk.red; icon = '❌'; break;
      case 'INFO': color = chalk.blue; icon = 'ℹ️'; break;
      case 'MESSAGE': color = chalk.yellow; icon = '📨'; break;
      case 'TOPIC': color = chalk.cyan; icon = '📂'; break;
      default: color = chalk.white;
    }

    console.log(color(`${icon} [${elapsed}ms] ${message}`));
    
    if (data) {
      console.log(chalk.gray(`   📄 ${JSON.stringify(data, null, 2)}`));
    }
  }

  async createTopicConsumer(topic) {
    const consumer = this.kafka.consumer({ 
      groupId: `monitor-${topic}-${Date.now()}`,
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });

    try {
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          this.messageCount[topic] = (this.messageCount[topic] || 0) + 1;
          
          const messageValue = message.value?.toString();
          if (!messageValue) return;

          try {
            const parsedMessage = JSON.parse(messageValue);
            
            this.log('MESSAGE', `Topic: ${topic} | Partition: ${partition} | Offset: ${message.offset}`, {
              messageId: parsedMessage.messageId || 'N/A',
              messageType: parsedMessage.messageType || 'N/A',
              timestamp: parsedMessage.timestamp || 'N/A',
              puid: parsedMessage.puid || 'N/A',
              status: parsedMessage.status || 'N/A',
              totalMessages: this.messageCount[topic]
            });

            // Show summary periodically
            if (this.messageCount[topic] % 10 === 0) {
              this.showSummary();
            }

          } catch (error) {
            this.log('ERROR', `Failed to parse message from topic ${topic}: ${error.message}`);
          }
        }
      });

      this.consumers.push(consumer);
      this.log('SUCCESS', `Started monitoring topic: ${topic}`);
      
    } catch (error) {
      this.log('ERROR', `Failed to setup consumer for topic ${topic}: ${error.message}`);
    }
  }

  showSummary() {
    console.log('\n' + '='.repeat(60));
    console.log(chalk.bold.blue('📊 KAFKA TOPIC MONITORING SUMMARY'));
    console.log('='.repeat(60));
    
    Object.entries(this.messageCount).forEach(([topic, count]) => {
      console.log(chalk.cyan(`  📨 ${topic}: ${count} messages`));
    });
    
    console.log(`⏱️  Monitoring for: ${Math.floor((Date.now() - this.startTime) / 1000)}s`);
    console.log('='.repeat(60) + '\n');
  }

  async startMonitoring() {
    console.log(chalk.bold.blue('\n🎯 Starting Kafka Topic Monitoring\n'));
    
    this.log('INFO', 'Initializing Kafka topic monitoring...');
    this.log('INFO', `Monitoring topics: ${KAFKA_CONFIG.topics.join(', ')}`);

    // Create consumers for all topics
    const consumerPromises = KAFKA_CONFIG.topics.map(topic => 
      this.createTopicConsumer(topic)
    );

    await Promise.allSettled(consumerPromises);
    
    this.log('SUCCESS', 'All topic consumers initialized');
    
    // Show periodic summary
    const summaryInterval = setInterval(() => {
      this.showSummary();
    }, 30000); // Every 30 seconds

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      clearInterval(summaryInterval);
      console.log(chalk.yellow('\n🔄 Shutting down Kafka monitoring...'));
      
      // Disconnect all consumers
      await Promise.all(
        this.consumers.map(consumer => 
          consumer.disconnect().catch(err => 
            console.error('Error disconnecting consumer:', err)
          )
        )
      );
      
      this.showSummary();
      console.log(chalk.green('✅ Kafka monitoring stopped gracefully'));
      process.exit(0);
    });

    this.log('INFO', 'Kafka monitoring is now running. Press Ctrl+C to stop.');
  }

  async checkTopicExists(topic) {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      const topics = await admin.listTopics();
      const exists = topics.includes(topic);
      
      await admin.disconnect();
      return exists;
    } catch (error) {
      this.log('ERROR', `Failed to check topic existence: ${error.message}`);
      return false;
    }
  }

  async validateSetup() {
    this.log('INFO', 'Validating Kafka setup...');
    
    // Check if Kafka is accessible
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      const topics = await admin.listTopics();
      this.log('SUCCESS', `Connected to Kafka. Available topics: ${topics.length}`);
      
      // Check which of our monitored topics exist
      const existingTopics = KAFKA_CONFIG.topics.filter(topic => topics.includes(topic));
      const missingTopics = KAFKA_CONFIG.topics.filter(topic => !topics.includes(topic));
      
      if (existingTopics.length > 0) {
        this.log('INFO', `Existing topics to monitor: ${existingTopics.join(', ')}`);
      }
      
      if (missingTopics.length > 0) {
        this.log('INFO', `Topics that will be created when messages are sent: ${missingTopics.join(', ')}`);
      }
      
      await admin.disconnect();
      return true;
      
    } catch (error) {
      this.log('ERROR', `Failed to connect to Kafka: ${error.message}`);
      this.log('ERROR', 'Please ensure Kafka is running on localhost:9092');
      return false;
    }
  }
}

// Main execution
async function main() {
  const monitor = new KafkaTopicMonitor();
  
  // Validate setup first
  const setupValid = await monitor.validateSetup();
  if (!setupValid) {
    process.exit(1);
  }
  
  // Start monitoring
  await monitor.startMonitoring();
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = KafkaTopicMonitor; 