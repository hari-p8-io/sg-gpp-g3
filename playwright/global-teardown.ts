import { execSync } from 'child_process';
import { FullConfig } from '@playwright/test';
import path from 'path';

/**
 * Global teardown function that runs after all tests
 * - Stops Docker containers
 * - Cleans up resources
 */
async function globalTeardown(config: FullConfig) {
  console.log('Stopping test infrastructure...');
  
  try {
    // Stop Docker containers
    execSync('docker-compose down', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname),
    });
    
    console.log('Test infrastructure stopped successfully');
  } catch (error) {
    console.error('Failed to stop test infrastructure:', error);
  }
}

export default globalTeardown; 