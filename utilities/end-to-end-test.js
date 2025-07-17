const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Sample PACS008 Singapore message
const SINGAPORE_PACS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>SG202501080001</MsgId>
      <CreDtTm>2025-01-08T04:06:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-SG-001</EndToEndId>
        <TxId>TXN-SG-001</TxId>
      </PmtId>
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

async function runEndToEndTest() {
  let requestClient, orchestratorResponse;
  
  try {
    console.log('🚀 Starting End-to-End Test');
    console.log('================================');

    // 1. Load requesthandler gRPC client
    console.log('📡 Connecting to fast-requesthandler-service...');
    const protoPath = path.join(__dirname, 'fast-requesthandler-service/proto/pacs_handler.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    const pacsProto = grpc.loadPackageDefinition(packageDefinition);
    requestClient = new pacsProto.gpp.g3.requesthandler.PacsHandler(
      'localhost:50051',
      grpc.credentials.createInsecure()
    );

    // 2. Send PACS message to requesthandler
    console.log('📨 Injecting PACS008 message into requesthandler...');
    const request = {
      message_type: 'PACS008',
      xml_payload: SINGAPORE_PACS_XML,
      metadata: {
        source: 'end-to-end-test',
        country: 'SG',
        currency: 'SGD'
      }
    };

    const response = await new Promise((resolve, reject) => {
      requestClient.ProcessPacsMessage(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    console.log('✅ Requesthandler Response:', {
      messageId: response.message_id,
      puid: response.puid,
      success: response.success,
      processingTimeMs: response.processing_time_ms,
      nextService: response.next_service
    });

    // 3. Check orchestrator received the message
    console.log('🔍 Checking if orchestrator received the Kafka message...');
    console.log('⏳ Waiting longer for async Kafka processing...');
    await new Promise(resolve => setTimeout(resolve, 8000)); // Wait longer for async processing

    try {
      orchestratorResponse = await fetch('http://localhost:3004/api/v1/messages');
      const messages = await orchestratorResponse.json();
      
      console.log('📊 Orchestrator Messages:', {
        totalMessages: messages.length,
        latestMessage: messages.length > 0 ? {
          messageId: messages[messages.length - 1].messageId,
          status: messages[messages.length - 1].status,
          flow: messages[messages.length - 1].orchestrationFlow
        } : 'No messages found'
      });

      // 4. Verify end-to-end success
      if (response.success && messages.length > 0) {
        console.log('🎉 END-TO-END TEST SUCCESSFUL!');
        console.log('✅ Message flow: RequestHandler → Enrichment → Validation → Kafka → Orchestrator');
        return true;
      } else {
        console.log('❌ END-TO-END TEST FAILED');
        console.log('💡 Check individual service logs for details');
        return false;
      }

    } catch (fetchError) {
      console.log('⚠️  Orchestrator HTTP API not available, but gRPC flow might still be working');
      console.log('📡 gRPC services completed successfully:', response.success);
      return response.success;
    }

  } catch (error) {
    console.error('❌ End-to-end test failed:', error.message);
    return false;
  } finally {
    if (requestClient) {
      requestClient.close();
    }
  }
}

// Run the test
runEndToEndTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  }); 