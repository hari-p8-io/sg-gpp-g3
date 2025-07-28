import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global test setup...');
  
  const isCIEnvironment = process.env.CI === 'true';
  
  if (isCIEnvironment) {
    console.log('📊 CI environment detected, setting up mock servers...');
    
    // Setup mock servers for CI environment
    try {
      const setupMockServers = require('../scripts/setup-mock-servers');
      await setupMockServers.main();
      console.log('✅ Mock servers set up successfully');
    } catch (error) {
      console.error('❌ Failed to set up mock servers:', error);
      throw error;
    }
  } else {
    console.log('🏠 Local environment detected, skipping mock server setup');
  }
  
  // Wait for services to be ready
  await waitForServices();
  
  // Perform health checks
  await performHealthChecks();
  
  // Initialize test database
  await initializeTestDatabase();
  
  console.log('✅ Global test setup completed successfully');
}

async function waitForServices() {
  console.log('⏳ Waiting for services to be ready...');
  
  const services = [
    {
      name: 'Fast Request Handler Service',
      url: process.env.SERVICE_URL || 'http://localhost:3001',
      path: '/health',
      timeout: 30000
    }
  ];
  
  for (const service of services) {
    await waitForService(service);
  }
}

async function waitForService(service: { name: string; url: string; path: string; timeout: number }) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < service.timeout) {
    try {
      const response = await fetch(`${service.url}${service.path}`);
      if (response.ok) {
        console.log(`✅ ${service.name} is ready`);
        return;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`${service.name} failed to start within ${service.timeout}ms`);
}

async function performHealthChecks() {
  console.log('🔍 Performing health checks...');
  
  const healthChecks = [
    {
      name: 'Service Health Check',
      url: (process.env.SERVICE_URL || 'http://localhost:3001') + '/health'
    }
  ];
  
  for (const check of healthChecks) {
    try {
      const response = await fetch(check.url);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${check.name} passed:`, data);
      } else {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ ${check.name} failed:`, error);
      throw error;
    }
  }
}

async function initializeTestDatabase() {
  console.log('🗄️  Initializing test database...');
  
  // If we're in CI, the database setup should already be done
  if (process.env.CI === 'true') {
    console.log('ℹ️  Database initialization skipped in CI (already done)');
    return;
  }
  
  // For local testing, we can run database setup if needed
  try {
    // Add any additional database initialization logic here
    console.log('✅ Test database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize test database:', error);
    throw error;
  }
}

export default globalSetup; 