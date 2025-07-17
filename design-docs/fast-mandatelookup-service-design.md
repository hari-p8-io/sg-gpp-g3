# Fast Mandate Lookup Service - Design Document

## Overview

The **Fast Mandate Lookup Service** is a REST API-based microservice that provides mandate verification capabilities for the Singapore G3 Payment Platform. It validates whether a mandate exists for a given payment instruction, supporting Direct Debit Instructions (DDI) and other mandate-based payment types.

**Note**: This service is called by the **fast-ddi-validation-service** during the validation process to ensure mandate compliance before message processing.

### Key Responsibilities
- Validate mandate existence for Direct Debit Instructions
- Check mandate status and validity periods
- Verify account authorization for mandate-based payments
- Support Singapore banking mandate standards
- Generate realistic mock mandate data for development and testing
- Provide mandate metadata for downstream processing

### Service Details
- **Service Type**: REST API Service
- **Port**: 3005
- **Base URL**: `http://localhost:3005/api/v1`
- **Technology Stack**: TypeScript, Express.js, Node.js
- **Implementation**: Currently stubbed with intelligent mock mandate validation
- **Client**: fast-ddi-validation-service (mandate verification)

---

## Sequence Diagram

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│ fast-ddi-validation     │    │ fast-mandatelookup      │    │ Mock Mandate Engine     │
│ service                 │    │ service (REST API)      │    │ (Current Implementation)│
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
              │                              │                              │
              │ POST /api/v1/mandates/lookup │                              │
              │─────────────────────────────>│                              │
              │                              │                              │
              │                              │ Validate Request             │
              │                              │ ◄─┐                          │
              │                              │   │ Check Account ID         │
              │                              │   │ Check Mandate ID         │
              │                              │   │ Validate Message Type    │
              │                              │ ◄─┘                          │
              │                              │                              │
              │                              │ Generate Mandate Decision    │
              │                              │─────────────────────────────>│
              │                              │                              │
              │                              │ Mandate Details & Status     │
              │                              │◄─────────────────────────────│
              │                              │                              │
              │                              │ Build Response               │
              │                              │ ◄─┐                          │
              │                              │   │ • Valid/Invalid          │
              │                              │   │ • Mandate Reference      │
              │                              │   │ • Validity Dates         │
              │                              │   │ • Authorization Status   │
              │                              │ ◄─┘                          │
              │                              │                              │
              │ HTTP 200 JSON Response       │                              │
              │◄─────────────────────────────│                              │
              │                              │                              │
              │ [Validation continues based  │                              │
              │  on mandate lookup result]   │                              │
```

---

## Class Diagram

```
┌─────────────────────────────────┐
│    MandateLookupController      │
│─────────────────────────────────│
│ - mandateLookupService         │
│─────────────────────────────────│
│ + lookupMandate()              │
│ + healthCheck()                │
│ + getServiceInfo()             │
│ + validateRequest()            │
│ + handleErrors()               │
└─────────────────────────────────┘
                 │
                 │ uses
                 ▼
┌─────────────────────────────────┐
│    MandateLookupService         │
│─────────────────────────────────│
│─────────────────────────────────│
│ + lookupMandate()              │
│ + healthCheck()                │
│ + validateRequest()            │
│ + determineMandateStatus()     │
│ + generateMockMandate()        │
│ + createErrorResponse()        │
└─────────────────────────────────┘
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌─────────────────┐ ┌─────────────────┐
│MockMandateEngine│ │  MandateUtils   │
│─────────────────│ │─────────────────│
│                 │ │                 │
│─────────────────│ │─────────────────│
│ + generateMock  │ │ + validateAcct  │
│ + simulateDelay │ │ + parseRequest  │
│ + shouldApprove │ │ + formatDate    │
│ + createMandate │ │ + generateRef   │
│ + getAuthStatus │ │ + checkExpiry   │
└─────────────────┘ └─────────────────┘
```

---

## REST API Endpoints

### Base URL
```
http://localhost:3005/api/v1
```

### Endpoints

#### 1. Mandate Lookup
```http
POST /api/v1/mandates/lookup
Content-Type: application/json
```

#### 2. Health Check
```http
GET /api/v1/health
```

#### 3. Service Information
```http
GET /api/v1/info
```

---

## Request and Response Formats

### Mandate Lookup Request

**POST** `/api/v1/mandates/lookup`

```json
{
  "messageId": "G3I_20250116_001234",
  "puid": "G3I_PACS003_20250116_001234",
  "messageType": "PACS.003",
  "xmlPayload": "<xml>...</xml>",
  "debtorAccount": "123456789012",
  "creditorAccount": "987654321098",
  "mandateId": "DDI-123456789",
  "amount": "1000.00",
  "currency": "SGD",
  "metadata": {
    "source": "fast-ddi-validation-service",
    "requestTimestamp": "2025-01-16T12:34:56Z"
  }
}
```

### Mandate Lookup Response

#### Successful Response (HTTP 200)

```json
{
  "success": true,
  "mandateReference": "MND-SG-20250116-001234",
  "mandateStatus": {
    "isValid": true,
    "isActive": true,
    "isExpired": false,
    "statusCode": "ACTIVE",
    "statusDescription": "Mandate is valid and active"
  },
  "mandateDetails": {
    "mandateId": "DDI-123456789",
    "debtorAccount": "123456789012",
    "creditorAccount": "987654321098",
    "creationDate": "2024-12-01",
    "expiryDate": "2025-12-01",
    "maxAmount": "5000.00",
    "frequency": "MONTHLY",
    "mandateType": "CONSUMER_DDI",
    "authorizationInfo": {
      "isAuthorized": true,
      "authorizationMethod": "ELECTRONIC_CONSENT",
      "authorizedBy": "ACCOUNT_HOLDER",
      "authorizationDate": "2024-12-01",
      "restrictions": []
    }
  },
  "validationErrors": [],
  "errorMessage": "",
  "processedAt": 1705420800000
}
```

#### Failed Response (HTTP 200 with success: false)

```json
{
  "success": false,
  "mandateReference": "",
  "mandateStatus": {
    "isValid": false,
    "isActive": false,
    "isExpired": false,
    "statusCode": "NOT_FOUND",
    "statusDescription": "No mandate found for the provided account"
  },
  "mandateDetails": null,
  "validationErrors": [
    "MANDATE_NOT_FOUND",
    "INVALID_DEBTOR_ACCOUNT"
  ],
  "errorMessage": "No valid mandate found for account 123456785555",
  "processedAt": 1705420800000
}
```

#### Error Response (HTTP 400/500)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request format",
    "details": [
      "messageId is required",
      "debtorAccount must be a valid account number"
    ]
  },
  "timestamp": "2025-01-16T12:34:56Z"
}
```

### Health Check Response

**GET** `/api/v1/health`

```json
{
  "status": "healthy",
  "message": "Mandate lookup service is healthy (mock mode)",
  "serviceVersion": "1.0.0",
  "mockMode": true,
  "timestamp": "2025-01-16T12:34:56Z",
  "uptime": "2h 15m 30s"
}
```

### Service Information Response

**GET** `/api/v1/info`

```json
{
  "serviceName": "fast-mandatelookup-service",
  "serviceVersion": "1.0.0",
  "environment": "development",
  "port": 3005,
  "mockMode": true,
  "supportedMandateTypes": [
    "CONSUMER_DDI",
    "CORPORATE_DDI",
    "BULK_DDI"
  ],
  "supportedFrequencies": [
    "MONTHLY",
    "QUARTERLY", 
    "ANNUALLY",
    "ON_DEMAND"
  ],
  "maxMandateAmount": "10000.00",
  "defaultCurrency": "SGD",
  "regulationVersion": "SGGIRO_V2.1",
  "complianceMode": "SINGAPORE_BANKING"
}
```

---

## Mock Mandate Logic

### Mandate Decision Rules

The mock implementation uses account patterns and request characteristics to simulate mandate validation:

| Account Pattern | Mandate Status | Authorization | Description |
|----------------|---------------|---------------|-------------|
| **Ends with 1111** | Valid + Active | Authorized | Government/Corporate mandates |
| **Ends with 2222** | Valid + Active | Authorized | Regular consumer mandates |
| **Ends with 3333** | Valid + Inactive | Not Authorized | Suspended mandates |
| **Ends with 4444** | Valid + Expired | Not Authorized | Expired mandates |
| **Ends with 5555** | Invalid | Not Authorized | No mandate found |
| **Other patterns** | Valid + Active | Authorized | Default successful validation |

### Mock Implementation Example

```typescript
class MockMandateEngine {
  generateMandateDecision(request: MandateLookupRequest): MandateDecision {
    const accountPattern = request.debtorAccount.slice(-4);
    
    switch (accountPattern) {
      case '1111':
        return {
          isValid: true,
          isActive: true,
          isExpired: false,
          statusCode: 'ACTIVE',
          mandateType: 'CORPORATE_DDI',
          authorizationMethod: 'DIGITAL_SIGNATURE'
        };
        
      case '2222':
        return {
          isValid: true,
          isActive: true,
          isExpired: false,
          statusCode: 'ACTIVE',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT'
        };
        
      case '3333':
        return {
          isValid: true,
          isActive: false,
          isExpired: false,
          statusCode: 'SUSPENDED',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT'
        };
        
      case '4444':
        return {
          isValid: true,
          isActive: false,
          isExpired: true,
          statusCode: 'EXPIRED',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT'
        };
        
      case '5555':
        return {
          isValid: false,
          isActive: false,
          isExpired: false,
          statusCode: 'NOT_FOUND',
          mandateType: null,
          authorizationMethod: null
        };
        
      default:
        return {
          isValid: true,
          isActive: true,
          isExpired: false,
          statusCode: 'ACTIVE',
          mandateType: 'CONSUMER_DDI',
          authorizationMethod: 'ELECTRONIC_CONSENT'
        };
    }
  }
}
```

---

## Environment Variables

```bash
# HTTP Server
PORT=3005
HOST=0.0.0.0
SERVICE_NAME=fast-mandatelookup-service

# API Configuration
API_VERSION=v1
BASE_PATH=/api/v1
CORS_ENABLED=true
REQUEST_TIMEOUT_MS=30000

# Mock Configuration
USE_MOCK_MANDATES=true
MOCK_RESPONSE_DELAY_MS=100
DEFAULT_MANDATE_VALIDITY_DAYS=365

# Mandate Validation Settings
MAX_MANDATE_AMOUNT=10000.00
SUPPORTED_MANDATE_TYPES=CONSUMER_DDI,CORPORATE_DDI,BULK_DDI
SUPPORTED_FREQUENCIES=MONTHLY,QUARTERLY,ANNUALLY,ON_DEMAND

# Singapore Banking Settings
MANDATE_REGULATION_VERSION=SGGIRO_V2.1
COMPLIANCE_MODE=SINGAPORE_BANKING
DEFAULT_CURRENCY=SGD

# Database (Future Implementation)
MANDATE_DB_CONNECTION_STRING=postgresql://localhost:5432/mandate_db
MANDATE_CACHE_TTL_MINUTES=60

# Logging & Monitoring
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
ENABLE_METRICS=true
METRICS_PORT=9091
```

---

## Health Check Implementation

```typescript
async healthCheck(): Promise<HealthCheckResponse> {
  try {
    // In mock mode, always return healthy
    if (this.useMockMode) {
      return {
        status: 'healthy',
        message: 'Mandate lookup service is healthy (mock mode)',
        serviceVersion: '1.0.0',
        mockMode: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    }

    // Future: Check database connectivity, cache status, etc.
    const dbHealth = await this.checkDatabaseConnection();
    const cacheHealth = await this.checkCacheConnection();

    if (dbHealth && cacheHealth) {
      return {
        status: 'healthy',
        message: 'Mandate lookup service is healthy',
        serviceVersion: '1.0.0',
        mockMode: false,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    } else {
      return {
        status: 'unhealthy',
        message: 'Mandate lookup service dependencies unavailable',
        serviceVersion: '1.0.0',
        mockMode: false,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    }

  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      serviceVersion: '1.0.0',
      mockMode: this.useMockMode,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Status Code | Usage | Description |
|-------------|-------|-------------|
| **200 OK** | Success or Business Logic Failure | Valid request processed (check success field) |
| **400 Bad Request** | Invalid Request | Malformed JSON, missing required fields |
| **404 Not Found** | Invalid Endpoint | Endpoint does not exist |
| **405 Method Not Allowed** | Wrong HTTP Method | Using GET instead of POST, etc. |
| **429 Too Many Requests** | Rate Limiting | Request rate exceeded |
| **500 Internal Server Error** | Technical Error | Unexpected server error |
| **503 Service Unavailable** | Service Down | Service temporarily unavailable |

### Error Categories

| Error Type | HTTP Status | Error Code | Description | Response Action |
|------------|-------------|------------|-------------|-----------------|
| **MANDATE_NOT_FOUND** | 200 | MND001 | No mandate exists for account | Return success: false |
| **MANDATE_EXPIRED** | 200 | MND002 | Mandate has expired | Return success: false |
| **MANDATE_SUSPENDED** | 200 | MND003 | Mandate is suspended | Return success: false |
| **INVALID_ACCOUNT** | 400 | MND004 | Invalid account number format | Return 400 error |
| **AMOUNT_EXCEEDED** | 200 | MND005 | Amount exceeds mandate limit | Return success: false |
| **FREQUENCY_VIOLATION** | 200 | MND006 | Payment frequency violated | Return success: false |
| **UNAUTHORIZED** | 200 | MND007 | Mandate not properly authorized | Return success: false |
| **VALIDATION_ERROR** | 400 | VAL001 | Request validation failed | Return 400 error |
| **TECHNICAL_ERROR** | 500 | MND999 | Internal service error | Return 500 error |

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      "messageId is required",
      "debtorAccount must be a valid account number"
    ]
  },
  "timestamp": "2025-01-16T12:34:56Z",
  "path": "/api/v1/mandates/lookup",
  "method": "POST"
}
```

---

## Performance Characteristics

### Processing Metrics
- **Average Response Time**: 50-150ms per mandate lookup
- **Mock Response Time**: 20-50ms (simulated delay)
- **Throughput**: 2000+ lookups per second
- **Concurrent Requests**: 100+ simultaneous lookups
- **Memory Usage**: 256-512MB per instance

### SLA Requirements
- **Availability**: 99.9% uptime
- **Response Time**: 95th percentile < 200ms
- **Error Rate**: < 0.1% for valid requests
- **Cache Hit Rate**: > 95% (future implementation)

---

## Integration Testing

### Test Scenarios

1. **Valid Active Mandate**
   ```bash
   curl -X POST http://localhost:3005/api/v1/mandates/lookup \
     -H "Content-Type: application/json" \
     -d '{
       "messageId": "TEST123",
       "puid": "G3I_TEST_001",
       "messageType": "PACS.003",
       "debtorAccount": "123456781111",
       "creditorAccount": "987654321098",
       "mandateId": "DDI-TEST-001",
       "amount": "1000.00",
       "currency": "SGD"
     }'
   ```

2. **Expired Mandate**
   ```bash
   curl -X POST http://localhost:3005/api/v1/mandates/lookup \
     -H "Content-Type: application/json" \
     -d '{
       "messageId": "TEST124",
       "puid": "G3I_TEST_002", 
       "messageType": "PACS.003",
       "debtorAccount": "123456784444",
       "creditorAccount": "987654321098",
       "mandateId": "DDI-TEST-002",
       "amount": "1000.00",
       "currency": "SGD"
     }'
   ```

3. **Health Check**
   ```bash
   curl -X GET http://localhost:3005/api/v1/health
   ```

4. **Service Info**
   ```bash
   curl -X GET http://localhost:3005/api/v1/info
   ```

---

## Deployment Configuration

### Docker Environment

```yaml
fast-mandatelookup:
  image: fast-mandatelookup-service:latest
  ports: ["3005:3005"]
  environment:
    - PORT=3005
    - HOST=0.0.0.0
    - API_VERSION=v1
    - USE_MOCK_MANDATES=true
    - MOCK_RESPONSE_DELAY_MS=100
    - DEFAULT_MANDATE_VALIDITY_DAYS=365
    - MAX_MANDATE_AMOUNT=10000.00
    - MANDATE_REGULATION_VERSION=SGGIRO_V2.1
    - COMPLIANCE_MODE=SINGAPORE_BANKING
    - DEFAULT_CURRENCY=SGD
    - LOG_LEVEL=info
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3005/api/v1/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

---

## Future Production Implementation

### Database Schema (PostgreSQL)

```sql
-- Mandates table
CREATE TABLE mandates (
  mandate_id VARCHAR(50) PRIMARY KEY,
  debtor_account VARCHAR(50) NOT NULL,
  creditor_account VARCHAR(50) NOT NULL,
  mandate_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  creation_date DATE NOT NULL,
  expiry_date DATE,
  max_amount DECIMAL(15,2),
  frequency VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Authorization details
CREATE TABLE mandate_authorizations (
  authorization_id VARCHAR(50) PRIMARY KEY,
  mandate_id VARCHAR(50) REFERENCES mandates(mandate_id),
  authorization_method VARCHAR(50) NOT NULL,
  authorized_by VARCHAR(100) NOT NULL,
  authorization_date DATE NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mandate usage tracking
CREATE TABLE mandate_usage (
  usage_id VARCHAR(50) PRIMARY KEY,
  mandate_id VARCHAR(50) REFERENCES mandates(mandate_id),
  transaction_id VARCHAR(50) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  transaction_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_mandates_debtor_account ON mandates(debtor_account);
CREATE INDEX idx_mandates_creditor_account ON mandates(creditor_account);
CREATE INDEX idx_mandates_status ON mandates(status);
CREATE INDEX idx_mandate_auth_mandate_id ON mandate_authorizations(mandate_id);
```

---

## Summary

The **Fast Mandate Lookup Service** provides essential mandate validation capabilities for Direct Debit Instructions and other mandate-based payments in the Singapore G3 Payment Platform via REST API. The service:

### ✅ **Current Capabilities**
- RESTful mandate validation with realistic decision logic
- Singapore banking compliance simulation
- Comprehensive HTTP error handling and response formatting
- Health checks and service monitoring via HTTP endpoints

### 🚀 **Integration Benefits**
- Standard HTTP/JSON interface for easy integration
- Platform-agnostic REST API accessible from any language
- Enhanced DDI validation with mandate compliance
- Supports regulatory requirements for Direct Debit processing
- Provides foundation for production mandate management

### 📋 **Future Enhancements**
- PostgreSQL database integration for real mandate storage
- Redis caching layer for improved performance
- API rate limiting and authentication
- Audit trail for mandate usage tracking
- Integration with Singapore banking mandate registries
- Advanced authorization workflows and approval processes

The service is designed to seamlessly integrate with the **fast-ddi-validation-service** via HTTP REST calls to provide complete mandate-based payment validation capabilities. 