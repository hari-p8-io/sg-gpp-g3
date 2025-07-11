const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the enrichment service proto
const PROTO_PATH = path.join(__dirname, '../fast-requesthandler-service/proto/enrichment_client.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const enrichmentProto = grpc.loadPackageDefinition(packageDefinition);

// Create enrichment client
const enrichmentClient = new enrichmentProto.gpp.g3.enrichment.EnrichmentService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

// Test message with account 999888777666
const testMessage = `<?xml version="1.0" encoding="UTF-8"?>
<FIToFICstmrCdtTrf>
  <GrpHdr>
    <MsgId>E2E-TEST-1752116559703</MsgId>
    <CreDtTm>2025-07-10T03:02:39.822Z</CreDtTm>
    <NbOfTxs>1</NbOfTxs>
    <SttlmInf>
      <SttlmMtd>CLRG</SttlmMtd>
    </SttlmInf>
  </GrpHdr>
  <CdtTrfTxInf>
    <PmtId>
      <InstrId>INSTR-001</InstrId>
      <EndToEndId>E2E-TEST-1752116559703</EndToEndId>
    </PmtId>
    <PmtTpInf>
      <SvcLvl>
        <Cd>NURG</Cd>
      </SvcLvl>
    </PmtTpInf>
    <IntrBkSttlmAmt Ccy="SGD">5000.00</IntrBkSttlmAmt>
    <ChrgBr>SLEV</ChrgBr>
    <Dbtr>
      <Nm>Test Debtor</Nm>
    </Dbtr>
    <DbtrAcct>
      <Id>
        <Othr>
          <Id>111222333444</Id>
        </Othr>
      </Id>
    </DbtrAcct>
    <DbtrAgt>
      <FinInstnId>
        <BICFI>TESTSG22</BICFI>
      </FinInstnId>
    </DbtrAgt>
    <CdtrAgt>
      <FinInstnId>
        <BICFI>ANZBSG3M</BICFI>
      </FinInstnId>
    </CdtrAgt>
    <Cdtr>
      <Nm>Test Creditor</Nm>
    </Cdtr>
    <CdtrAcct>
      <Id>
        <Othr>
          <Id>999888777666</Id>
        </Othr>
      </Id>
    </CdtrAcct>
    <RmtInf>
      <Ustrd>Test payment for E2E VAM routing</Ustrd>
    </RmtInf>
  </CdtTrfTxInf>
</FIToFICstmrCdtTrf>`;

console.log('🔍 Testing enrichment service response for account 999888777666...\n');

const request = {
  message_id: 'test-enrichment-check',
  puid: 'TEST-VAM-ROUTING',
  message_type: 'PACS008',
  xml_payload: testMessage,
  metadata: {
    country: 'SG',
    currency: 'SGD',
    test_run_id: 'test-enrichment-check'
  },
  timestamp: Date.now()
};

enrichmentClient.EnrichMessage(request, (error, response) => {
  if (error) {
    console.error('❌ Error calling enrichment service:', error);
    process.exit(1);
  }

  console.log('✅ Enrichment service response received:');
  console.log('📄 Success:', response.success);
  console.log('📄 Message ID:', response.message_id);
  console.log('📄 PUID:', response.puid);
  
  if (response.enrichment_data && response.enrichment_data.physical_acct_info) {
    const physicalInfo = response.enrichment_data.physical_acct_info;
    console.log('\n🏦 Physical Account Info:');
    console.log('📄 Account ID:', physicalInfo.acct_id);
    console.log('📄 Account System:', physicalInfo.acct_sys);
    console.log('📄 Account Group:', physicalInfo.acct_group);
    console.log('📄 Country:', physicalInfo.country);
    console.log('📄 Currency:', physicalInfo.currency_code);
    
    if (physicalInfo.acct_sys === 'VAM') {
      console.log('\n✅ SUCCESS: Account correctly identified as VAM system');
    } else {
      console.log('\n❌ ERROR: Account incorrectly identified as', physicalInfo.acct_sys, 'system (expected VAM)');
    }
  } else {
    console.log('\n❌ ERROR: No physical account info returned');
  }

  if (response.enrichment_data && response.enrichment_data.auth_method) {
    console.log('\n🔐 Auth Method:', response.enrichment_data.auth_method);
  }

  console.log('\n📄 Full enrichment data:');
  console.log(JSON.stringify(response.enrichment_data, null, 2));
  
  process.exit(0);
}); 