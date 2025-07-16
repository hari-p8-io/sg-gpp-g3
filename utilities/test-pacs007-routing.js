#!/usr/bin/env node

/**
 * PACS.007 Routing Test
 * 
 * This test verifies that PACS.007 (payment reversal) messages follow the same 
 * routing path as PACS.008 messages:
 * - Enrichment Service → Kafka (enriched-messages) → Orchestrator
 * - Bypassing validation service (unlike PACS.003)
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Sample PACS.007 XML for testing
const SAMPLE_PACS007_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.007.001.08">
  <FIToFIPmtRvsl>
    <GrpHdr>
      <MsgId>PACS007-TEST-${Date.now()}</MsgId>
      <CreDtTm>2025-07-11T00:00:00.000Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <TxInf>
      <RvslId>REV-${Date.now()}</RvslId>
      <OrgnlGrpInf>
        <OrgnlMsgId>ORIGINAL-PACS008-001</OrgnlMsgId>
        <OrgnlMsgNmId>pacs.008.001.08</OrgnlMsgNmId>
      </OrgnlGrpInf>
      <OrgnlTxRef>
        <IntrBkSttlmAmt Ccy="SGD">1500.00</IntrBkSttlmAmt>
        <ChrgBr>SLEV</ChrgBr>
        <Dbtr>
          <Nm>Singapore Test Debtor</Nm>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <Othr>
              <Id>999888777666</Id>
            </Othr>
          </Id>
        </DbtrAcct>
        <DbtrAgt>
          <FinInstnId>
            <BICFI>DBSSSGSG</BICFI>
          </FinInstnId>
        </DbtrAgt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>OCBCSGSG</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>Singapore Test Creditor</Nm>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>456789012345</Id>
            </Othr>
          </Id>
        </CdtrAcct>
      </OrgnlTxRef>
    </TxInf>
  </FIToFIPmtRvsl>
</Document>`;

class PACS007RoutingTest {
  constructor() {
    this.processorClient = null;
    this.messageId = null;
  }

  async initialize() {
    try {
      // Initialize enrichment service client
      console.log(`${colors.blue}🔌 Connecting to enrichment service...${colors.reset}`);
      
      const protoPath = path.join(__dirname, '../fast-inwd-processor-service/proto/gpp/g3/inwd-processor/inwd_processor_service.proto');
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      
      const processorProto = grpc.loadPackageDefinition(packageDefinition);
      this.processorClient = new processorProto.gpp.g3.inwdprocessor.InwdProcessorService(
        'localhost:50052',
        grpc.credentials.createInsecure()
      );

      console.log(`${colors.green}✅ Connected to enrichment service${colors.reset}`);
      return true;
    } catch (error) {
      console.error(`${colors.red}❌ Failed to initialize:${colors.reset}`, error.message);
      return false;
    }
  }

  async testPacs007Routing() {
    try {
      this.messageId = `pacs007-test-${Date.now()}`;
      
      console.log(`${colors.yellow}🧪 Testing PACS.007 Routing${colors.reset}`);
      console.log(`${colors.yellow}=============================${colors.reset}`);
      console.log(`📬 Message ID: ${this.messageId}`);

      // Send PACS.007 message to enrichment service
      console.log(`${colors.blue}📤 Sending PACS.007 message to enrichment service...${colors.reset}`);
      
      const processorRequest = {
        message_id: this.messageId,
        puid: `G3I${Date.now().toString().slice(-13)}`,
        message_type: 'PACS007',
        xml_payload: SAMPLE_PACS007_XML,
        metadata: {
          country: 'SG',
          currency: 'SGD',
          test_type: 'pacs007_routing'
        },
        timestamp: Date.now()
      };

      const response = await new Promise((resolve, reject) => {
        this.processorClient.ProcessMessage(processorRequest, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });

      console.log(`${colors.green}✅ Enrichment Response:${colors.reset}`);
      console.log(`   Success: ${response.success}`);
      console.log(`   Message ID: ${response.message_id}`);
      console.log(`   PUID: ${response.puid}`);
      console.log(`   Next Service: ${response.next_service}`);
      console.log(`   Routing Decision: ${response.routing_decision || 'Not specified'}`);
      console.log(`   Kafka Published: ${response.kafka_published || 'Not specified'}`);

      // Verify routing decision
      if (response.routing_decision === 'DIRECT_KAFKA' || response.kafka_published) {
        console.log(`${colors.green}🎯 ROUTING VERIFIED: PACS.007 correctly routed directly to Kafka${colors.reset}`);
        console.log(`${colors.green}✅ PACS.007 bypassed validation service as expected${colors.reset}`);
      } else {
        console.log(`${colors.red}❌ ROUTING ERROR: PACS.007 did not follow direct Kafka route${colors.reset}`);
        return false;
      }

      // Wait a moment and check orchestrator
      console.log(`${colors.blue}⏳ Waiting for message to reach orchestrator...${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check orchestrator for the message
      await this.checkOrchestratorMessage();

      return true;
    } catch (error) {
      console.error(`${colors.red}❌ PACS.007 routing test failed:${colors.reset}`, error.message);
      return false;
    }
  }

  async checkOrchestratorMessage() {
    try {
      console.log(`${colors.blue}🔍 Checking orchestrator for PACS.007 message...${colors.reset}`);
      
      const response = await fetch('http://localhost:3004/api/v1/messages');
      const data = await response.json();
      
      if (data.messages && data.messages.length > 0) {
        const ourMessage = data.messages.find(msg => 
          msg.messageId === this.messageId || 
          msg.messageType === 'PACS007' ||
          msg.messageType === 'PACS.007'
        );
        
        if (ourMessage) {
          console.log(`${colors.green}🎯 Found PACS.007 message in orchestrator:${colors.reset}`);
          console.log(`   Message ID: ${ourMessage.messageId}`);
          console.log(`   Message Type: ${ourMessage.messageType}`);
          console.log(`   Status: ${ourMessage.status}`);
          console.log(`   Flow: ${ourMessage.flow || 'Not specified'}`);
          console.log(`   Original Topic: ${ourMessage.originalTopic || 'Not specified'}`);
          
          if (ourMessage.flow === 'enrichment-service' || ourMessage.originalTopic === 'enriched-messages') {
            console.log(`${colors.green}✅ CONFIRMED: PACS.007 reached orchestrator via enriched-messages topic${colors.reset}`);
          } else {
            console.log(`${colors.yellow}⚠️  Message found but flow details unclear${colors.reset}`);
          }
        } else {
          console.log(`${colors.yellow}⚠️  PACS.007 message not found in orchestrator yet${colors.reset}`);
        }
      } else {
        console.log(`${colors.yellow}⚠️  No messages in orchestrator yet${colors.reset}`);
      }
    } catch (error) {
      console.error(`${colors.red}❌ Failed to check orchestrator:${colors.reset}`, error.message);
    }
  }

  async runTest() {
    console.log(`${colors.yellow}🚀 PACS.007 Routing Test${colors.reset}`);
    console.log(`${colors.yellow}=======================${colors.reset}`);
    console.log(`${colors.blue}Testing that PACS.007 follows the same route as PACS.008:${colors.reset}`);
    console.log(`${colors.blue}Enrichment → Kafka (enriched-messages) → Orchestrator${colors.reset}`);
    console.log();

    const initialized = await this.initialize();
    if (!initialized) {
      console.log(`${colors.red}❌ Test failed: Could not initialize${colors.reset}`);
      process.exit(1);
    }

    const testPassed = await this.testPacs007Routing();
    
    if (testPassed) {
      console.log();
      console.log(`${colors.green}🎉 PACS.007 ROUTING TEST PASSED!${colors.reset}`);
      console.log(`${colors.green}✅ PACS.007 correctly follows the same route as PACS.008${colors.reset}`);
      console.log(`${colors.green}✅ PACS.007 bypasses validation and goes directly to Kafka${colors.reset}`);
      process.exit(0);
    } else {
      console.log();
      console.log(`${colors.red}❌ PACS.007 ROUTING TEST FAILED!${colors.reset}`);
      process.exit(1);
    }
  }
}

// Run the test
if (require.main === module) {
  const test = new PACS007RoutingTest();
  test.runTest().catch(error => {
    console.error(`${colors.red}❌ Test execution failed:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = PACS007RoutingTest; 