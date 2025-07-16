# Fast Account Lookup Service - Design Document

## Overview

The **Fast Account Lookup Service** is a gRPC-based microservice that provides account lookup and enrichment capabilities for PACS message processing in the Singapore G3 Payment Platform. It serves as the primary source for account system detection (VAM/MDZ) and comprehensive account enrichment data.

### Key Responsibilities
- Lookup account information based on creditor account IDs
- Determine account system (VAM, MDZ, MEPS, FAST) based on account patterns
- Provide comprehensive account enrichment data
- Support Singapore banking standards and compliance
- Generate realistic mock data for development and testing

### Service Details
- **Service Type**: gRPC Service
- **Port**: 50059
- **Package**: `gpp.g3.accountlookup`
- **Technology Stack**: TypeScript, gRPC
- **Implementation**: Currently stubbed with intelligent mock data

---

## Sequence Diagram

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│ fast-inwd-processor     │    │ fast-accountlookup      │    │ Mock Data Generator     │
│ service                 │    │ service                 │    │ (Current Implementation)│
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
              │                              │                              │
              │ LookupAccount(cdtrAcctId)    │                              │
              │─────────────────────────────>│                              │
              │                              │                              │
              │                              │ Validate Request             │
              │                              │ ◄─┐                          │
              │                              │   │ Check Account ID         │
              │                              │ ◄─┘                          │
              │                              │                              │
              │                              │ Generate Enrichment Data     │
              │                              │─────────────────────────────>│
              │                              │                              │
              │                              │ Account Details (VAM/MDZ)    │
              │                              │◄─────────────────────────────│
              │                              │                              │
              │                              │ Build Response               │
              │                              │ ◄─┐                          │
              │                              │   │ Singapore Banking Stds   │
              │                              │ ◄─┘                          │
              │                              │                              │
              │ AccountLookupResponse        │                              │
              │◄─────────────────────────────│                              │
```

---

## Class Diagram

```
┌─────────────────────────────────┐
│    AccountLookupHandler         │
│─────────────────────────────────│
│ - accountLookupService         │
│─────────────────────────────────│
│ + lookupAccount()              │
│ + healthCheck()                │
│ + getServiceInfo()             │
│ + validateRequest()            │
│ + convertToGrpc()              │
└─────────────────────────────────┘
                 │
                 │ uses
                 ▼
┌─────────────────────────────────┐
│    AccountLookupService         │
│─────────────────────────────────│
│─────────────────────────────────│
│ + lookupAccount()              │
│ + healthCheck()                │
│ + validateRequest()            │
│ + generateEnrichmentData()     │
│ + handleSimulatedError()       │
│ + createErrorResponse()        │
└─────────────────────────────────┘
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌─────────────────┐ ┌─────────────────┐
│MockDataGenerator│ │  AccountUtils   │
│─────────────────│ │─────────────────│
│                 │ │                 │
│─────────────────│ │─────────────────│
│ + generateSGData│ │ + getAcctSystem │
│ + simulateDelay │ │ + getAcctType   │
│ + shouldSimError│ │ + normalizeId   │
│ + createPhysical│ │ + generateBranch│
│ + generateAttrib│ │ + formatDate    │
└─────────────────┘ └─────────────────┘
```

---

## Request and Response Formats

### gRPC Service Definition

```protobuf
syntax = "proto3";

package gpp.g3.accountlookup;

service AccountLookupService {
  rpc LookupAccount(AccountLookupRequest) returns (AccountLookupResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
  rpc GetServiceInfo(ServiceInfoRequest) returns (ServiceInfoResponse);
}
```

### AccountLookupRequest

```protobuf
message AccountLookupRequest {
  string message_id = 1;               // UUID for tracking
  string puid = 2;                     // G3I identifier
  string cdtr_acct_id = 3;             // CdtrAcct ID to lookup
  string message_type = 4;             // PACS message type for context
  map<string, string> metadata = 5;    // Additional lookup context
  int64 timestamp = 6;                 // Request timestamp
}
```

### AccountLookupResponse

```protobuf
message AccountLookupResponse {
  string message_id = 1;               // Echo back UUID
  string puid = 2;                     // Echo back G3I identifier
  bool success = 3;                    // Whether lookup was successful
  string error_message = 4;            // Error details if success = false
  string error_code = 5;               // Categorized error code
  EnrichmentData enrichment_data = 6;  // Full enrichment data
  int64 processed_at = 7;              // When lookup completed
  string lookup_source = 8;            // Source of lookup (STUB, CACHE, DATABASE)
}
```

### EnrichmentData

```protobuf
message EnrichmentData {
  string received_acct_id = 1;         // Original CdtrAcct ID
  int32 lookup_status_code = 2;        // 200 for success, 404 for not found
  string lookup_status_desc = 3;       // Human-readable status description
  string normalized_acct_id = 4;       // Normalized account ID
  string matched_acct_id = 5;          // Matched account ID
  string partial_match = 6;            // Y or N
  string is_physical = 7;              // Y or N
  PhysicalAccountInfo physical_acct_info = 8; // Complex account information
}
```

### PhysicalAccountInfo

```protobuf
message PhysicalAccountInfo {
  string acct_id = 1;                  // Account ID
  string acct_sys = 2;                 // Account system (VAM, MDZ, FAST, MEPS)
  string acct_group = 3;               // Account group (SGB, etc.)
  string country = 4;                  // Country (SG)
  string branch_id = 5;                // Branch ID (nullable)
  AccountAttributes acct_attributes = 6;
  AccountOpsAttributes acct_ops_attributes = 7;
  string bicfi = 8;                    // Bank identifier (ANZBSG3MXXX)
  string currency_code = 9;            // Currency (SGD)
}
```

---

## Business Logic Implementation

### Account System Detection Logic

```typescript
static getAccountSystem(accountId: string): string {
  const normalized = this.normalizeAccountId(accountId);
  
  // VAM accounts: accounts starting with 999 or containing VAM
  if (normalized.startsWith('999') || normalized.includes('VAM')) {
    return 'VAM';
  }
  
  // FAST system for utility accounts
  if (normalized.startsWith('SP') || normalized.includes('UTIL')) {
    return 'FAST';
  }
  
  // MEPS for government/corporate accounts
  if (normalized.startsWith('GOVT') || normalized.startsWith('CORP')) {
    return 'MEPS';
  }
  
  // Default to MDZ for all other accounts
  return 'MDZ';
}
```

### Account Type Detection

```typescript
static getAccountType(accountId: string): string {
  const normalized = accountId.trim().toUpperCase();
  
  if (normalized.startsWith('CORP')) {
    return 'Corporate';
  }
  if (normalized.startsWith('GOVT')) {
    return 'Government';
  }
  if (normalized.startsWith('UTIL') || normalized.startsWith('SP')) {
    return 'Utility';
  }
  return 'Physical';
}
```

### Mock Data Generation

```typescript
generateEnrichmentData(request: AccountLookupRequest): EnrichmentData {
  const accountId = request.cdtrAcctId;
  const accountSystem = AccountUtils.getAccountSystem(accountId);
  const accountType = AccountUtils.getAccountType(accountId);
  
  return {
    receivedAcctId: accountId,
    lookupStatusCode: 200,
    lookupStatusDesc: 'Success',
    normalizedAcctId: AccountUtils.normalizeAccountId(accountId),
    matchedAcctId: accountId,
    partialMatch: 'N',
    isPhysical: 'Y',
    physicalAcctInfo: this.createPhysicalAccountInfo(accountId, accountSystem, accountType)
  };
}
```

---

## Account Types and Business Rules

### Singapore Account System Mapping

| Account Pattern | Account System | Use Case |
|-----------------|----------------|----------|
| `999*` or `*VAM*` | **VAM** | High-value accounts, require group limits |
| `SP*` or `*UTIL*` | **FAST** | Utility payments, instant settlement |
| `GOVT*` | **MEPS** | Government accounts, regulatory compliance |
| `CORP*` | **MEPS** | Corporate accounts, bulk processing |
| Other patterns | **MDZ** | Standard retail banking |

### Account Type Classifications

| Account Type | Description | System Preference | Special Handling |
|--------------|-------------|-------------------|------------------|
| **Physical** | Standard customer accounts | MDZ | Standard validation |
| **Corporate** | Business accounts | MEPS | Enhanced due diligence |
| **Government** | Government entity accounts | MEPS | Regulatory reporting |
| **Utility** | Service provider accounts | FAST | Instant settlement |

---

## Sample Response Data

### Successful Lookup Response

```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "puid": "G3I1234567890123",
  "success": true,
  "enrichmentData": {
    "receivedAcctId": "999888777666",
    "lookupStatusCode": 200,
    "lookupStatusDesc": "Success", 
    "normalizedAcctId": "999888777666",
    "matchedAcctId": "999888777666",
    "partialMatch": "N",
    "isPhysical": "Y",
    "physicalAcctInfo": {
      "acctId": "999888777666",
      "acctSys": "VAM",
      "acctGroup": "SGB",
      "country": "SG",
      "branchId": "001",
      "acctAttributes": {
        "acctType": "Physical",
        "acctCategory": "SAVINGS",
        "acctPurpose": "PERSONAL_BANKING"
      },
      "acctOpsAttributes": {
        "isActive": "Yes",
        "acctStatus": "Active",
        "openDate": "15/03/2020",
        "expiryDate": "31/12/2025",
        "restraints": {
          "stopAll": "N",
          "stopDebits": "N", 
          "stopCredits": "N",
          "stopAtm": "N",
          "stopEftPos": "N",
          "stopUnknown": "N",
          "warnings": []
        }
      },
      "bicfi": "ANZBSG3MXXX",
      "currencyCode": "SGD"
    }
  },
  "processedAt": 1640995200000,
  "lookupSource": "STUB"
}
```

### Error Response Example

```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "puid": "G3I1234567890123",
  "success": false,
  "errorMessage": "Account not found in system",
  "errorCode": "LOOKUP_ACCOUNT_NOT_FOUND_002",
  "enrichmentData": null,
  "processedAt": 1640995200000,
  "lookupSource": "STUB"
}
```

---

## Error Handling

### Error Scenarios and Codes

| Scenario | Error Code | HTTP Status | Description |
|----------|------------|-------------|-------------|
| **Account Not Found** | `LOOKUP_ACCOUNT_NOT_FOUND_002` | 404 | Account ID not in system |
| **Invalid Request** | `LOOKUP_INVALID_REQUEST_001` | 400 | Missing required parameters |
| **Service Unavailable** | `LOOKUP_SERVICE_ERROR_003` | 500 | Internal service error |
| **Timeout** | `LOOKUP_TIMEOUT_004` | 504 | Request processing timeout |
| **Rate Limited** | `LOOKUP_RATE_LIMITED_005` | 429 | Too many requests |

### Error Simulation (Test Mode)

```typescript
// Test accounts for error simulation
const ERROR_SIMULATION_PATTERNS = {
  'NOTFOUND': { code: 'LOOKUP_ACCOUNT_NOT_FOUND_002', status: 404 },
  'ERROR': { code: 'LOOKUP_SERVICE_ERROR_003', status: 500 },
  'TIMEOUT': { code: 'LOOKUP_TIMEOUT_004', status: 504 },
  'INACTIVE': { code: 'LOOKUP_ACCOUNT_INACTIVE_006', status: 200 }
};

shouldSimulateError(accountId: string): boolean {
  return Object.keys(ERROR_SIMULATION_PATTERNS)
    .some(pattern => accountId.toUpperCase().includes(pattern));
}
```

---

## Configuration

### Environment Variables

```bash
# gRPC Configuration
GRPC_PORT=50059
SERVICE_NAME=fast-accountlookup-service

# Service Configuration
LOG_LEVEL=info
ENVIRONMENT=development
IS_STUBBED=true
COUNTRY=SG
DEFAULT_CURRENCY=SGD
TIMEZONE=Asia/Singapore
DEFAULT_BANK_CODE=ANZBSG3MXXX

# Mock Data Configuration
MOCK_SUCCESS_RATE=0.95
MOCK_RESPONSE_DELAY_MS=100
ENABLE_ERROR_SCENARIOS=true
DEFAULT_ACCOUNT_TYPE=Physical

# Processing Configuration
LOOKUP_TIMEOUT_MS=3000
MAX_RETRY_ATTEMPTS=2
RATE_LIMIT_REQUESTS_PER_MINUTE=1000

# Database Configuration (Future)
DATABASE_URL=postgresql://localhost:5432/accounts
CACHE_TTL_SECONDS=300
ENABLE_CACHE=true
```

---

## Database Schema

**Note**: Currently implemented as a stubbed service. Future production implementation will require the following database schema:

### Account Information Table

```sql
CREATE TABLE account_information (
  account_id VARCHAR(50) PRIMARY KEY,
  account_system VARCHAR(20) NOT NULL,     -- VAM, MDZ, FAST, MEPS
  account_group VARCHAR(20) NOT NULL,      -- SGB, RETAIL, CORPORATE
  account_type VARCHAR(20) NOT NULL,       -- Physical, Virtual, Corporate
  account_category VARCHAR(50),            -- SAVINGS, CURRENT, CORPORATE
  account_purpose VARCHAR(100),            -- PERSONAL_BANKING, BUSINESS
  country VARCHAR(3) NOT NULL DEFAULT 'SG',
  currency_code VARCHAR(3) NOT NULL DEFAULT 'SGD',
  bicfi VARCHAR(11) NOT NULL DEFAULT 'ANZBSG3MXXX',
  branch_id VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  account_status VARCHAR(20) NOT NULL DEFAULT 'Active',
  open_date DATE NOT NULL,
  expiry_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_account_system ON account_information(account_system);
CREATE INDEX idx_account_type ON account_information(account_type);
CREATE INDEX idx_country_currency ON account_information(country, currency_code);
CREATE INDEX idx_status_active ON account_information(account_status, is_active);
```

### Account Restraints Table

```sql
CREATE TABLE account_restraints (
  account_id VARCHAR(50) PRIMARY KEY,
  stop_all BOOLEAN DEFAULT false,
  stop_debits BOOLEAN DEFAULT false,
  stop_credits BOOLEAN DEFAULT false,
  stop_atm BOOLEAN DEFAULT false,
  stop_eft_pos BOOLEAN DEFAULT false,
  stop_unknown BOOLEAN DEFAULT false,
  warnings TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES account_information(account_id)
);
```

### Account Lookup Cache

```sql
CREATE TABLE account_lookup_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  account_id VARCHAR(50) NOT NULL,
  enrichment_data JSONB NOT NULL,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX idx_cache_expiry ON account_lookup_cache(expires_at);
CREATE INDEX idx_cache_account ON account_lookup_cache(account_id);
```

---

## Service Integration

### Upstream Services
- **fast-inwd-processor-service** (Port 50052): Primary consumer for account lookups

### Integration Pattern

```typescript
// Called by Inward Processor Service
const lookupRequest: AccountLookupRequest = {
  messageId: "uuid",
  puid: "G3I123456789",
  cdtrAcctId: "999888777666",
  messageType: "PACS.008",
  metadata: { country: "SG", currency: "SGD" },
  timestamp: Date.now()
};

const response = await accountLookupClient.LookupAccount(lookupRequest);
```

### Response Integration

```typescript
// Response used by Inward Processor for enrichment
if (response.success) {
  const enrichmentData = response.enrichmentData;
  const accountSystem = enrichmentData.physicalAcctInfo.acctSys; // VAM, MDZ, etc.
  
  // Use account system for downstream routing decisions
  if (accountSystem === 'VAM') {
    // Route to VAM mediation
  } else if (accountSystem === 'MDZ') {
    // Route to standard processing
  }
}
```

---

## Performance Characteristics

### Current Performance (Stub Mode)
- **Average Response Time**: ~110ms
- **Success Rate**: 100% (configurable via mock settings)
- **Concurrent Requests**: Limited by gRPC server configuration
- **Memory Usage**: Low (stateless mock data generation)

### Target Production Performance
- **Response Time**: < 100ms (95th percentile)
- **Throughput**: 5000+ requests per second
- **Cache Hit Rate**: > 80% for frequently accessed accounts
- **Database Query Time**: < 50ms average

### Scalability Considerations
- **Horizontal Scaling**: Multiple service instances behind load balancer
- **Caching Strategy**: Redis/Memcached for account data
- **Database Optimization**: Read replicas, connection pooling
- **Circuit Breaker**: Fail fast on database issues

---

## Monitoring and Health Checks

### Health Check Implementation

```typescript
async healthCheck(): Promise<HealthStatus> {
  if (config.isStubbed) {
    return {
      status: 'SERVING',
      message: 'Account lookup service is healthy (stub mode)',
      timestamp: Date.now(),
      capabilities: [
        'account-lookup',
        'singapore-banking-data', 
        'mock-data-generation',
        'error-simulation'
      ]
    };
  }
  
  // Production health checks
  const dbHealth = await this.checkDatabaseHealth();
  const cacheHealth = await this.checkCacheHealth();
  
  const isHealthy = dbHealth && cacheHealth;
  
  return {
    status: isHealthy ? 'SERVING' : 'NOT_SERVING',
    message: isHealthy ? 'All systems operational' : 'Service degraded',
    timestamp: Date.now(),
    dependencies: {
      database: dbHealth,
      cache: cacheHealth
    }
  };
}
```

### Monitoring Metrics

```typescript
// Prometheus metrics
const metrics = {
  lookupRequests: new Counter({
    name: 'accountlookup_requests_total',
    help: 'Total account lookup requests',
    labelNames: ['account_type', 'account_system', 'status']
  }),
  
  lookupDuration: new Histogram({
    name: 'accountlookup_duration_seconds', 
    help: 'Account lookup duration',
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0]
  }),
  
  cacheHitRate: new Gauge({
    name: 'accountlookup_cache_hit_rate',
    help: 'Cache hit rate percentage'
  })
};
```

---

## Security Considerations

### Data Protection
- **PII Handling**: Minimal exposure of account holder information
- **Data Encryption**: Encrypt sensitive data in transit and at rest
- **Access Logging**: Log all account access for audit purposes
- **Data Masking**: Mask account details in logs

### Input Validation

```typescript
validateLookupAccountRequest(request: any): string | null {
  if (!request.message_id || request.message_id.length < 8) {
    return 'message_id must be at least 8 characters long';
  }
  
  if (!request.puid || request.puid.length < 8) {
    return 'puid must be at least 8 characters long';
  }
  
  if (!request.cdtr_acct_id || request.cdtr_acct_id.length < 3) {
    return 'cdtr_acct_id must be at least 3 characters long';
  }
  
  const validMessageTypes = ['pacs.008.001.10', 'pacs.002.001.15', 'pacs.004.001.12'];
  if (!validMessageTypes.includes(request.message_type)) {
    return `message_type must be one of: ${validMessageTypes.join(', ')}`;
  }
  
  return null;
}
```

---

## Migration to Production

### Phase 1: Database Integration
- Implement PostgreSQL/Cloud Spanner backend
- Create account information tables
- Import Singapore banking account data
- Implement caching layer

### Phase 2: Performance Optimization
- Add database connection pooling
- Implement read replicas
- Optimize query performance
- Add comprehensive monitoring

### Phase 3: Advanced Features
- Real-time account status updates
- Advanced account matching algorithms
- Multi-market support
- Enhanced error handling

### Deployment Strategy
- **Blue-Green Deployment**: Zero-downtime migration
- **Feature Flags**: Gradual rollout of production features
- **Monitoring**: Comprehensive observability during migration
- **Rollback Plan**: Quick revert to stub mode if needed 