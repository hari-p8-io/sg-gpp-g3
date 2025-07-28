-- Spanner database schema for Fast Inward Orchestrator Service
-- This schema supports state management for payment processing workflows

-- Main table for tracking payment processing state
CREATE TABLE payment_processing_state (
  message_id STRING(36) NOT NULL,
  puid STRING(255) NOT NULL,
  message_type STRING(50) NOT NULL,
  workflow_type STRING(50) NOT NULL,
  overall_status STRING(50) NOT NULL,
  accounting_status STRING(50),
  vam_mediation_status STRING(50),
  limit_check_status STRING(50),
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  updated_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  completed_at TIMESTAMP,
  message_hash STRING(64) NOT NULL,
  retry_count INT64 NOT NULL DEFAULT (0),
  error_message STRING(MAX),
  enrichment_data STRING(MAX),
  response_data STRING(MAX),
) PRIMARY KEY (message_id);

-- Index for deduplication queries
CREATE INDEX idx_payment_processing_state_message_hash 
ON payment_processing_state(message_hash);

-- Index for PUID queries
CREATE INDEX idx_payment_processing_state_puid 
ON payment_processing_state(puid);

-- Index for status queries
CREATE INDEX idx_payment_processing_state_overall_status 
ON payment_processing_state(overall_status);

-- Index for workflow type queries
CREATE INDEX idx_payment_processing_state_workflow_type 
ON payment_processing_state(workflow_type);

-- Index for time-based queries
CREATE INDEX idx_payment_processing_state_created_at 
ON payment_processing_state(created_at);

-- Index for timeout monitoring
CREATE INDEX idx_payment_processing_state_timeout 
ON payment_processing_state(overall_status, created_at);

-- Index for cleanup operations
CREATE INDEX idx_payment_processing_state_cleanup 
ON payment_processing_state(overall_status, completed_at);

-- Additional table for audit trail (optional)
CREATE TABLE payment_processing_audit (
  audit_id STRING(36) NOT NULL,
  message_id STRING(36) NOT NULL,
  event_type STRING(50) NOT NULL,
  event_timestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  old_status STRING(50),
  new_status STRING(50),
  service_name STRING(100),
  event_data STRING(MAX),
  created_by STRING(100),
) PRIMARY KEY (audit_id),
INTERLEAVE IN PARENT payment_processing_state ON DELETE CASCADE;

-- Index for audit queries by message
CREATE INDEX idx_payment_processing_audit_message_id 
ON payment_processing_audit(message_id);

-- Index for audit queries by timestamp
CREATE INDEX idx_payment_processing_audit_timestamp 
ON payment_processing_audit(event_timestamp);

-- Sample data types for reference
-- Enum values for workflow_type: 'CTI', 'DDI'
-- Enum values for status: 'RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING', 'NOT_REQUIRED', 'PENDING', 'TIMEOUT' 