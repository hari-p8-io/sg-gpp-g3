import { Spanner, Database } from '@google-cloud/spanner';

export interface SpannerConfig {
  projectId: string;
  instanceId: string;
  databaseId: string;
  emulatorHost?: string;
}

export interface SafeStrRecord {
  message_id: string;
  puid: string;
  message_type: string;
  payload: string;
  created_at: Date;
  processed_at?: Date;
  status: string;
}

export class SpannerClient {
  private spanner?: Spanner;
  private database?: Database;
  private config: SpannerConfig;
  private mockMode: boolean = false;
  private mockStorage: Map<string, SafeStrRecord> = new Map(); // Mock storage for development

  constructor(config: SpannerConfig) {
    this.config = config;
    
    // Check if we should use mock mode
    const isEmulatorMode = process.env.SPANNER_EMULATOR_HOST || config.emulatorHost;
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Force mock mode for development without emulator
    if (isDevelopment && !isEmulatorMode) {
      this.mockMode = true;
      console.log('🔧 SpannerClient running in mock mode for development (no emulator)');
      return;
    }
    
    // Use mock mode if emulator is not available
    if (isEmulatorMode && !this.isEmulatorAvailable()) {
      this.mockMode = true;
      console.log('🔧 SpannerClient running in mock mode (emulator not available)');
      return;
    }

    // Only initialize Spanner if we're not in mock mode
    if (!this.mockMode) {
      try {
        const spannerOptions: any = {
          projectId: config.projectId,
        };

        // Use emulator if configured
        if (isEmulatorMode) {
          spannerOptions.apiEndpoint = isEmulatorMode;
          console.log(`🔧 Using Spanner emulator at: ${isEmulatorMode}`);
        }

        this.spanner = new Spanner(spannerOptions);
        this.database = this.spanner.instance(config.instanceId).database(config.databaseId);
      } catch (error) {
        console.warn('⚠️  Failed to initialize Spanner client, falling back to mock mode:', error);
        this.mockMode = true;
      }
    }
  }

  private isEmulatorAvailable(): boolean {
    // For development, we'll assume emulator is not available unless explicitly set
    // In production, this would check if the emulator is actually running
    return false;
  }

  async initialize(): Promise<void> {
    if (this.mockMode) {
      console.log('✅ Mock database initialized for development');
      return;
    }

    try {
      if (this.database) {
        // Set a shorter timeout for emulator/development
        const timeout = process.env.NODE_ENV === 'development' ? 5000 : 30000;
        await Promise.race([
          this.database.get(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), timeout)
          )
        ]);
        console.log('✅ Connected to Cloud Spanner database');
      }
    } catch (error) {
      console.warn('⚠️  Failed to connect to Cloud Spanner, falling back to mock mode:', error);
      this.mockMode = true;
      console.log('✅ Mock database initialized as fallback');
    }
  }

  async insertMessage(record: SafeStrRecord): Promise<void> {
    if (this.mockMode) {
      console.log(`📝 Mock insert message: ${record.message_id} (${record.message_type})`);
      console.log(`   PUID: ${record.puid}`);
      console.log(`   Status: ${record.status}`);
      console.log(`   Payload size: ${record.payload.length} bytes`);
      
      // Store in mock storage
      this.mockStorage.set(record.message_id, { ...record });
      this.mockStorage.set(record.puid, { ...record });
      return;
    }
    
    // TODO: Implement actual Spanner insertion when emulator is available
    console.log(`📝 Would insert message: ${record.message_id} (${record.message_type})`);
    console.log(`   PUID: ${record.puid}`);
    console.log(`   Status: ${record.status}`);
    console.log(`   Payload size: ${record.payload.length} bytes`);
  }

  async updateMessageStatus(messageId: string, status: string, processedAt?: Date): Promise<void> {
    console.log(`📝 Would update message status: ${messageId} -> ${status}`);
    if (processedAt) {
      console.log(`   Processed at: ${processedAt.toISOString()}`);
    }
    
    if (this.mockMode) {
      // Update in mock storage
      const record = this.mockStorage.get(messageId);
      if (record) {
        record.status = status;
        if (processedAt) {
          record.processed_at = processedAt;
        }
        this.mockStorage.set(messageId, record);
        // Also update by PUID
        this.mockStorage.set(record.puid, record);
      }
    }
  }

  async getMessageById(messageId: string): Promise<SafeStrRecord | null> {
    console.log(`📝 Would get message by ID: ${messageId}`);
    
    if (this.mockMode) {
      const record = this.mockStorage.get(messageId);
      if (record) {
        console.log(`✅ Found message in mock storage: ${record.puid}`);
        return record;
      } else {
        console.log(`❌ Message not found in mock storage: ${messageId}`);
        return null;
      }
    }
    
    // Return null for now - we'll implement actual querying later
    return null;
  }

  async getMessageByPuid(puid: string): Promise<SafeStrRecord | null> {
    console.log(`📝 Would get message by PUID: ${puid}`);
    
    if (this.mockMode) {
      const record = this.mockStorage.get(puid);
      if (record) {
        console.log(`✅ Found message in mock storage: ${record.message_id}`);
        return record;
      } else {
        console.log(`❌ Message not found in mock storage: ${puid}`);
        return null;
      }
    }
    
    // Return null for now - we'll implement actual querying later
    return null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.mockMode) {
        console.log('✅ Spanner health check (mock mode)');
        return true;
      }
      
      // For real Spanner, check database connection
      if (this.database) {
        await this.database.get();
        console.log('✅ Spanner health check (real database)');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Spanner health check failed:', error);
      return false;
    }
  }

  // Add method to get all messages (for testing)
  async getAllMessages(): Promise<SafeStrRecord[]> {
    if (this.mockMode) {
      const messages = Array.from(this.mockStorage.values());
      // Remove duplicates (we store by both message_id and puid)
      const uniqueMessages = messages.filter((msg, index, array) => 
        array.findIndex(m => m.message_id === msg.message_id) === index
      );
      return uniqueMessages;
    }
    
    // TODO: Implement actual query for real Spanner
    return [];
  }

  // Add method to clear mock storage (for testing)
  clearMockStorage(): void {
    if (this.mockMode) {
      this.mockStorage.clear();
      console.log('🧹 Mock storage cleared');
    }
  }

  // Add method to get mock storage size (for testing)
  getMockStorageSize(): number {
    if (this.mockMode) {
      const messages = Array.from(this.mockStorage.values());
      const uniqueMessages = messages.filter((msg, index, array) => 
        array.findIndex(m => m.message_id === msg.message_id) === index
      );
      return uniqueMessages.length;
    }
    return 0;
  }
} 