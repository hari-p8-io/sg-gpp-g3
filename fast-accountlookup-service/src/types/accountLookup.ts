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
  enrichmentData?: EnrichmentData;
  processedAt: number;
  lookupSource: string;
}

export interface EnrichmentData {
  receivedAcctId: string;
  lookupStatusCode: number;
  lookupStatusDesc: string;
  normalizedAcctId: string;
  matchedAcctId: string;
  partialMatch: string;
  isPhysical: string;
  physicalAcctInfo?: PhysicalAccountInfo;
}

export interface PhysicalAccountInfo {
  acctId: string;
  acctSys: string;
  acctGroup: string;
  country: string;
  branchId?: string;
  acctAttributes: AccountAttributes;
  acctOpsAttributes: AccountOpsAttributes;
  bicfi: string;
  currencyCode: string;
}

export interface AccountAttributes {
  acctType: string;
  acctCategory: string;
  acctPurpose: string;
}

export interface AccountOpsAttributes {
  isActive: string;
  acctStatus: string;
  openDate: string;
  expiryDate: string;
  restraints: Restraints;
}

export interface Restraints {
  stopAll: string;
  stopDebits: string;
  stopCredits: string;
  stopAtm: string;
  stopEftPos: string;
  stopUnknown: string;
  warnings: string;
}

export interface HealthCheckRequest {
  service: string;
}

export interface HealthCheckResponse {
  status: 'UNKNOWN' | 'SERVING' | 'NOT_SERVING' | 'SERVICE_UNKNOWN';
  message: string;
  timestamp: number;
}

export interface ServiceInfoRequest {
  requester: string;
}

export interface ServiceInfoResponse {
  serviceName: string;
  version: string;
  buildTime: string;
  capabilities: string[];
  isStubbed: boolean;
  environment: string;
}

export interface ServiceConfig {
  grpcPort: number;
  serviceName: string;
  logLevel: string;
  environment: string;
  isStubbed: boolean;
  country: string;
  defaultCurrency: string;
  timezone: string;
  defaultBankCode: string;
  mockSuccessRate: number;
  mockResponseDelayMs: number;
  enableErrorScenarios: boolean;
  defaultAccountType: string;
  lookupTimeoutMs: number;
  maxRetryAttempts: number;
  rateLimitRequestsPerMinute: number;
} 