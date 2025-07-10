import { test, expect } from '@playwright/test';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Test configuration
const GRPC_PORT = 50052;
const SERVICE_URL = `localhost:${GRPC_PORT}`;
const ACCOUNT_LOOKUP_SERVICE_URL = `localhost:50059`;

// Sample test data
const TEST_XML_PAYLOAD = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>123456789</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

// gRPC client setup
let enrichmentClient: any;

test.beforeAll(async () => {
  // Enable mock mode for enrichment service to bypass external dependencies
  process.env.USE_MOCK_MODE = 'true';
  
  // Load proto definition
  const protoPath = path.join(__dirname, '../proto/enrichment_service.proto');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const enrichmentProto = grpc.loadPackageDefinition(packageDefinition) as any;
  enrichmentClient = new enrichmentProto.gpp.g3.enrichment.EnrichmentService(
    SERVICE_URL,
    grpc.credentials.createInsecure()
  );
});

test.afterAll(async () => {
  if (enrichmentClient) {
    enrichmentClient.close();
  }
});

test.describe('Fast Enrichment Service', () => {
  
  test('should perform health check successfully', async () => {
    const request = {
      service: 'fast-enrichment-service'
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.HealthCheck(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    expect((response as any).status).toBe("SERVING"); // gRPC returns string, not number
    expect((response as any).message).toContain('healthy');
  });

  test.skip('should enrich financial message successfully', async () => {
    const request = {
      message_id: 'TEST_MSG_001',
      puid: 'TEST_PUID_001',
      message_type: 'pacs.008.001.02',
      xml_payload: TEST_XML_PAYLOAD,
      metadata: {
        'source-system': 'test-system'
      },
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.message_id).toBe('TEST_MSG_001');
    expect(res.puid).toBe('TEST_PUID_001');
    expect(res.success).toBe(true);
    expect(res.enriched_payload).toBeDefined();
    expect(res.enrichment_data).toBeDefined();
    expect(res.next_service).toBe('fast-validation-service');
    
    // Verify enrichment data structure
    expect(res.enrichment_data.received_acct_id).toBe('123456789');
    expect(res.enrichment_data.lookup_status_code).toBe(200);
    expect(res.enrichment_data.lookup_status_desc).toBe('Success');
    expect(res.enrichment_data.is_physical).toBe('Y');
  });

  test.skip('should handle corporate account enrichment', async () => {
    const corporateXml = TEST_XML_PAYLOAD.replace(
      '<Id>123456789</Id>',
      '<Id>CORP_ACC_001</Id>'
    );

    const request = {
      message_id: 'TEST_MSG_002',
      puid: 'TEST_PUID_002',
      message_type: 'pacs.008.001.02',
      xml_payload: corporateXml,
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.success).toBe(true);
    expect(res.enrichment_data.received_acct_id).toBe('CORP_ACC_001');
    expect(res.enrichment_data.physical_acct_info).toBeDefined();
    expect(res.enrichment_data.physical_acct_info.acct_attributes.acct_type).toBe('Corporate');
    expect(res.enrichment_data.physical_acct_info.acct_sys).toBe('MEPS');
  });

  test.skip('should handle government account enrichment', async () => {
    const govXml = TEST_XML_PAYLOAD.replace(
      '<Id>123456789</Id>',
      '<Id>GOVT_ACC_001</Id>'
    );

    const request = {
      message_id: 'TEST_MSG_003',
      puid: 'TEST_PUID_003',
      message_type: 'pacs.008.001.02',
      xml_payload: govXml,
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.success).toBe(true);
    expect(res.enrichment_data.received_acct_id).toBe('GOVT_ACC_001');
    expect(res.enrichment_data.physical_acct_info.acct_attributes.acct_type).toBe('Government');
    expect(res.enrichment_data.physical_acct_info.acct_sys).toBe('MEPS');
  });

  test.skip('should handle market-specific enrichment', async () => {
    const sgXml = TEST_XML_PAYLOAD.replace('SGD', 'SGD').replace('SG', 'SG');

    const request = {
      message_id: 'TEST_MSG_004',
      puid: 'TEST_PUID_004',
      message_type: 'pacs.008.001.02',
      xml_payload: sgXml,
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.success).toBe(true);
    expect(res.enrichment_data.received_acct_id).toBe('123456789');
    expect(res.enrichment_data.physical_acct_info.country).toBe('SG');
    expect(res.enrichment_data.physical_acct_info.currency_code).toBe('SGD');
  });

  test.skip('should handle invalid XML payload', async () => {
    const request = {
      message_id: 'TEST_MSG_005',
      puid: 'TEST_PUID_005',
      message_type: 'pacs.008.001.02',
      xml_payload: '<invalid>xml</invalid>',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.success).toBe(false);
    expect(res.error_message).toBeTruthy();
  });

  test.skip('should handle empty account ID', async () => {
    const emptyAcctXml = TEST_XML_PAYLOAD.replace(
      '<Id>123456789</Id>',
      '<Id></Id>'
    );

    const request = {
      message_id: 'TEST_MSG_006',
      puid: 'TEST_PUID_006',
      message_type: 'pacs.008.001.02',
      xml_payload: emptyAcctXml,
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.success).toBe(false);
    expect(res.error_message).toContain('account');
  });

  test.skip('should handle account lookup service failure', async () => {
    // This test simulates when the account lookup service is unavailable
    const request = {
      message_id: 'TEST_MSG_007',
      puid: 'TEST_PUID_007',
      message_type: 'pacs.008.001.02',
      xml_payload: TEST_XML_PAYLOAD,
      metadata: {
        'simulate-lookup-failure': 'true'
      },
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    // Should fall back to mock data
    expect(res.success).toBe(true);
    expect(res.enrichment_data.lookup_status_desc).toContain('mock');
  });

  test.skip('should handle multiple currency formats', async () => {
    const currencies = ['SGD', 'USD', 'EUR'];
    
    for (const currency of currencies) {
      const currencyXml = TEST_XML_PAYLOAD.replace('SGD', currency);
      
      const request = {
        message_id: `TEST_MSG_${currency}`,
        puid: `TEST_PUID_${currency}`,
        message_type: 'pacs.008.001.02',
        xml_payload: currencyXml,
        metadata: {},
        timestamp: Date.now()
      };

      const response = await new Promise((resolve, reject) => {
        enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });

      expect(response).toBeDefined();
      const res = response as any;
      
      expect(res.success).toBe(true);
      expect(res.enrichment_data.physical_acct_info.currency_code).toBe(currency);
    }
  });

  test.skip('should handle different message types', async () => {
    const messageTypes = ['pacs.008.001.02', 'pacs.007.001.02', 'pacs.003.001.02'];
    
    for (const msgType of messageTypes) {
      const request = {
        message_id: `TEST_MSG_${msgType}`,
        puid: `TEST_PUID_${msgType}`,
        message_type: msgType,
        xml_payload: TEST_XML_PAYLOAD,
        metadata: {},
        timestamp: Date.now()
      };

      const response = await new Promise((resolve, reject) => {
        enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });

      expect(response).toBeDefined();
      const res = response as any;
      
      expect(res.success).toBe(true);
      expect(res.message_type).toBe(msgType);
    }
  });

  test.skip('should validate enrichment data structure', async () => {
    const request = {
      message_id: 'TEST_MSG_STRUCTURE',
      puid: 'TEST_PUID_STRUCTURE',
      message_type: 'pacs.008.001.02',
      xml_payload: TEST_XML_PAYLOAD,
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      enrichmentClient.EnrichMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.success).toBe(true);
    expect(res.enrichment_data).toBeDefined();
    expect(res.enrichment_data.physical_acct_info).toBeDefined();
    expect(res.enrichment_data.physical_acct_info.acct_attributes).toBeDefined();
    expect(res.enrichment_data.physical_acct_info.acct_ops_attributes).toBeDefined();
    expect(res.enrichment_data.physical_acct_info.acct_ops_attributes.restraints).toBeDefined();
    
    // Verify required fields
    expect(res.enrichment_data.received_acct_id).toBeTruthy();
    expect(res.enrichment_data.lookup_status_code).toBeTruthy();
    expect(res.enrichment_data.lookup_status_desc).toBeTruthy();
    expect(res.enrichment_data.is_physical).toBeTruthy();
    expect(res.enrichment_data.physical_acct_info.acct_id).toBeTruthy();
    expect(res.enrichment_data.physical_acct_info.acct_sys).toBeTruthy();
    expect(res.enrichment_data.physical_acct_info.country).toBeTruthy();
    expect(res.enrichment_data.physical_acct_info.currency_code).toBeTruthy();
  });
}); 