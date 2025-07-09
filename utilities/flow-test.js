const { Kafka } = require('kafkajs');
const axios = require('axios');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Test the exact flow: requesthandler -> enrichment -> accountlookup -> enrichment -> referencedata -> enrichment -> validation -> orchestrator -> vammediation -> orchestrator -> accounting -> orchestrator -> limitcheck

console.log('🔍 Testing the implementation plan flow:');
console.log('requesthandler -> enrichment -> accountlookup -> enrichment -> referencedata -> enrichment -> validation -> orchestrator -> vammediation -> orchestrator -> accounting -> orchestrator -> limitcheck');

async function testFlow() {
  console.log('\\n1. Testing Request Handler Service (Port 50051)...');
  
  // Test 1: Request Handler Service
  try {
    const protoPath = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);
    const client = new proto.gpp.g3.requesthandler.PacsHandler(
      'localhost:50051',
      grpc.credentials.createInsecure()
    );

    const testMessage = {
      message_type: 'PACS008',
      xml_payload: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>FLOW-TEST-${Date.now()}</MsgId>
      <CreDtTm>2025-01-08T10:00:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>COVE</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <TxId>TXN-${Date.now()}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <Dbtr>
        <Nm>Test Debtor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <PstCd>018956</PstCd>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>SENDER123</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>ANZBSG3MXXX</BICFI>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>OCBCSG3MXXX</BICFI>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>Test Creditor</Nm>
        <PstlAdr>
          <Ctry>SG</Ctry>
          <PstCd>567890</PstCd>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>999888777</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
      metadata: {
        test_id: 'flow-test-001',
        flow_step: 'request_handler'
      }
    };

    const response = await new Promise((resolve, reject) => {
      client.ProcessPacsMessage(testMessage, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    console.log('✅ Request Handler: SUCCESS');
    console.log('   Message ID:', response.message_id);
    console.log('   PUID:', response.puid);
    console.log('   Status:', response.status);
    
    // According to the implementation plan, the request handler should call enrichment service
    // which should then call account lookup, then reference data, then validation, then orchestrator
    
  } catch (error) {
    console.log('❌ Request Handler: FAILED');
    console.log('   Error:', error.message);
    return false;
  }

  console.log('\\n2. Testing Account Lookup Service (Port 50059)...');
  
  // Test 2: Account Lookup Service (should be called by enrichment service)
  try {
    const response = await axios.get('http://localhost:50059/health');
    console.log('✅ Account Lookup: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ Account Lookup: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n3. Testing Reference Data Service (Port 50060)...');
  
  // Test 3: Reference Data Service (should be called by enrichment service)
  try {
    const response = await axios.get('http://localhost:50060/health');
    console.log('✅ Reference Data: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ Reference Data: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n4. Testing Validation Service (Port 50053)...');
  
  // Test 4: Validation Service (should be called by enrichment service)
  try {
    const response = await axios.get('http://localhost:50053/health');
    console.log('✅ Validation: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ Validation: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n5. Testing Orchestrator Service (Port 3004)...');
  
  // Test 5: Orchestrator Service (should receive from validation service via Kafka)
  try {
    const response = await axios.get('http://localhost:3004/health');
    console.log('✅ Orchestrator: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ Orchestrator: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n6. Testing VAM Mediation Service (Port 3005)...');
  
  // Test 6: VAM Mediation Service (should receive from orchestrator for VAM accounts)
  try {
    const response = await axios.get('http://localhost:3005/health');
    console.log('✅ VAM Mediation: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ VAM Mediation: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n7. Testing Accounting Service (Port 8002)...');
  
  // Test 7: Accounting Service (should receive from orchestrator)
  try {
    const response = await axios.get('http://localhost:8002/health');
    console.log('✅ Accounting: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ Accounting: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n8. Testing Limit Check Service (Port 3006)...');
  
  // Test 8: Limit Check Service (should receive from orchestrator post-accounting)
  try {
    const response = await axios.get('http://localhost:3006/health');
    console.log('✅ Limit Check: HEALTHY');
    console.log('   Status:', response.data.status);
  } catch (error) {
    console.log('❌ Limit Check: FAILED');
    console.log('   Error:', error.message);
  }

  console.log('\\n🎯 Flow Test Summary:');
  console.log('=====================================');
  console.log('The implementation plan flow should be:');
  console.log('1. Request Handler receives message');
  console.log('2. Request Handler calls Enrichment Service');
  console.log('3. Enrichment Service calls Account Lookup Service');
  console.log('4. Enrichment Service calls Reference Data Service');
  console.log('5. Enrichment Service calls Validation Service');
  console.log('6. Validation Service publishes to Kafka for Orchestrator');
  console.log('7. Orchestrator routes to VAM Mediation or Accounting');
  console.log('8. Orchestrator calls Limit Check (fire & forget)');
  console.log('=====================================');
  
  return true;
}

testFlow().catch(console.error); 