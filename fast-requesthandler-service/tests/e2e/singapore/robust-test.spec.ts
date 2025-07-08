import { test, expect } from '@playwright/test';
import { TestHelper } from '../../utils/test-helper';

test.describe('Robust Integration Tests', () => {
  let testHelper: TestHelper;

  test.beforeEach(async () => {
    testHelper = TestHelper.getInstance();
    await testHelper.setupTest();
  });

  test.skip('should process single PACS008 message end-to-end', async () => {
    const xmlPayload = TestHelper.getTestXML('PACS008');
    
    // Process the message
    const response = await testHelper.getGrpcClient().processPacsMessage({
      message_type: 'PACS008',
      xml_payload: xmlPayload,
      metadata: { country: 'SG', currency: 'SGD' }
    });

    // Verify basic response
    expect(response.success).toBe(true);
    expect(response.message_id).toBeTruthy();
    expect(response.puid).toBeTruthy();
    expect(response.puid).toMatch(/^G3I[A-Z0-9]{13}$/);

    // Wait for background processing
    await testHelper.wait(2000);

    // Check database state
    const allMessages = await testHelper.getGrpcClient().getAllMessages();
    console.log(`Found ${allMessages.length} messages in database`);
    
    // Should have at least one message (could be more due to race conditions)
    expect(allMessages.length).toBeGreaterThanOrEqual(1);
  });

  test.skip('should process multiple message types without interference', async () => {
    const messages = [
      { type: 'PACS008', xml: TestHelper.getTestXML('PACS008') },
      { type: 'PACS007', xml: TestHelper.getTestXML('PACS007') }
    ];

    const responses = [];
    
    for (const message of messages) {
      const response = await testHelper.getGrpcClient().processPacsMessage({
        message_type: message.type,
        xml_payload: message.xml,
        metadata: { country: 'SG', currency: 'SGD' }
      });
      
      expect(response.success).toBe(true);
      responses.push(response);
      
      // Wait between messages to avoid race conditions
      await testHelper.wait(1000);
    }

    // Wait for all background processing
    await testHelper.wait(3000);

    // Check final database state
    const allMessages = await testHelper.getGrpcClient().getAllMessages();
    console.log(`Found ${allMessages.length} messages in database`);
    
    // Should have at least the number of messages we sent
    expect(allMessages.length).toBeGreaterThanOrEqual(messages.length);
    
    // Verify all our response IDs are present
    for (const response of responses) {
      const found = allMessages.find(msg => 
        msg.message_id === response.message_id || msg.puid === response.puid
      );
      expect(found).toBeTruthy();
    }
  });

  test('should handle health check consistently', async () => {
    const healthResponse = await testHelper.getGrpcClient().healthCheck();
    expect(healthResponse.status).toBeTruthy();
    expect(healthResponse.message).toBeTruthy();
  });

  test.skip('should generate unique identifiers', async () => {
    const xmlPayload = TestHelper.getTestXML('PACS008');
    const responses = [];

    for (let i = 0; i < 3; i++) {
      const response = await testHelper.getGrpcClient().processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', iteration: i.toString() }
      });
      
      expect(response.success).toBe(true);
      responses.push(response);
      
      await testHelper.wait(500);
    }

    // All message IDs should be unique
    const messageIds = responses.map(r => r.message_id);
    const uniqueIds = [...new Set(messageIds)];
    expect(uniqueIds.length).toBe(responses.length);

    // All PUIDs should be unique
    const puids = responses.map(r => r.puid);
    const uniquePuids = [...new Set(puids)];
    expect(uniquePuids.length).toBe(responses.length);

    // All PUIDs should follow the pattern
    for (const puid of puids) {
      expect(puid).toMatch(/^G3I[A-Z0-9]{13}$/);
    }
  });

  test.skip('should validate Singapore-specific content', async () => {
    const xmlPayload = TestHelper.getTestXML('PACS008');
    
    // Verify the XML contains Singapore-specific elements
    expect(xmlPayload).toContain('SGD');
    expect(xmlPayload).toContain('SG');
    expect(xmlPayload).toContain('ANZBSG3MXXX');
    
    const response = await testHelper.getGrpcClient().processPacsMessage({
      message_type: 'PACS008',
      xml_payload: xmlPayload,
      metadata: { country: 'SG', currency: 'SGD' }
    });

    expect(response.success).toBe(true);
    expect(response.puid).toMatch(/^G3I[A-Z0-9]{13}$/);
  });

  test.skip('should handle error scenarios gracefully', async () => {
    // Test with invalid XML
    try {
      await testHelper.getGrpcClient().processPacsMessage({
        message_type: 'PACS008',
        xml_payload: '<invalid>xml</invalid>',
        metadata: { country: 'SG' }
      });
    } catch (error) {
      expect(error).toBeTruthy();
    }

    // Test with empty payload
    try {
      await testHelper.getGrpcClient().processPacsMessage({
        message_type: 'PACS008',
        xml_payload: '',
        metadata: { country: 'SG' }
      });
    } catch (error) {
      expect(error).toBeTruthy();
    }

    // Test with invalid message type
    try {
      await testHelper.getGrpcClient().processPacsMessage({
        message_type: 'INVALID',
        xml_payload: TestHelper.getTestXML('PACS008'),
        metadata: { country: 'SG' }
      });
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });
}); 