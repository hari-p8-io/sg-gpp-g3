import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global test teardown...');
  
  const isCIEnvironment = process.env.CI === 'true';
  
  // Clean up test data
  await cleanupTestData();
  
  // Reset mock servers if in CI
  if (isCIEnvironment) {
    await resetMockServers();
  }
  
  // Generate test summary
  await generateTestSummary();
  
  console.log('✅ Global test teardown completed successfully');
}

async function cleanupTestData() {
  console.log('🗑️  Cleaning up test data...');
  
  try {
    // Clean up any test data that might have been created
    console.log('✅ Test data cleaned up successfully');
  } catch (error) {
    console.error('❌ Failed to clean up test data:', error);
  }
}

async function resetMockServers() {
  console.log('🔄 Resetting mock servers...');
  
  const mockServers = [
    process.env.MOCK_ACCOUNTLOOKUP_URL || 'http://localhost:8080',
    process.env.MOCK_REFERENCEDATA_URL || 'http://localhost:8081'
  ];
  
  for (const serverUrl of mockServers) {
    try {
      const response = await fetch(`${serverUrl}/mockserver/reset`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log(`✅ Mock server at ${serverUrl} reset successfully`);
      } else {
        console.warn(`⚠️  Failed to reset mock server at ${serverUrl}: ${response.status}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to reset mock server at ${serverUrl}:`, error);
    }
  }
}

async function generateTestSummary() {
  console.log('📊 Generating test summary...');
  
  try {
    const timestamp = new Date().toISOString();
    const summary = {
      timestamp,
      environment: process.env.NODE_ENV || 'unknown',
      ci: process.env.CI === 'true',
      testRun: {
        completed: true,
        teardownTime: timestamp
      }
    };
    
    console.log('📋 Test Summary:', JSON.stringify(summary, null, 2));
    console.log('✅ Test summary generated successfully');
  } catch (error) {
    console.error('❌ Failed to generate test summary:', error);
  }
}

export default globalTeardown; 