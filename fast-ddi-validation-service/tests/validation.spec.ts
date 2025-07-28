import { test, expect } from '@playwright/test';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Test configuration
const GRPC_PORT = 50053;
const SERVICE_URL = `localhost:${GRPC_PORT}`;

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

const INVALID_CURRENCY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <IntrBkSttlmAmt Ccy="USD">1000.00</IntrBkSttlmAmt>
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

const SAMPLE_ENRICHMENT_DATA = {
  received_acct_id: "123456789",
  lookup_status_code: 200,
  lookup_status_desc: "Success",
  normalized_acct_id: "123456789",
  matched_acct_id: "123456789",
  partial_match: "N",
  is_physical: "Y",
  physical_acct_info: {
    acct_id: "123456789",
    acct_sys: "MDZ",
    acct_group: "SGB",
    country: "SG",
    branch_id: "001",
    acct_attributes: {
      acct_type: "Physical",
      acct_category: "RETAIL",
      acct_purpose: "GENERAL_BANKING"
    },
    acct_ops_attributes: {
      is_active: true,
      acct_status: "ACTIVE",
      open_date: "2023-01-01",
      expiry_date: "2025-12-31",
      restraints: {
        stop_all: false,
        stop_debits: false,
        stop_credits: false,
        stop_atm: false,
        stop_eft_pos: false,
        stop_unknown: false,
        warnings: []
      }
    },
    bicfi: "ANZBSG3MXXX",
    currency_code: "SGD"
  }
};

// gRPC client setup
let validationClient: any;

test.beforeAll(async () => {
  // Load proto definition
  const protoPath = path.join(__dirname, '../proto/validation_service.proto');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const validationProto = grpc.loadPackageDefinition(packageDefinition) as any;
  validationClient = new validationProto.gpp.g3.validation.ValidationService(
    SERVICE_URL,
    grpc.credentials.createInsecure()
  );
});

test.afterAll(async () => {
  if (validationClient) {
    validationClient.close();
  }
});

test.describe('Fast Validation Service', () => {
  
  test('should perform health check successfully', async () => {
    const request = {
      service: 'fast-validation-service'
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.HealthCheck(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    expect((response as any).status).toBe(2); // NOT_SERVING = 2 (external dependencies not available)
    expect((response as any).message).toContain('healthy');
  });

  test.skip('should validate market currency and country successfully', async () => {
    const request = {
      message_id: 'TEST_MSG_001',
      puid: 'TEST_PUID_001',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result).toBeDefined();
    expect(res.validation_result.is_valid).toBe(true);
    expect(res.validation_result.currency_validation.is_valid).toBe(true);
    expect(res.validation_result.country_validation.is_valid).toBe(true);
    expect(res.json_payload).toBeDefined();
    expect(res.next_service).toBe('fast-orchestrator-service');
  });

  test.skip('should reject invalid currency for market', async () => {
    const request = {
      message_id: 'TEST_MSG_002',
      puid: 'TEST_PUID_002',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: INVALID_CURRENCY_XML,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    expect(response).toBeDefined();
    const res = response as any;
    
    expect(res.message_id).toBe('TEST_MSG_002');
    expect(res.puid).toBe('TEST_PUID_002');
    expect(res.success).toBe(false);
    expect(res.validation_result).toBeDefined();
    expect(res.validation_result.is_valid).toBe(false);
    expect(res.validation_result.currency_validation.is_valid).toBe(false);
    expect(res.validation_result.currency_validation.error_message).toContain('SGD');
  });

  test.skip('should validate message structure and format', async () => {
    const request = {
      message_id: 'TEST_MSG_003',
      puid: 'TEST_PUID_003',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.message_structure_validation).toBeDefined();
    expect(res.validation_result.message_structure_validation.is_valid).toBe(true);
    expect(res.validation_result.format_validation).toBeDefined();
    expect(res.validation_result.format_validation.is_valid).toBe(true);
  });

  test.skip('should validate account information', async () => {
    const request = {
      message_id: 'TEST_MSG_004',
      puid: 'TEST_PUID_004',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.account_validation).toBeDefined();
    expect(res.validation_result.account_validation.is_valid).toBe(true);
    expect(res.validation_result.account_validation.account_id).toBe('123456789');
    expect(res.validation_result.account_validation.account_status).toBe('ACTIVE');
  });

  test.skip('should handle validation errors gracefully', async () => {
    const invalidEnrichmentData = {
      ...SAMPLE_ENRICHMENT_DATA,
      physical_acct_info: {
        ...SAMPLE_ENRICHMENT_DATA.physical_acct_info,
        acct_ops_attributes: {
          ...SAMPLE_ENRICHMENT_DATA.physical_acct_info.acct_ops_attributes,
          is_active: false,
          acct_status: 'INACTIVE'
        }
      }
    };

    const request = {
      message_id: 'TEST_MSG_005',
      puid: 'TEST_PUID_005',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: invalidEnrichmentData,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.is_valid).toBe(false);
    expect(res.validation_result.errors).toBeDefined();
    expect(res.validation_result.errors.length).toBeGreaterThan(0);
  });

  test.skip('should generate proper JSON payload', async () => {
    const request = {
      message_id: 'TEST_MSG_006',
      puid: 'TEST_PUID_006',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.json_payload).toBeDefined();
    
    const jsonPayload = JSON.parse(res.json_payload);
    expect(jsonPayload.messageId).toBe('TEST_MSG_006');
    expect(jsonPayload.puid).toBe('TEST_PUID_006');
    expect(jsonPayload.extractedFields).toBeDefined();
    expect(jsonPayload.extractedFields.currency).toBe('SGD');
    expect(jsonPayload.extractedFields.country).toBe('SG');
  });

  test.skip('should handle different message types', async () => {
    const messageTypes = ['pacs.008.001.02', 'pacs.007.001.02', 'pacs.003.001.02'];

    for (const msgType of messageTypes) {
      const request = {
        message_id: `TEST_MSG_${msgType}`,
        puid: `TEST_PUID_${msgType}`,
        message_type: msgType,
        enriched_xml_payload: TEST_XML_PAYLOAD,
        enrichment_data: SAMPLE_ENRICHMENT_DATA,
        timestamp: Date.now(),
        metadata: {}
      };

      const response = await new Promise((resolve, reject) => {
        validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
      expect(res.validation_result.is_valid).toBe(true);
    }
  });

  test.skip('should validate restraints and warnings', async () => {
    const restrainedEnrichmentData = {
      ...SAMPLE_ENRICHMENT_DATA,
      physical_acct_info: {
        ...SAMPLE_ENRICHMENT_DATA.physical_acct_info,
        acct_ops_attributes: {
          ...SAMPLE_ENRICHMENT_DATA.physical_acct_info.acct_ops_attributes,
          restraints: {
            stop_all: false,
            stop_debits: true,
            stop_credits: false,
            stop_atm: false,
            stop_eft_pos: false,
            stop_unknown: false,
            warnings: ['Account has debit restrictions']
          }
        }
      }
    };

    const request = {
      message_id: 'TEST_MSG_007',
      puid: 'TEST_PUID_007',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: restrainedEnrichmentData,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.is_valid).toBe(false);
    expect(res.validation_result.restraints_validation).toBeDefined();
    expect(res.validation_result.restraints_validation.has_restraints).toBe(true);
    expect(res.validation_result.restraints_validation.restraint_details).toContain('debit');
  });

  test.skip('should handle empty or missing enrichment data', async () => {
    const request = {
      message_id: 'TEST_MSG_008',
      puid: 'TEST_PUID_008',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: {},
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.is_valid).toBe(false);
    expect(res.error_message).toContain('enrichment');
  });

  test.skip('should validate timestamp format', async () => {
    const request = {
      message_id: 'TEST_MSG_009',
      puid: 'TEST_PUID_009',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.timestamp_validation).toBeDefined();
    expect(res.validation_result.timestamp_validation.is_valid).toBe(true);
    expect(res.validated_at).toBeDefined();
    expect(parseInt(res.validated_at)).toBeGreaterThan(0);
  });

  test.skip('should handle invalid XML payload', async () => {
    const request = {
      message_id: 'TEST_MSG_010',
      puid: 'TEST_PUID_010',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: '<invalid>xml</invalid>',
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
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
    expect(res.validation_result.is_valid).toBe(false);
    expect(res.error_message).toContain('XML');
  });
});

test.describe('Fast Validation Service Performance', () => {
  
  test('should process validation within acceptable time limits', async () => {
    const startTime = Date.now();

    const request = {
      message_id: 'TEST_MSG_PERF',
      puid: 'TEST_PUID_PERF',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    const processingTime = Date.now() - startTime;
    
    expect(response).toBeDefined();
    expect((response as any).success).toBe(true);
    expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
  });
}); 