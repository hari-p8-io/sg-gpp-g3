import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

export class EnrichmentClient {
  private client: any;
  private serviceUrl: string;

  constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl;
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      // Load proto definition for enrichment service
      const PROTO_PATH = path.join(__dirname, '../../../proto/enrichment_client.proto');
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const enrichmentProto = grpc.loadPackageDefinition(packageDefinition) as any;
      
      // Create client
      this.client = new enrichmentProto.gpp.g3.enrichment.EnrichmentService(
        this.serviceUrl,
        grpc.credentials.createInsecure()
      );

      console.log(`✅ Enrichment service client initialized: ${this.serviceUrl}`);
    } catch (error) {
      console.error('❌ Failed to initialize enrichment client:', error);
      this.client = null;
    }
  }

  async enrichPacsMessage(request: EnrichmentRequest): Promise<EnrichmentResponse> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('Enrichment client not initialized'));
      }

      this.client.EnrichPacsMessage(request, (error: any, response: any) => {
        if (error) {
          console.error('❌ Enrichment service error:', error);
          reject(error);
        } else {
          console.log(`✅ Message enriched successfully: ${response.message_id}`);
          resolve(response);
        }
      });
    });
  }

  async healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve(false);
        return;
      }

      this.client.HealthCheck({ service: 'enrichment' }, (error: any, response: any) => {
        if (error) {
          console.warn('⚠️  Enrichment service health check failed:', error);
          resolve(false);
        } else {
          const isHealthy = response.status === 1; // 1 = SERVING
          resolve(isHealthy);
        }
      });
    });
  }

  /**
   * Attempt to forward message to enrichment service with timeout
   */
  async forwardMessage(
    messageId: string,
    puid: string,
    messageType: string,
    xmlPayload: string,
    metadata: Record<string, string> = {},
    timeout: number = 30000
  ): Promise<EnrichmentResponse> {
    const request: EnrichmentRequest = {
      message_id: messageId,
      puid: puid,
      message_type: messageType,
      xml_payload: xmlPayload,
      metadata: metadata,
      timestamp: Date.now(),
    };

    console.log(`🔄 Forwarding message to enrichment service: ${puid}`);

    try {
      // Set a timeout for the enrichment call
      const enrichmentPromise = this.enrichPacsMessage(request);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Enrichment timeout')), timeout);
      });

      const response = await Promise.race([enrichmentPromise, timeoutPromise]);
      return response;
    } catch (error) {
      console.error(`❌ Failed to forward message ${puid} to enrichment service:`, error);
      throw error;
    }
  }
}

export interface EnrichmentRequest {
  message_id: string;
  puid: string;
  message_type: string;
  xml_payload: string;
  metadata: Record<string, string>;
  timestamp: number;
}

export interface EnrichmentResponse {
  message_id: string;
  puid: string;
  success: boolean;
  enriched_payload: string;
  error_message: string;
  enrichment_data: EnrichmentData;
  processed_at: number;
  next_service: string;
}

export interface EnrichmentData {
  received_acct_id: string;
  lookup_status_code: number;
  lookup_status_desc: string;
  normalized_acct_id: string;
  matched_acct_id: string;
  partial_match: string;
  is_physical: string;
  physical_acct_info?: PhysicalAccountInfo;
  auth_method: string;
}

export interface PhysicalAccountInfo {
  acct_id: string;
  acct_sys: string;
  acct_group: string;
  country: string;
  branch_id?: string;
  acct_attributes: AccountAttributes;
  acct_ops_attributes: AccountOpsAttributes;
  bicfi: string;
  currency_code: string;
}

export interface AccountAttributes {
  acct_type: string;
  acct_category: string;
  acct_purpose: string;
}

export interface AccountOpsAttributes {
  is_active: string;
  acct_status: string;
  open_date: string;
  expiry_date: string;
  restraints: Restraints;
}

export interface Restraints {
  stop_all: string;
  stop_debits: string;
  stop_credits: string;
  stop_atm: string;
  stop_eft_pos: string;
  stop_unknown: string;
  warnings: string[];
} 