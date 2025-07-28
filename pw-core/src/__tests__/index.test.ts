import * as pwCore from '../index';

describe('PW-Core Package', () => {
  test('should export all required generic components', () => {
    // Test that all main generic exports are available
    expect(pwCore.ServiceTestHelper).toBeDefined();
    expect(pwCore.GenericAssertions).toBeDefined();
    expect(pwCore.MessageBuilder).toBeDefined();
    expect(pwCore.PlaywrightConfigBuilder).toBeDefined();
    expect(pwCore.GrpcTestClient).toBeDefined();
    expect(pwCore.GrpcClientHelper).toBeDefined();
  });

  test('should have generic assertions available', () => {
    expect(pwCore.GenericAssertions.expectValidUUID).toBeDefined();
    expect(pwCore.GenericAssertions.expectValidXML).toBeDefined();
    expect(pwCore.GenericAssertions.expectValidPacsStructure).toBeDefined();
    expect(pwCore.GenericAssertions.expectValidCurrencyCode).toBeDefined();
    expect(pwCore.GenericAssertions.expectValidCountryCode).toBeDefined();
  });

  test('should have PlaywrightConfigBuilder with builder methods', () => {
    const config = new pwCore.PlaywrightConfigBuilder()
      .withTestDir('./tests')
      .withTimeout(30000)
      .withRetries(2)
      .withGrpcService('test-service', 50051)
      .build();

    expect(config.testDir).toBe('./tests');
    expect(config.timeout).toBe(30000);
    expect(config.retries).toBe(2);
    expect(config.webServer).toBeDefined();
    expect((config.webServer as any).port).toBe(50051);
  });

  test('should have generic MessageBuilder', () => {
    const builder = new pwCore.MessageBuilder();
    expect(builder.withMessageType).toBeDefined();
    expect(builder.withCurrency).toBeDefined();
    expect(builder.withCountry).toBeDefined();
    expect(builder.withAmount).toBeDefined();
    expect(builder.build).toBeDefined();
  });
}); 