import { GrpcClientHelper } from './grpc-client';
import path from 'path';
import fs from 'fs';

export class TestHelper {
  private grpcClient: GrpcClientHelper;

  constructor() {
    this.grpcClient = new GrpcClientHelper();
  }

  getGrpcClient(): GrpcClientHelper {
    return this.grpcClient;
  }

  /**
   * Setup test environment
   */
  async setupTest(): Promise<void> {
    // Wait for service to be ready
    await this.grpcClient.waitForServiceReady(30000);
    
    // Clear mock storage before each test
    await this.grpcClient.clearMockStorage();
  }

  /**
   * Get test XML payload for a specific message type
   * Currently supports Singapore market (extensible for future markets)
   */
  static getTestXML(messageType: string, market: string = 'SG'): string {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');
    
    // For now, only generic files (Singapore-based)
    const genericFile = path.join(fixturesDir, `sample_${messageType.toLowerCase()}.xml`);
    
    if (!fs.existsSync(genericFile)) {
      throw new Error(`Test fixture not found: ${genericFile}`);
    }
    
    let xmlContent = fs.readFileSync(genericFile, 'utf8');
    
    // Future: Apply market-specific modifications when other markets are added
    // if (market === 'MY') {
    //   xmlContent = xmlContent.replace(/SGD/g, 'MYR').replace(/SG/g, 'MY');
    // }
    
    return xmlContent;
  }

  /**
   * Process a message and wait for it to be stored
   */
  async processMessageAndWait(
    messageType: string,
    xmlPayload: string,
    metadata: Record<string, string> = {}
  ): Promise<{
    response: any;
    storedMessage: any;
  }> {
    // Process the message
    const response = await this.grpcClient.processMessage({
      message_type: messageType,
      xml_payload: xmlPayload,
      metadata
    });

    // Wait for background enrichment to complete
    await this.waitForMessageToBeStored(response.message_id, response.puid);

    // Get the stored message
    const allMessages = await this.grpcClient.getAllMessages();
    const storedMessage = allMessages.find(msg => 
      msg.message_id === response.message_id || msg.puid === response.puid
    );

    return { response, storedMessage };
  }

  /**
   * Wait for a message to be stored in the database
   */
  async waitForMessageToBeStored(messageId: string, puid: string, maxWaitTime: number = 10000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const allMessages = await this.grpcClient.getAllMessages();
        const found = allMessages.find(msg => 
          msg.message_id === messageId || msg.puid === puid
        );
        
        if (found) {
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await this.wait(100);
    }
    
    throw new Error(`Message ${messageId}/${puid} not found in database after ${maxWaitTime}ms`);
  }

  /**
   * Clear the database completely
   */
  async clearDatabaseCompletely(): Promise<void> {
    try {
      await this.grpcClient.clearMockStorage();
    } catch (error) {
      console.warn('Failed to clear database:', error);
    }
  }

  /**
   * Wait for a specified amount of time
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the test helper
   */
  async shutdown(): Promise<void> {
    this.grpcClient.shutdown();
  }
} 