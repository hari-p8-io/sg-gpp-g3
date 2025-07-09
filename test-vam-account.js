const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

async function testVamAccountLookup() {
  console.log('🔍 Testing VAM Account Lookup');
  console.log('=============================');
  
  let accountClient;
  
  try {
    // Load the proto file
    const accountLookupProto = protoLoader.loadSync(
      path.join(__dirname, 'fast-accountlookup-service/proto/accountlookup_service.proto'),
      { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
    );
    
    const accountLookupService = grpc.loadPackageDefinition(accountLookupProto);
    accountClient = new accountLookupService.gpp.g3.accountlookup.AccountLookupService(
      'localhost:50059',
      grpc.credentials.createInsecure()
    );
    
    console.log('✅ Connected to Account Lookup Service');
    
    // Test different account types
    const testAccounts = [
      { account: '999888777', expectedAcctSys: 'VAM', description: 'VAM account (999888777)' },
      { account: 'VAMTEST123', expectedAcctSys: 'VAM', description: 'VAM account (VAMTEST123)' },
      { account: 'VAM12345', expectedAcctSys: 'VAM', description: 'VAM account (VAM12345)' },
      { account: '123456789', expectedAcctSys: 'MDZ', description: 'Regular account (123456789)' },
      { account: 'CORP12345', expectedAcctSys: 'MEPS', description: 'Corporate account (CORP12345)' }
    ];
    
    for (const testAccount of testAccounts) {
      console.log(`\n📞 Testing ${testAccount.description}...`);
      
      try {
        const lookupResponse = await new Promise((resolve, reject) => {
          accountClient.LookupAccount({ 
            message_id: `test-${Date.now()}`, 
            puid: `G3ITEST${Date.now()}`, 
            cdtr_acct_id: testAccount.account,
            message_type: 'PACS008',
            timestamp: Date.now()
          }, (error, response) => {
            if (error) reject(error);
            else resolve(response);
          });
        });
        
        console.log(`   Account: ${testAccount.account}`);
        console.log(`   Success: ${lookupResponse.success}`);
        
        if (lookupResponse.success && lookupResponse.enrichment_data && lookupResponse.enrichment_data.physical_acct_info) {
          const acctSys = lookupResponse.enrichment_data.physical_acct_info.acct_sys;
          console.log(`   Account System: ${acctSys}`);
          console.log(`   Expected: ${testAccount.expectedAcctSys}`);
          console.log(`   Match: ${acctSys === testAccount.expectedAcctSys ? '✅ PASS' : '❌ FAIL'}`);
          
          if (acctSys !== testAccount.expectedAcctSys) {
            console.log(`   ⚠️  Expected ${testAccount.expectedAcctSys}, got ${acctSys}`);
          }
        } else {
          console.log(`   ❌ Failed: ${lookupResponse.error_message || 'No enrichment data received'}`);
          console.log(`   Error Code: ${lookupResponse.error_code || 'N/A'}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    console.log('\n📋 VAM Account Lookup Test Complete');
    console.log('===================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (accountClient) {
      accountClient.close();
    }
  }
}

// Run the test
testVamAccountLookup(); 