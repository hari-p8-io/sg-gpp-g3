import { PlaywrightConfigBuilder } from '@gpp/pw-core';

export default new PlaywrightConfigBuilder()
  .withHttpService('fast-orchestrator-service', 3004)
  .withTimeout(30000)
  .withRetries(2)
  .withTestDir('./tests')
  .withKafkaConfig({
    brokers: ['localhost:9092'],
    topics: ['validated-messages'],
    groupId: 'fast-orchestrator-group'
  })
  .build(); 