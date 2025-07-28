import { execSync } from 'child_process';
import { FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import waitForExpect from 'wait-for-expect';
import axios from 'axios';

/**
 * Global setup function that runs before all tests
 * - Starts Docker containers
 * - Creates required Kafka topics
 * - Waits for services to be healthy
 */
async function globalSetup(config: FullConfig) {
  console.log('Starting test infrastructure with Docker...');
  
  try {
    // Start Docker containers
    execSync('docker-compose up -d', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname),
    });
    
    console.log('Waiting for Kafka to be ready...');
    await waitForKafka();
    
    console.log('Creating Kafka topics...');
    createKafkaTopics();
    
    console.log('Waiting for Spanner to be ready...');
    await waitForSpanner();
    
    console.log('Waiting for orchestrator service to be ready...');
    await waitForOrchestrator();
    
    console.log('Test infrastructure is ready!');
  } catch (error) {
    console.error('Failed to set up test infrastructure:', error);
    throw error;
  }
}

/**
 * Wait for Kafka to be ready
 */
async function waitForKafka(): Promise<void> {
  try {
    await waitForExpect(async () => {
      const result = await axios.get('http://localhost:18080/api/clusters', {
        validateStatus: () => true,
      });
      expect(result.status).toBe(200);
    }, 30000, 1000);
  } catch (error) {
    console.error('Kafka is not ready:', error);
    throw error;
  }
}

/**
 * Create required Kafka topics
 */
function createKafkaTopics(): void {
  const topics = [
    'enriched-messages',
    'json-accounting-messages',
    'json-vammediation-messages',
    'json-limitcheck-messages',
  ];
  
  for (const topic of topics) {
    try {
      execSync(`docker exec kafka-test kafka-topics --bootstrap-server kafka:9092 --create --if-not-exists --topic ${topic} --partitions 1 --replication-factor 1`, {
        stdio: 'inherit',
      });
    } catch (error) {
      console.error(`Failed to create topic ${topic}:`, error);
    }
  }
}

/**
 * Wait for Spanner to be ready
 */
async function waitForSpanner(): Promise<void> {
  try {
    await waitForExpect(async () => {
      const result = await axios.get('http://localhost:19020/v1/projects/test-project/instances', {
        validateStatus: () => true,
      });
      expect(result.status).toBe(200);
    }, 30000, 1000);
  } catch (error) {
    console.error('Spanner is not ready:', error);
    throw error;
  }
}

/**
 * Wait for orchestrator service to be ready
 */
async function waitForOrchestrator(): Promise<void> {
  try {
    await waitForExpect(async () => {
      const result = await axios.get('http://localhost:18081/actuator/health', {
        validateStatus: () => true,
      });
      expect(result.status).toBe(200);
    }, 30000, 1000);
  } catch (error) {
    console.error('Orchestrator service is not ready:', error);
    throw error;
  }
}

export default globalSetup; 