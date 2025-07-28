#!/bin/bash
set -e

# Wait for Spanner emulator to be ready
echo "Waiting for Spanner emulator..."
until curl -s http://spanner-emulator:9020/v1/projects/test-project/instances > /dev/null; do
  echo "Spanner emulator not ready yet, waiting..."
  sleep 2
done

echo "Spanner emulator is ready!"

# Set up Spanner project, instance, and database
echo "Setting up Spanner project, instance, and database..."
gcloud config set project test-project
gcloud spanner instances create test-instance --config=emulator-config --description='Test Instance'
gcloud spanner databases create test-db --instance=test-instance

# Create tables
echo "Creating tables..."
gcloud spanner databases ddl update test-db --instance=test-instance --ddl='
CREATE TABLE PaymentProcessingState (
  messageId STRING(36) NOT NULL,
  workflowType STRING(50) NOT NULL,
  status STRING(20) NOT NULL,
  createdAt TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP NOT NULL,
  payload STRING(MAX),
  errorMessage STRING(MAX),
) PRIMARY KEY (messageId)'

gcloud spanner databases ddl update test-db --instance=test-instance --ddl='
CREATE TABLE DeduplicationCache (
  messageId STRING(36) NOT NULL,
  messageHash STRING(64) NOT NULL,
  processingTimestamp TIMESTAMP NOT NULL,
  expiryTimestamp TIMESTAMP NOT NULL,
) PRIMARY KEY (messageId)'

gcloud spanner databases ddl update test-db --instance=test-instance --ddl='
CREATE INDEX idx_message_hash ON DeduplicationCache(messageHash)'

echo "Spanner setup complete!" 