const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto definition
const PROTO_PATH = path.join(__dirname, 'proto/pacs_handler.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const pacsProto = grpc.loadPackageDefinition(packageDefinition);
const client = new pacsProto.gpp.g3.requesthandler.PacsHandler(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

async function testBasicFunctionality() {
  try {
    console.log('Testing basic gRPC functionality...');
    
    // Test 1: Clear mock storage
    console.log('\n1. Clearing mock storage...');
    await new Promise((resolve, reject) => {
      client.ClearMockStorage({}, (error, response) => {
        if (error) {
          console.error('❌ Clear mock storage failed:', error);
          reject(error);
        } else {
          console.log('✅ Mock storage cleared:', response);
          resolve(response);
        }
      });
    });
    
    // Test 2: Check storage size
    console.log('\n2. Checking storage size...');
    const size = await new Promise((resolve, reject) => {
      client.GetMockStorageSize({}, (error, response) => {
        if (error) {
          console.error('❌ Get storage size failed:', error);
          reject(error);
        } else {
          console.log('✅ Storage size:', response);
          resolve(response.size);
        }
      });
    });
    
    // Test 3: Process a message
    console.log('\n3. Processing a test message...');
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG202501080001</MsgId>
      <CreDtTm>2025-01-08T14:30:00+08:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId><InstrId>INST001</InstrId><EndToEndId>E2E001</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
      <Dbtr><Nm>Singapore Corp Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>018956</PstCd></PstlAdr></Dbtr>
      <DbtrAcct><Id><Othr><Id>123456789</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>ANZBSG3MXXX</BICFI></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><BICFI>OCBCSG3MXXX</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>Singapore Beneficiary Ltd</Nm><PstlAdr><Ctry>SG</Ctry><PstCd>567890</PstCd></PstlAdr></Cdtr>
      <CdtrAcct><Id><Othr><Id>987654321</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

    const response = await new Promise((resolve, reject) => {
      client.ProcessPacsMessage({
        message_type: 'PACS008',
        xml_payload: xmlPayload,
        metadata: { country: 'SG', currency: 'SGD' }
      }, (error, response) => {
        if (error) {
          console.error('❌ Process message failed:', error);
          reject(error);
        } else {
          console.log('✅ Message processed:', response);
          resolve(response);
        }
      });
    });
    
    // Test 4: Get all messages
    console.log('\n4. Getting all messages...');
    const allMessages = await new Promise((resolve, reject) => {
      client.GetAllMessages({}, (error, response) => {
        if (error) {
          console.error('❌ Get all messages failed:', error);
          reject(error);
        } else {
          console.log('✅ All messages:', response);
          resolve(response.messages);
        }
      });
    });
    
    console.log(`\nFound ${allMessages.length} messages in database`);
    
    // Test 5: Get message status
    console.log('\n5. Getting message status...');
    const status = await new Promise((resolve, reject) => {
      client.GetMessageStatus({
        message_id: response.message_id
      }, (error, response) => {
        if (error) {
          console.error('❌ Get message status failed:', error);
          reject(error);
        } else {
          console.log('✅ Message status:', response);
          resolve(response);
        }
      });
    });
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testBasicFunctionality().then(() => {
  console.log('✅ Debug test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug test failed:', error);
  process.exit(1);
}); 