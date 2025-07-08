// Debug script to test validation logic
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Test data
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

const SAMPLE_ENRICHMENT_DATA = {
  receivedAcctId: "123456789",
  lookupStatusCode: 200,
  lookupStatusDesc: "Success",
  normalizedAcctId: "123456789",
  matchedAcctId: "123456789",
  partialMatch: "N",
  isPhysical: "Y",
  physicalAcctInfo: {
    acctId: "123456789",
    acctSys: "MDZ",
    acctGroup: "SGB",
    country: "SG",
    branchId: "001",
    acctAttributes: {
      acctType: "Physical",
      acctCategory: "RETAIL",
      acctPurpose: "GENERAL_BANKING"
    },
    acctOpsAttributes: {
      isActive: true,
      acctStatus: "ACTIVE",
      openDate: "2023-01-01",
      expiryDate: "2025-12-31",
      restraints: {
        stopAll: false,
        stopDebits: false,
        stopCredits: false,
        stopAtm: false,
        stopEftPos: false,
        stopUnknown: false,
        warnings: []
      }
    },
    bicfi: "ANZBSG3MXXX",
    currencyCode: "SGD"
  }
};

async function testValidation() {
  try {
    // Load proto definition
    const protoPath = path.join(__dirname, 'proto/validation_service.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const validationProto = grpc.loadPackageDefinition(packageDefinition);
    const validationClient = new validationProto.gpp.g3.validation.ValidationService(
      'localhost:50053',
      grpc.credentials.createInsecure()
    );

    console.log('Testing validation with all required fields...');
    
    const request = {
      message_id: 'TEST_MSG_001',
      puid: 'TEST_PUID_001',
      message_type: 'pacs.008.001.02',
      enriched_xml_payload: TEST_XML_PAYLOAD,
      enrichment_data: SAMPLE_ENRICHMENT_DATA,
      timestamp: Date.now(),
      metadata: {}
    };

    console.log('Request:', JSON.stringify(request, null, 2));

    const response = await new Promise((resolve, reject) => {
      validationClient.ValidateEnrichedMessage(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    console.log('Response:', JSON.stringify(response, null, 2));
    
    if (!response.success) {
      console.log('VALIDATION FAILED!');
      console.log('Error message:', response.error_message);
      console.log('Validation result:', response.validation_result);
      console.log('Validation errors:', response.validation_result.errors);
    } else {
      console.log('VALIDATION PASSED!');
    }

    validationClient.close();
  } catch (error) {
    console.error('Error testing validation:', error);
  }
}

testValidation(); 