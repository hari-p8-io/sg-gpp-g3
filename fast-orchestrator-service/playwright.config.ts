import { PlaywrightConfigBuilder } from '@gpp/pw-core';

// Environment variables with sensible defaults
const ORCHESTRATOR_PORT = parseInt(process.env.ORCHESTRATOR_PORT || '3004', 10);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(broker => broker.trim());

export default new PlaywrightConfigBuilder()
  .withHttpService('fast-orchestrator-service', ORCHESTRATOR_PORT)
  .withTimeout(30000)
  .withRetries(2)
  .withTestDir('./tests')
  .withKafkaConfig({
    brokers: KAFKA_BROKERS,
    topics: ['validated-messages'],
    groupId: 'fast-orchestrator-group'
  })
  .build(); 