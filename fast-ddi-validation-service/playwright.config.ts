import { PlaywrightConfigBuilder } from '@gpp/pw-core';

export default new PlaywrightConfigBuilder()
  .withGrpcService('fast-validation-service', 50053)
  .withTimeout(30000)
  .withRetries(2)
  .withTestDir('./tests')
  .build(); 