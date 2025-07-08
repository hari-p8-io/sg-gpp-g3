import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { logger } from '../../utils/logger';
import { config } from '../../config/default';

export interface AccountLookupRequest {
  messageId: string;
  puid: string;
  cdtrAcctId: string;
  messageType: string;
  metadata: { [key: string]: string };
  timestamp: number;
}

export interface AccountLookupResponse {
  messageId: string;
  puid: string;
  success: boolean;
  errorMessage?: string;
  errorCode?: string;
  enrichmentData?: any;
  processedAt: number;
  lookupSource: string;
}

export class AccountLookupClient {
  private client: any;
  private connected: boolean = false;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      // Load proto file
      const PROTO_PATH = path.join(__dirname, '../../proto/accountlookup_client.proto');
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [path.join(__dirname, '../../proto')]
      });

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const AccountLookupService = (protoDescriptor['gpp'] as any).g3.accountlookup.AccountLookupService;

      // Create client
      this.client = new AccountLookupService(
        config.accountLookupServiceUrl,
        grpc.credentials.createInsecure()
      );

      this.connected = true;
      logger.info('Account lookup client initialized', {
        serviceUrl: config.accountLookupServiceUrl
      });

    } catch (error) {
      logger.error('Failed to initialize account lookup client', {
        error: error instanceof Error ? error.message : 'Unknown error',
        serviceUrl: config.accountLookupServiceUrl
      });
      this.connected = false;
    }
  }

  async lookupAccount(request: AccountLookupRequest): Promise<AccountLookupResponse> {
    if (!this.connected) {
      throw new Error('Account lookup client not connected');
    }

    return new Promise((resolve, reject) => {
      const grpcRequest = {
        message_id: request.messageId,
        puid: request.puid,
        cdtr_acct_id: request.cdtrAcctId,
        message_type: request.messageType,
        metadata: request.metadata,
        timestamp: request.timestamp
      };

      logger.debug('Sending account lookup request', {
        messageId: request.messageId,
        puid: request.puid,
        cdtrAcctId: request.cdtrAcctId
      });

      // Set deadline for the request
      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + config.accountLookupTimeoutMs);

      this.client.LookupAccount(grpcRequest, { deadline }, (error: any, response: any) => {
        if (error) {
          logger.error('Account lookup request failed', {
            messageId: request.messageId,
            error: error.message || 'Unknown gRPC error',
            code: error.code
          });
          reject(new Error(`Account lookup failed: ${error.message}`));
          return;
        }

        logger.debug('Account lookup response received', {
          messageId: response.message_id,
          success: response.success,
          lookupSource: response.lookup_source
        });

        // Convert gRPC response to interface
        const lookupResponse: AccountLookupResponse = {
          messageId: response.message_id,
          puid: response.puid,
          success: response.success,
          errorMessage: response.error_message || undefined,
          errorCode: response.error_code || undefined,
          enrichmentData: response.enrichment_data ? this.convertEnrichmentData(response.enrichment_data) : undefined,
          processedAt: response.processed_at,
          lookupSource: response.lookup_source
        };

        resolve(lookupResponse);
      });
    });
  }

  private convertEnrichmentData(grpcData: any): any {
    const enrichmentData: any = {
      receivedAcctId: grpcData.received_acct_id,
      lookupStatusCode: grpcData.lookup_status_code,
      lookupStatusDesc: grpcData.lookup_status_desc,
      normalizedAcctId: grpcData.normalized_acct_id,
      matchedAcctId: grpcData.matched_acct_id,
      partialMatch: grpcData.partial_match,
      isPhysical: grpcData.is_physical
    };

    if (grpcData.physical_acct_info) {
      const physicalInfo = grpcData.physical_acct_info;
      enrichmentData.physicalAcctInfo = {
        acctId: physicalInfo.acct_id,
        acctSys: physicalInfo.acct_sys,
        acctGroup: physicalInfo.acct_group,
        country: physicalInfo.country,
        branchId: physicalInfo.branch_id || undefined,
        acctAttributes: {
          acctType: physicalInfo.acct_attributes.acct_type,
          acctCategory: physicalInfo.acct_attributes.acct_category,
          acctPurpose: physicalInfo.acct_attributes.acct_purpose
        },
        acctOpsAttributes: {
          isActive: physicalInfo.acct_ops_attributes.is_active,
          acctStatus: physicalInfo.acct_ops_attributes.acct_status,
          openDate: physicalInfo.acct_ops_attributes.open_date,
          expiryDate: physicalInfo.acct_ops_attributes.expiry_date,
          restraints: {
            stopAll: physicalInfo.acct_ops_attributes.restraints.stop_all,
            stopDebits: physicalInfo.acct_ops_attributes.restraints.stop_debits,
            stopCredits: physicalInfo.acct_ops_attributes.restraints.stop_credits,
            stopAtm: physicalInfo.acct_ops_attributes.restraints.stop_atm,
            stopEftPos: physicalInfo.acct_ops_attributes.restraints.stop_eft_pos,
            stopUnknown: physicalInfo.acct_ops_attributes.restraints.stop_unknown,
            warnings: physicalInfo.acct_ops_attributes.restraints.warnings
          }
        },
        bicfi: physicalInfo.bicfi,
        currencyCode: physicalInfo.currency_code
      };
    }

    return enrichmentData;
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    if (!this.connected) {
      return { status: 'NOT_SERVING', message: 'Client not connected' };
    }

    return new Promise((resolve, reject) => {
      const request = {
        service: 'fast-accountlookup-service'
      };

      this.client.HealthCheck(request, (error: any, response: any) => {
        if (error) {
          logger.error('Account lookup service health check failed', { error: error.message });
          reject(new Error(`Health check failed: ${error.message}`));
          return;
        }

        const statusMap = ['UNKNOWN', 'SERVING', 'NOT_SERVING', 'SERVICE_UNKNOWN'];
        resolve({
          status: statusMap[response.status] || 'UNKNOWN',
          message: response.message
        });
      });
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.connected = false;
      logger.info('Account lookup client disconnected');
    }
  }
} 