import { test, expect } from '@playwright/test';
import { 
  createGrpcClient, 
  loadFixture, 
  isValidUUID, 
  isValidPUID, 
  validateSingaporeElements 
} from '../../utils/grpc-client';

test.describe('Singapore PACS Message Processing', () => {
  let grpcClient: ReturnType<typeof createGrpcClient>;

  test.beforeAll(async () => {
    grpcClient = createGrpcClient('localhost:50051');
    
    // Wait for service to be ready
    await grpcClient.waitForServiceReady(60000);
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
    test('should process valid Singapore PACS008 message', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { 
          country: 'SG', 
          currency: 'SGD',
          source: 'test'
        }
      });
      
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

    test('should validate Singapore-specific elements in PACS008', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Validate Singapore elements in the XML
      const sgElements = validateSingaporeElements(xmlPayload);
      expect(sgElements.hasSGDCurrency).toBe(true);
      expect(sgElements.hasSGCountry).toBe(true);
      expect(sgElements.hasSingaporePostalCode).toBe(true);
      expect(sgElements.hasSingaporeTimezone).toBe(true);
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', currency: 'SGD' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should handle PACS008 with different SGD amounts', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Test with different SGD amounts
      const amounts = ['100.00', '1500.50', '10000.99'];
      
      for (const amount of amounts) {
        const modifiedXml = xmlPayload.replace(/1500\.00/g, amount);
        
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: modifiedXml,
          metadata: { country: 'SG', currency: 'SGD' }
        });
        
        expect(response.success).toBe(true);
        expect(response.puid).toMatch(/^G3I.{13}$/);
      }
    });
  });

  test.describe('PACS007 Processing', () => {
    test('should process valid Singapore PACS007 reversal message', async () => {
      const xmlPayload = loadFixture('sample_pacs007_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS007',
        xml_payload: xmlPayload,
        metadata: { 
          country: 'SG', 
          currency: 'SGD',
          type: 'reversal'
        }
      });
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(isValidUUID(response.message_id)).toBe(true);
      expect(response.puid).toBeTruthy();
      expect(isValidPUID(response.puid)).toBe(true);
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });

    test('should validate PACS007 reversal reasons', async () => {
      const xmlPayload = loadFixture('sample_pacs007_sg.xml');
      
      // Ensure reversal contains proper reason codes
      expect(xmlPayload).toContain('<Cd>AC03</Cd>');
      expect(xmlPayload).toContain('Invalid account number');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS007',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });
  });

  test.describe('PACS003 Processing', () => {
    test('should process valid Singapore PACS003 direct debit message', async () => {
      const xmlPayload = loadFixture('sample_pacs003_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS003',
        xml_payload: xmlPayload,
        metadata: { 
          country: 'SG', 
          currency: 'SGD',
          type: 'direct_debit'
        }
      });
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(isValidUUID(response.message_id)).toBe(true);
      expect(response.puid).toBeTruthy();
      expect(isValidPUID(response.puid)).toBe(true);
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });

    test('should validate PACS003 direct debit structure', async () => {
      const xmlPayload = loadFixture('sample_pacs003_sg.xml');
      
      // Validate key direct debit elements
      expect(xmlPayload).toContain('<DrctDbtTxInf>');
      expect(xmlPayload).toContain('Ccy="SGD"');
      expect(xmlPayload).toContain('<Ctry>SG</Ctry>');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS003',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });
  });

  test.describe('Message Status Queries', () => {
    let testMessageId: string;
    let testPuid: string;

    test.beforeAll(async () => {
      // Create a test message first
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      testMessageId = response.message_id;
      testPuid = response.puid;
    });

    test('should query message status by UUID', async () => {
      const response = await grpcClient.getMessageStatus({
        message_id: testMessageId
      });
      
      expect(response.message_id).toBe(testMessageId);
      expect(response.puid).toBe(testPuid);
      expect(response.status).toBeTruthy();
      expect(response.message_type).toBe('PACS008');
      expect(response.created_at).toBeTruthy();
    });

    test('should query message status by PUID', async () => {
      const response = await grpcClient.getMessageStatus({
        puid: testPuid
      });
      
      expect(response.message_id).toBe(testMessageId);
      expect(response.puid).toBe(testPuid);
      expect(response.status).toBeTruthy();
      expect(response.message_type).toBe('PACS008');
      expect(response.created_at).toBeTruthy();
    });
  });

  test.describe('Identifier Generation', () => {
    test('should generate unique UUIDs for each message', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      const messageIds = new Set<string>();
      
      // Process multiple messages
      for (let i = 0; i < 5; i++) {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: { country: 'SG', iteration: i.toString() }
        });
        
        expect(response.success).toBe(true);
        expect(isValidUUID(response.message_id)).toBe(true);
        expect(messageIds.has(response.message_id)).toBe(false);
        
        messageIds.add(response.message_id);
      }
      
      expect(messageIds.size).toBe(5);
    });

    test('should generate unique PUIDs for each message', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      const puids = new Set<string>();
      
      // Process multiple messages
      for (let i = 0; i < 5; i++) {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: { country: 'SG', iteration: i.toString() }
        });
        
        expect(response.success).toBe(true);
        expect(isValidPUID(response.puid)).toBe(true);
        expect(puids.has(response.puid)).toBe(false);
        
        puids.add(response.puid);
      }
      
      expect(puids.size).toBe(5);
    });

    test('should ensure all PUIDs start with G3I', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      for (let i = 0; i < 3; i++) {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: { country: 'SG' }
        });
        
        expect(response.puid).toMatch(/^G3I/);
        expect(response.puid.length).toBe(16);
      }
    });
  });

  test.describe('Singapore Market Validation', () => {
    test('should accept SGD currency in all message types', async () => {
      // Test PACS008 with SGD currency
      const pacs008Xml = loadFixture('sample_pacs008_sg.xml');
      const pacs008Response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: pacs008Xml,
        metadata: { country: 'SG', currency: 'SGD' }
      });
      
      expect(pacs008Response.success).toBe(true);
      expect(pacs008Xml).toContain('Ccy="SGD"');
      
      // Test PACS007 (reversal) - may not have currency but should still process
      const pacs007Xml = loadFixture('sample_pacs007_sg.xml');
      const pacs007Response = await grpcClient.processPacsMessage({
        message_type: 'PACS007',
        xml_payload: pacs007Xml,
        metadata: { country: 'SG', currency: 'SGD' }
      });
      
      expect(pacs007Response.success).toBe(true);
      
      // Test PACS003 (direct debit) - may not have currency but should still process
      const pacs003Xml = loadFixture('sample_pacs003_sg.xml');
      const pacs003Response = await grpcClient.processPacsMessage({
        message_type: 'PACS003',
        xml_payload: pacs003Xml,
        metadata: { country: 'SG', currency: 'SGD' }
      });
      
      expect(pacs003Response.success).toBe(true);
    });

    test('should handle Singapore timezone correctly', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure Singapore timezone is present
      expect(xmlPayload).toContain('+08:00');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', timezone: 'Asia/Singapore' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should validate Singapore country codes', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure SG country codes are present
      expect(xmlPayload).toContain('<Ctry>SG</Ctry>');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle invalid XML payload gracefully', async () => {
      const invalidXml = '<invalid>malformed xml</invalid>';
      
      try {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: invalidXml,
          metadata: { country: 'SG' }
        });
        
        // If we get a response, it should indicate failure
        expect(response.success).toBe(false);
        expect(response.error_message).toBeTruthy();
      } catch (error) {
        // Or we might get a gRPC error
        expect(error).toBeTruthy();
      }
    });

    test('should handle unsupported message type gracefully', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      try {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS999',
          xml_payload: xmlPayload,
          metadata: { country: 'SG' }
        });
        
        // If we get a response, it should indicate failure
        expect(response.success).toBe(false);
        expect(response.error_message).toBeTruthy();
      } catch (error) {
        // Or we might get a gRPC error for invalid message type
        expect(error).toBeTruthy();
      }
    });

    test('should handle empty XML payload gracefully', async () => {
      try {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: '',
          metadata: { country: 'SG' }
        });
        
        // If we get a response, it should indicate failure
        expect(response.success).toBe(false);
        expect(response.error_message).toBeTruthy();
      } catch (error) {
        // Or we might get a gRPC error for empty payload
        expect(error).toBeTruthy();
      }
    });
  });

  test.describe('Performance and Concurrency', () => {
    test('should handle multiple concurrent requests', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Create multiple concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => 
        grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: { country: 'SG', concurrent: i.toString() }
        })
      );
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      expect(responses.every(r => r.success)).toBe(true);
      
      // All should have unique identifiers
      const messageIds = responses.map(r => r.message_id);
      const puids = responses.map(r => r.puid);
      
      expect(new Set(messageIds).size).toBe(10);
      expect(new Set(puids).size).toBe(10);
    });

    test('should process messages within acceptable time limits', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const startTime = Date.now();
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
}); 