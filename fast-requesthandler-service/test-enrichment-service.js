#!/usr/bin/env node

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto definition
const PROTO_PATH = path.join(__dirname, 'proto/enrichment_client.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const enrichmentProto = grpc.loadPackageDefinition(packageDefinition);
const client = new enrichmentProto.gpp.g3.enrichment.EnrichmentService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

async function testEnrichmentService() {
  console.log('🧪 Testing Fast Enrichment Service...\n');
  
  // Test 1: Health Check
  console.log('📋 Test 1: Health Check');
  await new Promise((resolve) => {
    client.HealthCheck({ service: 'enrichment' }, (error, response) => {
      if (error) {
        console.log('❌ Health check failed:', error.message);
      } else {
        console.log('✅ Health check passed:', response);
      }
      resolve();
    });
  });
  
  // Test 2: Enrichment Request
  console.log('\n📋 Test 2: Enrichment Request');
  const enrichmentRequest = {
    message_id: 'test-123',
    puid: 'G3ITEST123456789',
    message_type: 'PACS008',
    xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG-SG-001-TEST</MsgId>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>OCBCSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
    metadata: { test: 'true' },
    timestamp: Date.now()
  };

  await new Promise((resolve) => {
    client.EnrichPacsMessage(enrichmentRequest, (error, response) => {
      if (error) {
        console.log('❌ Enrichment failed:', error.message);
      } else {
        console.log('✅ Enrichment successful!');
        console.log('   📊 Message ID:', response.message_id);
        console.log('   📊 PUID:', response.puid);
        console.log('   📊 Success:', response.success);
        console.log('   📊 Next Service:', response.next_service);
        console.log('   📊 Enrichment Data:', JSON.stringify(response.enrichment_data, null, 2));
        
        // Show that payload was enriched
        if (response.enriched_payload.includes('EnrichmentData')) {
          console.log('   📊 ✅ Payload was enriched with additional data');
        }
      }
      resolve();
    });
  });
  
  console.log('\n🎉 Test completed!');
}

testEnrichmentService().catch(console.error); 