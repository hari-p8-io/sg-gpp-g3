# Fast Inward Orchestrator Service - E2E Tests

This directory contains end-to-end tests for the `fast-inwd-orchestrator-service` using Playwright.

## Overview

These tests verify the orchestrator service's behavior in a realistic environment with:

- Kafka for message publishing and consumption
- Spanner emulator for state management and deduplication
- Mock API for VAM mediation service
- Docker containers for all infrastructure components

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Java 21 (for building the orchestrator service)

## Setup

1. Build the orchestrator service:

```bash
cd ../fast-inwd-orchestrator-service
mvn clean package
```

2. Install test dependencies:

```bash
cd ../playwright
npm install
```

## Running Tests

To run all tests:

```bash
npm test
```

To run tests in debug mode:

```bash
npm run test:debug
```

To run specific tests:

```bash
npx playwright test tests/orchestrator/credit-transfer-workflow.spec.ts
```

## Test Structure

- `tests/orchestrator/` - Test files for different workflows
- `utils/` - Utility functions for Kafka and Spanner interactions
- `mocks/` - Mock API definitions for external services
- `docker-compose.yml` - Infrastructure setup for tests

## Test Cases

### Credit Transfer Workflow

Tests the processing of PACS008 messages through the orchestrator:

- Message transformation to JSON
- Deduplication check
- Publishing to downstream services
- State management in Spanner

### Direct Debit Workflow

Tests the processing of PACS003 messages through the orchestrator:

- Different workflow routing based on message type
- Message transformation to JSON
- Publishing to appropriate downstream services

### Deduplication

Tests the deduplication functionality:

- Identical messages are detected as duplicates
- Messages with the same ID but different content are detected as duplicates
- Messages with different IDs but identical content are processed separately

## Docker Infrastructure

The tests use Docker Compose to set up:

- Kafka and Zookeeper for message queuing
- Spanner emulator for database operations
- WireMock for mocking external APIs
- The orchestrator service itself

## Troubleshooting

If tests fail, check:

1. Docker containers are running: `docker ps`
2. Kafka topics are created: `docker exec kafka-test kafka-topics --bootstrap-server kafka:9092 --list`
3. Orchestrator service logs: `docker logs orchestrator-test` 