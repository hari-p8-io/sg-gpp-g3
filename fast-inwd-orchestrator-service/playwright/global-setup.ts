import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import { KafkaTestUtils } from './utils/kafka-test-utils';
import { SpannerTestUtils } from './utils/spanner-test-utils';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup...');

  try {
    // Start Docker infrastructure
    console.log('📦 Starting Docker containers...');
    execSync('docker-compose up -d --build', { 
      stdio: 'inherit',
      cwd: __dirname 
    });

    // Wait for services to be healthy
    console.log('⏳ Waiting for services to be ready...');
    await waitForServices();

    // Initialize Spanner database
    console.log('🗄️ Initializing Spanner database...');
    const spannerUtils = new SpannerTestUtils();
    await spannerUtils.initializeDatabase();

    // Verify Kafka connectivity
    console.log('📡 Verifying Kafka connectivity...');
    const kafkaUtils = new KafkaTestUtils();
    await kafkaUtils.verifyConnectivity();
    await kafkaUtils.cleanup(); // Clean any existing messages

    console.log('✅ Global setup completed successfully');

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    
    // Cleanup on failure
    try {
      execSync('docker-compose down', { 
        stdio: 'inherit',
        cwd: __dirname 
      });
    } catch (cleanupError) {
      console.error('Failed to cleanup after setup failure:', cleanupError);
    }
    
    throw error;
  }
}

async function waitForServices(): Promise<void> {
  const maxRetries = 30;
  const retryInterval = 5000; // 5 seconds

  // Wait for orchestrator service health check
  for (let i = 0; i < maxRetries; i++) {
    try {
      const browser = await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();
      
      const response = await page.request.get('http://localhost:8080/api/v1/orchestrator/health');
      
      await browser.close();

      if (response.ok()) {
        console.log('✅ Orchestrator service is ready');
        return;
      }
    } catch (error) {
      console.log(`⏳ Waiting for orchestrator service... (attempt ${i + 1}/${maxRetries})`);
    }

    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }

  throw new Error('Orchestrator service failed to start within timeout period');
}

export default globalSetup; 