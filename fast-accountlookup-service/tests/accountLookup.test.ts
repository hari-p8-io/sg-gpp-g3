import { test, expect } from '@playwright/test';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

interface AccountLookupClient {
  LookupAccount: (request: any, callback: (error: any, response: any) => void) => void;
  HealthCheck: (request: any, callback: (error: any, response: any) => void) => void;
  GetServiceInfo: (request: any, callback: (error: any, response: any) => void) => void;
}

let client: AccountLookupClient;

test.beforeAll(async () => {
  // Load proto file
  const PROTO_PATH = path.join(__dirname, '../proto/accountlookup_service.proto');
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  const AccountLookupService = (protoDescriptor['gpp'] as any).g3.accountlookup.AccountLookupService;

  // Create gRPC client
  client = new AccountLookupService('localhost:50059', grpc.credentials.createInsecure());

  // Wait a bit for service to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.describe('Account Lookup Service - End-to-End Tests', () => {
  
  test('should perform health check successfully', async () => {
    const request = {
      service: 'fast-accountlookup-service'
    };

    const response = await new Promise((resolve, reject) => {
      client.HealthCheck(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    expect(response).toBeDefined();
    expect((response as any).status).toBe("SERVING"); // gRPC returns string enum
    expect((response as any).message).toBe('Service is healthy');
    expect(parseInt((response as any).timestamp)).toBeGreaterThan(0);
  });

  test('should get service info successfully', async () => {
    const request = {
      requester: 'playwright-test'
    };

    const response = await new Promise((resolve, reject) => {
      client.GetServiceInfo(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    expect(response).toBeDefined();
    expect((response as any).service_name).toBe('fast-accountlookup-service');
    expect((response as any).version).toBe('1.0.0');
    expect((response as any).is_stubbed).toBe(true);
    expect((response as any).environment).toBe('test'); // Environment is set to test when running tests
    expect((response as any).capabilities).toContain('account-lookup');
    expect((response as any).capabilities).toContain('singapore-banking-data');
  });

  test('should lookup account successfully for standard account', async () => {
    const request = {
      message_id: 'test-msg-001',
      puid: 'G3ITEST123456789',
      cdtr_acct_id: 'SPSERVICES001',
      message_type: 'PACS008',
      metadata: {
        country: 'SG',
        currency: 'SGD'
      },
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    expect(response).toBeDefined();
    const resp = response as any;
    
    // Validate basic response
    expect(resp.message_id).toBe(request.message_id);
    expect(resp.puid).toBe(request.puid);
    expect(resp.success).toBe(true);
    expect(resp.lookup_source).toBe('STUB');
    expect(parseInt(resp.processed_at)).toBeGreaterThan(0);

    // Validate enrichment data
    expect(resp.enrichment_data).toBeDefined();
    expect(resp.enrichment_data.received_acct_id).toBe(request.cdtr_acct_id);
    expect(resp.enrichment_data.lookup_status_code).toBe(200);
    expect(resp.enrichment_data.lookup_status_desc).toBe('Success');
    expect(resp.enrichment_data.normalized_acct_id).toBe('SPSERVICES001');
    expect(resp.enrichment_data.matched_acct_id).toBe(request.cdtr_acct_id);
    expect(resp.enrichment_data.partial_match).toBe('N');
    expect(resp.enrichment_data.is_physical).toBe('Y');

    // Validate physical account info
    expect(resp.enrichment_data.physical_acct_info).toBeDefined();
    const physicalInfo = resp.enrichment_data.physical_acct_info;
    expect(physicalInfo.acct_id).toBe(request.cdtr_acct_id);
    expect(physicalInfo.country).toBe('SG');
    expect(physicalInfo.currency_code).toBe('SGD');
    expect(physicalInfo.bicfi).toBe('ANZBSG3MXXX');
    expect(physicalInfo.acct_sys).toBe('FAST'); // SP services use FAST system
    expect(physicalInfo.acct_group).toBe('SGB');

    // Validate account attributes
    expect(physicalInfo.acct_attributes).toBeDefined();
    expect(physicalInfo.acct_attributes.acct_type).toBe('Utility');
    expect(physicalInfo.acct_attributes.acct_category).toBe('UTILITY');
    expect(physicalInfo.acct_attributes.acct_purpose).toBe('UTILITY_SERVICES');

    // Validate operational attributes
    expect(physicalInfo.acct_ops_attributes).toBeDefined();
    const opsAttrs = physicalInfo.acct_ops_attributes;
    expect(opsAttrs.is_active).toBe('Yes');
    expect(opsAttrs.acct_status).toBe('Active');
    expect(opsAttrs.open_date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(opsAttrs.expiry_date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    // Validate restraints
    expect(opsAttrs.restraints).toBeDefined();
    const restraints = opsAttrs.restraints;
    expect(restraints.stop_all).toBe('N');
    expect(restraints.stop_debits).toBe('N');
    expect(restraints.stop_credits).toBe('N');
    expect(restraints.stop_atm).toBe('N');
    expect(restraints.stop_eft_pos).toBe('N');
    expect(restraints.stop_unknown).toBe('N');
    expect(restraints.warnings).toBe('None');
  });

  test('should lookup corporate account successfully', async () => {
    const request = {
      message_id: 'test-msg-002',
      puid: 'G3ITEST123456790',
      cdtr_acct_id: 'CORP123456789',
      message_type: 'PACS008',
      metadata: {
        country: 'SG',
        currency: 'SGD'
      },
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    expect(resp.success).toBe(true);
    expect(resp.enrichment_data.physical_acct_info.acct_attributes.acct_type).toBe('Corporate');
    expect(resp.enrichment_data.physical_acct_info.acct_attributes.acct_category).toBe('CORPORATE');
    expect(resp.enrichment_data.physical_acct_info.acct_attributes.acct_purpose).toBe('BUSINESS_OPERATIONS');
    expect(resp.enrichment_data.physical_acct_info.acct_sys).toBe('MDZ'); // Corporate accounts use MDZ (not MEPS)
  });

  test('should handle account not found scenario', async () => {
    const request = {
      message_id: 'test-msg-003',
      puid: 'G3ITEST123456791',
      cdtr_acct_id: 'NOTFOUND12345',
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    expect(resp.success).toBe(false);
    expect(resp.error_code).toBe('LOOKUP_ACCOUNT_NOT_FOUND_002');
    expect(resp.error_message).toBe('Account not found in system');
    expect(resp.enrichment_data.lookup_status_code).toBe(404);
    expect(resp.enrichment_data.lookup_status_desc).toBe('Account not found in system');
    expect(resp.enrichment_data.is_physical).toBe('UNKNOWN');
    expect(resp.enrichment_data.physical_acct_info).toBeNull();
  });

  test('should handle inactive account scenario', async () => {
    const request = {
      message_id: 'test-msg-004',
      puid: 'G3ITEST123456792',
      cdtr_acct_id: 'INACTIVE12345',
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    expect(resp.success).toBe(true); // Account found but inactive
    expect(resp.enrichment_data.lookup_status_code).toBe(200);
    expect(resp.enrichment_data.lookup_status_desc).toBe('Account found but inactive');
    expect(resp.enrichment_data.physical_acct_info.acct_ops_attributes.is_active).toBe('No');
    expect(resp.enrichment_data.physical_acct_info.acct_ops_attributes.acct_status).toBe('Suspended');
    
    // Check that all restraints are set to 'Y' for inactive account
    const restraints = resp.enrichment_data.physical_acct_info.acct_ops_attributes.restraints;
    expect(restraints.stop_all).toBe('Y');
    expect(restraints.stop_debits).toBe('Y');
    expect(restraints.stop_credits).toBe('Y');
    expect(restraints.warnings).toBe('Account suspended');
  });

  test('should handle processing error scenario', async () => {
    const request = {
      message_id: 'test-msg-005',
      puid: 'G3ITEST123456793',
      cdtr_acct_id: 'ERROR12345',
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    expect(resp.success).toBe(false);
    expect(resp.error_code).toBe('LOOKUP_PROCESSING_ERROR_004');
    expect(resp.error_message).toBe('Simulated processing error');
  });

  test('should validate input and return error for invalid account ID', async () => {
    const request = {
      message_id: 'test-msg-006',
      puid: 'G3ITEST123456794',
      cdtr_acct_id: '123', // Too short
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    expect(resp.success).toBe(false);
    expect(resp.error_code).toBe('LOOKUP_INVALID_INPUT_001');
    expect(resp.error_message).toBe('Invalid CdtrAcct ID format');
  });

  test('should validate input and return error for missing required fields', async () => {
    const request = {
      message_id: '',
      puid: 'G3ITEST123456795',
      cdtr_acct_id: 'VALIDACCT001',
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    expect(resp.success).toBe(false);
    expect(resp.error_code).toBe('LOOKUP_INVALID_INPUT_001');
    expect(resp.error_message).toBe('Message ID is required');
  });

  test('should handle test accounts with varied data', async () => {
    const request = {
      message_id: 'test-msg-007',
      puid: 'G3ITEST123456796',
      cdtr_acct_id: 'TESTPREMIUMACCT12345', // 19 characters - should trigger high-value warning
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    
    expect(resp.success).toBe(true);
    
    if (resp.success && resp.enrichment_data && resp.enrichment_data.physical_acct_info) {
      expect(resp.enrichment_data.physical_acct_info.acct_attributes.acct_category).toBe('PREMIUM');
      // The warning is set for accounts with length > 15, so this should have the high-value warning
      expect(resp.enrichment_data.physical_acct_info.acct_ops_attributes.restraints.warnings).toBe('High-value account');
    }
  });

  test('should return consistent response times under load', async () => {
    const requests = Array.from({ length: 10 }, (_, i) => ({
      message_id: `load-test-${i}`,
      puid: `G3ILOAD${i.toString().padStart(9, '0')}`,
      cdtr_acct_id: `LOADTEST${i.toString().padStart(3, '0')}`,
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    }));

    const responses = await Promise.all(
      requests.map(request => 
        new Promise((resolve, reject) => {
          const startTime = Date.now();
          client.LookupAccount(request, (error: any, response: any) => {
            if (error) reject(error);
            else {
              const endTime = Date.now();
              resolve({ ...response, responseTime: endTime - startTime });
            }
          });
        })
      )
    );

    // Verify all requests succeeded
    responses.forEach((response: any) => {
      expect(response.success).toBe(true);
      expect(response.responseTime).toBeLessThan(500); // Should be under 500ms
    });

    // Check average response time
    const avgResponseTime = responses.reduce((sum: number, resp: any) => sum + resp.responseTime, 0) / responses.length;
    expect(avgResponseTime).toBeLessThan(500); // Average should be under 500ms for stubbed service
  });

  test('should maintain data consistency across multiple calls', async () => {
    const accountId = 'CONSISTENCY001';
    const request = {
      message_id: 'consistency-test',
      puid: 'G3ICONSIST12345',
      cdtr_acct_id: accountId,
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    // Make multiple calls for the same account
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => 
        new Promise((resolve, reject) => {
          client.LookupAccount(request, (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
          });
        })
      )
    );

    // Verify all responses are identical
    const firstResponse = responses[0] as any;
    responses.forEach((response: any) => {
      expect(response.enrichment_data.received_acct_id).toBe(firstResponse.enrichment_data.received_acct_id);
      expect(response.enrichment_data.normalized_acct_id).toBe(firstResponse.enrichment_data.normalized_acct_id);
      expect(response.enrichment_data.physical_acct_info.acct_attributes.acct_type).toBe(firstResponse.enrichment_data.physical_acct_info.acct_attributes.acct_type);
      expect(response.enrichment_data.physical_acct_info.bicfi).toBe(firstResponse.enrichment_data.physical_acct_info.bicfi);
      expect(response.enrichment_data.physical_acct_info.currency_code).toBe(firstResponse.enrichment_data.physical_acct_info.currency_code);
    });
  });
});

test.describe('Account Lookup Service - Singapore Banking Compliance', () => {
  
  test('should return Singapore-compliant banking data', async () => {
    const request = {
      message_id: 'compliance-test-001',
      puid: 'G3ICOMP123456789',
      cdtr_acct_id: 'SGCOMPLIANCE001',
      message_type: 'PACS008',
      metadata: {},
      timestamp: Date.now()
    };

    const response = await new Promise((resolve, reject) => {
      client.LookupAccount(request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    const resp = response as any;
    const physicalInfo = resp.enrichment_data.physical_acct_info;
    
    // Verify Singapore compliance
    expect(physicalInfo.country).toBe('SG');
    expect(physicalInfo.currency_code).toBe('SGD');
    expect(physicalInfo.bicfi).toMatch(/SG/); // Should contain SG for Singapore
    expect(['MDZ', 'VAM']).toContain(physicalInfo.acct_sys); // Valid SG systems (only MDZ and VAM)
    expect(['SGB', 'RETAIL', 'CORPORATE']).toContain(physicalInfo.acct_group); // Valid SG groups
    
    // Verify date formats (DD/MM/YYYY)
    expect(physicalInfo.acct_ops_attributes.open_date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(physicalInfo.acct_ops_attributes.expiry_date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    
    // Verify branch code format (3 digits)
    if (physicalInfo.branch_id) {
      expect(physicalInfo.branch_id).toMatch(/^\d{3}$/);
    }
  });
}); 