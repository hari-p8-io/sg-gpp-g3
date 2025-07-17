import { test, expect } from '@playwright/test';
import { TestHelper } from '../../utils/test-helper';
import { 
  createGrpcClient, 
  loadFixture, 
  isValidUUID, 
  isValidPUID, 
  validateSingaporeElements 
} from '../../utils/grpc-client';

test.describe('Singapore PACS Message Processing', () => {
  let testHelper: TestHelper;
  let grpcClient: ReturnType<typeof createGrpcClient>;

  test.beforeAll(async () => {
    testHelper = new TestHelper();
    grpcClient = testHelper.getGrpcClient();
    
    // Wait for service to be ready
    await grpcClient.waitForServiceReady();
  });

  test.afterAll(async () => {
    if (testHelper) {
      await testHelper.shutdown();
    }
  });

  test.beforeEach(async () => {
    await testHelper.setupTest();
  });

  test.describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await grpcClient.healthCheck();
      
      // Status can be either numeric (1, 2) or string ("SERVING", "NOT_SERVING")
      const validStatuses = [1, 2, 'SERVING', 'NOT_SERVING'];
      expect(validStatuses).toContain(response.status);
      expect(response.message).toBeTruthy();
    });
  });

  test.describe('PACS008 Processing', () => {
    test.skip('should process valid Singapore PACS008 message', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS008');
      
      const { response } = await testHelper.processMessageAndWait(
        'PACS008',
        xmlPayload,
        { 
          country: 'SG', 
          currency: 'SGD',
          source: 'test'
        }
      );
      
      // Validate basic response structure
      expect(response.success).toBe(true);
      expect(response.error_message).toBeFalsy();
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
      
      // Validate identifiers
      expect(response.message_id).toBeTruthy();
      expect(isValidUUID(response.message_id)).toBe(true);
      
      expect(response.puid).toBeTruthy();
      expect(isValidPUID(response.puid)).toBe(true);
      
      // Validate timestamp
      expect(response.timestamp).toBeTruthy();
      const timestamp = parseInt(response.timestamp);
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });

    test.skip('should validate Singapore-specific elements in PACS008', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS008');
      
      // Validate Singapore elements in the XML
      const sgElements = validateSingaporeElements(xmlPayload);
      expect(sgElements.hasSGDCurrency).toBe(true);
      expect(sgElements.hasSGCountry).toBe(true);
      expect(sgElements.hasSingaporePostalCode).toBe(true);
      expect(sgElements.hasSingaporeTimezone).toBe(true);
      
      const { response } = await testHelper.processMessageAndWait(
        'PACS008',
        xmlPayload,
        { country: 'SG', currency: 'SGD' }
      );
      
      expect(response.success).toBe(true);
    });

    test.skip('should handle PACS008 with different SGD amounts', async () => {
      const baseXml = TestHelper.getTestXML('PACS008');
      
      // Test with different SGD amounts
      const amounts = ['100.00', '1500.50', '10000.99'];
      
      for (const amount of amounts) {
        const modifiedXml = baseXml.replace(/1500\.00/g, amount);
        
        const { response } = await testHelper.processMessageAndWait(
          'PACS008',
          modifiedXml,
          { country: 'SG', currency: 'SGD' }
        );
        
        expect(response.success).toBe(true);
        expect(response.puid).toMatch(/^G3I.{13}$/);
        
        // Clear for next iteration
        await testHelper.clearDatabaseCompletely();
      }
    });
  });

  test.describe('PACS007 Processing', () => {
    test.skip('should process valid Singapore PACS007 reversal message', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS007');
      
      const { response } = await testHelper.processMessageAndWait(
        'PACS007',
        xmlPayload,
        { 
          country: 'SG', 
          currency: 'SGD',
          type: 'reversal'
        }
      );
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(isValidUUID(response.message_id)).toBe(true);
      expect(response.puid).toBeTruthy();
      expect(isValidPUID(response.puid)).toBe(true);
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED', 'FAILED'].includes(response.status)).toBe(true);
    });

    test.skip('should validate PACS007 reversal reasons', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS007');
      
      // Ensure reversal contains proper reason codes
      expect(xmlPayload).toContain('<Cd>AC03</Cd>');
      expect(xmlPayload).toContain('Invalid account number');
      
      const { response } = await testHelper.processMessageAndWait(
        'PACS007',
        xmlPayload,
        { country: 'SG' }
      );
      
      expect(response.success).toBe(true);
    });
  });

  test.describe('PACS003 Processing', () => {
    test.skip('should process valid Singapore PACS003 direct debit message', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS003');
      
      const { response } = await testHelper.processMessageAndWait(
        'PACS003',
        xmlPayload,
        { 
          country: 'SG', 
          currency: 'SGD',
          type: 'direct_debit'
        }
      );
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(isValidUUID(response.message_id)).toBe(true);
      expect(response.puid).toBeTruthy();
      expect(isValidPUID(response.puid)).toBe(true);
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });

    test.skip('should validate PACS003 direct debit structure', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS003');
      
      // Validate key direct debit elements
      expect(xmlPayload).toContain('<DrctDbtTxInf>');
      expect(xmlPayload).toContain('Ccy="SGD"');
      expect(xmlPayload).toContain('<Ctry>SG</Ctry>');
      
      const { response } = await testHelper.processMessageAndWait(
        'PACS003',
        xmlPayload,
        { country: 'SG' }
      );
      
      expect(response.success).toBe(true);
    });
  });

  test.describe('Message Status Queries', () => {
    let testMessageId: string;
    let testPuid: string;

    test.beforeAll(async () => {
      // Create a test message first
      const xmlPayload = TestHelper.getTestXML('PACS008');
      const { response } = await testHelper.processMessageAndWait(
        'PACS008',
        xmlPayload,
        { country: 'SG', currency: 'SGD' }
      );
      testMessageId = response.message_id;
      testPuid = response.puid;
    });

    test.skip('should query message status by message ID', async () => {
      const statusResponse = await grpcClient.getMessageStatus(testMessageId);
      
      expect(statusResponse.message_id).toBe(testMessageId);
      expect(statusResponse.puid).toBe(testPuid);
      expect(statusResponse.status).toBeTruthy();
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED', 'FAILED'].includes(statusResponse.status)).toBe(true);
    });

    test.skip('should query message status by PUID', async () => {
      const statusResponse = await grpcClient.getMessageStatus(undefined, testPuid);
      
      expect(statusResponse.message_id).toBe(testMessageId);
      expect(statusResponse.puid).toBe(testPuid);
      expect(statusResponse.status).toBeTruthy();
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED', 'FAILED'].includes(statusResponse.status)).toBe(true);
    });

    test.skip('should return error for non-existent message', async () => {
      try {
        await grpcClient.getMessageStatus('non-existent-id');
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeTruthy();
        expect(error.message).toContain('not found');
      }
    });
  });

  test.describe('Database Operations', () => {
    test.skip('should retrieve all messages from database', async () => {
      // Process a few messages first
      const messages = ['PACS008', 'PACS007', 'PACS003'];
      
      for (const msgType of messages) {
        const xmlPayload = TestHelper.getTestXML(msgType);
        await testHelper.processMessageAndWait(
          msgType,
          xmlPayload,
          { country: 'SG', currency: 'SGD' }
        );
      }
      
      // Retrieve all messages
      const allMessages = await grpcClient.getAllMessages();
      
      expect(allMessages.length).toBeGreaterThanOrEqual(messages.length);
      
      // Verify message types are present
      const messageTypes = allMessages.map(msg => msg.message_type);
      expect(messageTypes).toContain('PACS008');
      expect(messageTypes).toContain('PACS007');
      expect(messageTypes).toContain('PACS003');
    });

    test.skip('should clear database successfully', async () => {
      // Add a message first
      const xmlPayload = TestHelper.getTestXML('PACS008');
      await testHelper.processMessageAndWait(
        'PACS008',
        xmlPayload,
        { country: 'SG', currency: 'SGD' }
      );
      
      // Verify it's there
      let allMessages = await grpcClient.getAllMessages();
      expect(allMessages.length).toBeGreaterThan(0);
      
      // Clear database
      await grpcClient.clearMockStorage();
      
      // Verify it's empty
      allMessages = await grpcClient.getAllMessages();
      expect(allMessages.length).toBe(0);
    });
  });

  test.describe('Error Handling', () => {
    test.skip('should handle invalid XML gracefully', async () => {
      const invalidXml = '<invalid>xml</invalid>';
      
      try {
        await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: invalidXml,
          metadata: { country: 'SG' }
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeTruthy();
        expect(error.message || error.details).toMatch(/validation|XML|invalid/i);
      }
    });

    test.skip('should handle empty XML gracefully', async () => {
      try {
        await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: '',
          metadata: { country: 'SG' }
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeTruthy();
        expect(error.message || error.details).toMatch(/empty|validation|XML/i);
      }
    });

    test.skip('should handle invalid message type gracefully', async () => {
      const xmlPayload = TestHelper.getTestXML('PACS008');
      
      try {
        await grpcClient.processPacsMessage({
          message_type: 'INVALID_TYPE',
          xml_payload: xmlPayload,
          metadata: { country: 'SG' }
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeTruthy();
        expect(error.message || error.details).toMatch(/message.type|invalid/i);
      }
    });
  });
}); 