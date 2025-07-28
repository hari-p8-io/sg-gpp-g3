import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown...');

  try {
    // Stop Docker infrastructure
    console.log('🛑 Stopping Docker containers...');
    execSync('docker-compose down -v', { 
      stdio: 'inherit',
      cwd: __dirname 
    });

    // Clean up any remaining containers
    try {
      execSync('docker container prune -f', { stdio: 'inherit' });
      execSync('docker volume prune -f', { stdio: 'inherit' });
    } catch (error) {
      console.warn('Warning: Failed to prune Docker resources:', error);
    }

    console.log('✅ Global teardown completed successfully');

  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error to avoid masking test failures
  }
}

export default globalTeardown; 