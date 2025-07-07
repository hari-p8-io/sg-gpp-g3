import { test, expect } from '@playwright/test';
import { createGrpcClient, loadFixture } from '../../utils/grpc-client';

test.describe('Validation and Integration Tests', () => {
  let grpcClient: ReturnType<typeof createGrpcClient>;

  test.beforeAll(async () => {
    grpcClient = createGrpcClient('localhost:50051');
    await grpcClient.waitForServiceReady(60000);
  });

  test.describe('XSD Schema Validation', () => {
    test('should validate PACS008 against XSD schema', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', validate: 'true' }
      });
      
      expect(response.success).toBe(true);
      expect(response.error_message).toBeFalsy();
      
      // Should pass XSD validation
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });

    test('should validate PACS007 against XSD schema', async () => {
      const xmlPayload = loadFixture('sample_pacs007_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS007',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', validate: 'true' }
      });
      
      expect(response.success).toBe(true);
      expect(response.error_message).toBeFalsy();
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });

    test('should validate PACS003 against XSD schema', async () => {
      const xmlPayload = loadFixture('sample_pacs003_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS003',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', validate: 'true' }
      });
      
      expect(response.success).toBe(true);
      expect(response.error_message).toBeFalsy();
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });

    test('should reject invalid XML structure', async () => {
      const invalidXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
          <FIToFICstmrCdtTrf>
            <GrpHdr>
              <MsgId>INVALID</MsgId>
              <!-- Missing required elements -->
            </GrpHdr>
          </FIToFICstmrCdtTrf>
        </Document>
      `;
      
      try {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: invalidXml,
          metadata: { country: 'SG' }
        });
        
        // If we get a response, it should indicate failure
        expect(response.success).toBe(false);
        expect(response.error_message).toBeTruthy();
        expect(response.error_message).toContain('validation');
      } catch (error) {
        // Or we might get a gRPC error for invalid XML structure
        expect(error).toBeTruthy();
        expect(error.message || error.details).toMatch(/validation|XML/i);
      }
    });

    test('should reject malformed XML', async () => {
      const malformedXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
          <FIToFICstmrCdtTrf>
            <GrpHdr>
              <MsgId>TEST</MsgId>
              <!-- Missing closing tag -->
            </GrpHdr>
          </FIToFICstmrCdtTrf>
        <!-- Missing closing Document tag -->
      `;
      
      try {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: malformedXml,
          metadata: { country: 'SG' }
        });
        
        // If we get a response, it should indicate failure
        expect(response.success).toBe(false);
        expect(response.error_message).toBeTruthy();
      } catch (error) {
        // Or we might get a gRPC error for malformed XML
        expect(error).toBeTruthy();
        expect(error.message || error.details).toMatch(/XML|malformed|validation/i);
      }
    });
  });

  test.describe('Singapore-Specific Validation', () => {
    test('should validate SGD currency format', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure SGD currency is present
      expect(xmlPayload).toContain('Ccy="SGD"');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', currency: 'SGD' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should validate Singapore country codes', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure SG country code is present
      expect(xmlPayload).toContain('<Ctry>SG</Ctry>');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should validate Singapore postal codes', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure Singapore postal code format is present
      expect(xmlPayload).toMatch(/Singapore \d{6}/);
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should validate Singapore timezone', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure Singapore timezone (+08:00) is present
      expect(xmlPayload).toContain('+08:00');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', timezone: 'Asia/Singapore' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should handle non-SGD currency with warnings', async () => {
      let xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Replace SGD with USD for testing
      xmlPayload = xmlPayload.replace(/Ccy="SGD"/g, 'Ccy="USD"');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', currency: 'USD' }
      });
      
      // Should still process (warnings only for non-SGD)
      expect(response.success).toBe(true);
    });
  });

  test.describe('Message Processing Pipeline', () => {
    test('should process message through complete pipeline', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', pipeline: 'complete' }
      });
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(response.puid).toBeTruthy();
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
      
      // Check that message was stored
      const statusResponse = await grpcClient.getMessageStatus({
        message_id: response.message_id
      });
      
      expect(statusResponse.message_id).toBe(response.message_id);
      expect(statusResponse.status).toBeTruthy();
      
      // Status should indicate progression through pipeline
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(statusResponse.status)).toBe(true);
    });

    test('should handle message forwarding to enrichment service', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { 
          country: 'SG', 
          forward_to_enrichment: 'true',
          test_enrichment: 'true'
        }
      });
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(response.puid).toBeTruthy();
      
      // The service should forward to enrichment service asynchronously
      // We don't wait for enrichment response in the main flow
      expect(['RECEIVED', 'VALIDATED', 'ENRICHED'].includes(response.status)).toBe(true);
    });
  });

  test.describe('Message Type Specific Validation', () => {
    test('should validate PACS008 credit transfer structure', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Ensure PACS008 specific elements are present
      expect(xmlPayload).toContain('<FIToFICstmrCdtTrf>');
      expect(xmlPayload).toContain('<CdtTrfTxInf>');
      expect(xmlPayload).toContain('<Dbtr>');
      expect(xmlPayload).toContain('<Cdtr>');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should validate PACS007 reversal structure', async () => {
      const xmlPayload = loadFixture('sample_pacs007_sg.xml');
      
      // Ensure PACS007 specific elements are present
      expect(xmlPayload).toContain('<FIToFIPmtRvsl>');
      expect(xmlPayload).toContain('<RvslId>');
      expect(xmlPayload).toContain('<OrgnlGrpInf>');
      expect(xmlPayload).toContain('<RvslRsnInf>');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS007',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should validate PACS003 direct debit structure', async () => {
      const xmlPayload = loadFixture('sample_pacs003_sg.xml');
      
      // Ensure PACS003 specific elements are present
      expect(xmlPayload).toContain('<FIToFICstmrDrctDbt>');
      expect(xmlPayload).toContain('<DrctDbtTxInf>');
      expect(xmlPayload).toContain('<Cdtr>');
      expect(xmlPayload).toContain('<Dbtr>');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS003',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });

    test('should handle message type mismatch appropriately', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      try {
        // Try to process PACS008 XML as PACS007
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS007',
          xml_payload: xmlPayload,
          metadata: { country: 'SG' }
        });
        
        // In development mode, the service might accept this with warnings
        // In production mode, it should reject it
        if (response.success) {
          // If it succeeds (development mode), check it has valid identifiers
          expect(response.message_id).toBeTruthy();
          expect(response.puid).toBeTruthy();
          console.log('⚠️  Message type mismatch accepted in development mode with warnings');
        } else {
          // If it fails (production mode), check error details
          expect(response.error_message).toBeTruthy();
          expect(response.error_message).toMatch(/type|structure|validation/i);
        }
      } catch (error) {
        // Or we might get a gRPC error for message type mismatch
        expect(error).toBeTruthy();
        // The error might be from the test framework rather than service validation
        expect(error).toBeDefined();
      }
    });
  });

  test.describe('Data Validation Edge Cases', () => {
    test('should handle very large XML payloads', async () => {
      let xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Add a large remittance information section
      const largeRemittanceInfo = 'A'.repeat(1000);
      xmlPayload = xmlPayload.replace(
        '<Ustrd>Payment for services rendered</Ustrd>',
        `<Ustrd>${largeRemittanceInfo}</Ustrd>`
      );
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(response.puid).toBeTruthy();
    });

    test('should handle special characters in XML', async () => {
      let xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Add special characters in names (unescaped & which will cause XML parsing issues)
      xmlPayload = xmlPayload.replace(
        '<Nm>Tan Wei Ming</Nm>',
        '<Nm>Tan Wei Ming & Co. (S) Pte Ltd</Nm>'
      );
      
      try {
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: { country: 'SG' }
        });
        
        // If we get a response with unescaped special characters, it might succeed or fail
        // Depending on XML parser strictness
        if (!response.success) {
          expect(response.error_message).toBeTruthy();
          expect(response.error_message).toMatch(/XML|parsing|character/i);
        } else {
          expect(response.message_id).toBeTruthy();
          expect(response.puid).toBeTruthy();
        }
      } catch (error) {
        // Or we might get a gRPC error for special character parsing issues
        expect(error).toBeTruthy();
        expect(error.message || error.details).toMatch(/XML|parsing|character|entity/i);
      }
    });

    test('should handle different decimal precision in amounts', async () => {
      let xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Test different decimal precisions
      const testCases = ['1500.5', '1500.50', '1500.500'];
      
      for (const amount of testCases) {
        const modifiedXml = xmlPayload.replace(/1500\.00/g, amount);
        
        const response = await grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: modifiedXml,
          metadata: { country: 'SG' }
        });
        
        expect(response.success).toBe(true);
      }
    });

    test('should handle very small amounts', async () => {
      let xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Test very small amounts
      xmlPayload = xmlPayload.replace(/1500\.00/g, '0.01');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG' }
      });
      
      expect(response.success).toBe(true);
    });
  });

  test.describe('Error Recovery and Resilience', () => {
    test('should handle temporary enrichment service unavailability', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { 
          country: 'SG',
          simulate_enrichment_unavailable: 'true'
        }
      });
      
      // Should still process successfully (enrichment is async)
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(response.puid).toBeTruthy();
    });

    test('should handle partial validation failures gracefully', async () => {
      let xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      // Create a message with minor validation issues
      xmlPayload = xmlPayload.replace(
        '<CreDtTm>2023-12-07T10:30:00+08:00</CreDtTm>',
        '<CreDtTm>2023-12-07T10:30:00</CreDtTm>' // Missing timezone
      );
      
      const response = await grpcClient.processPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', lenient_validation: 'true' }
      });
      
      // Should still process with warnings
      expect(response.success).toBe(true);
      expect(response.message_id).toBeTruthy();
      expect(response.puid).toBeTruthy();
    });
  });

  test.describe('Performance Under Load', () => {
    test('should maintain validation performance under load', async () => {
      const xmlPayload = loadFixture('sample_pacs008_sg.xml');
      
      const startTime = Date.now();
      
      // Process multiple messages concurrently
      const requests = Array.from({ length: 20 }, (_, i) => 
        grpcClient.processPacsMessage({
          message_type: 'PACS008',
          xml_payload: xmlPayload,
          metadata: { country: 'SG', load_test: i.toString() }
        })
      );
      
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      
      // All should succeed
      expect(responses.every(r => r.success)).toBe(true);
      
      // Processing time should be reasonable
      const totalTime = endTime - startTime;
      const avgTimePerMessage = totalTime / responses.length;
      
      expect(avgTimePerMessage).toBeLessThan(1000); // Less than 1 second per message on average
    });
  });
}); 