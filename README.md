# GPP G3 Initiative - Monorepo

A comprehensive monorepo housing multiple microservices for the GPP G3 initiative, built with TypeScript and Java.

## Services Overview

### TypeScript Services
- **fast-requesthandler-service** - Handles incoming requests and initial processing
- **fast-enrichment-service** - Enriches request data with additional information
- **fast-validation-service** - Validates request data and business rules
- **fast-orchestrator-service** - Orchestrates the flow between different services

### Java Services
- **fast-limitcheck-service** - Performs limit checks and validation
- **fast-accounting-service** - Handles accounting and financial operations
- **fast-vammediation-service** - VAM mediation service
- **fast-mdzmediation-service** - MDZ mediation service

## Repository Structure

```
├── fast-requesthandler-service/       # TypeScript service
├── fast-enrichment-service/           # TypeScript service
├── fast-validation-service/           # TypeScript service
├── fast-orchestrator-service/         # TypeScript service
├── fast-limitcheck-service/           # Java service (shell)
├── fast-accounting-service/           # Java service (shell)
├── fast-vammediation-service/         # Java service (shell)
├── fast-mdzmediation-service/         # Java service (shell)
├── package.json                       # Node.js workspace configuration
├── pom.xml                           # Maven parent POM
├── docs/
└── shared/
```

## Prerequisites

### For TypeScript Services
- Node.js 18+
- npm or yarn
- TypeScript

### For Java Services
- Java 17+
- Maven 3.8+
- Spring Boot

## Getting Started

### Setup All Services
```bash
# Install dependencies for all TypeScript services
npm run install:ts-services

# Build all Java services
npm run java:build
```

### Individual Service Setup

#### TypeScript Services
```bash
cd [service-name]
npm install
npm run dev
```

#### Java Services
```bash
cd [service-name]
mvn spring-boot:run
```

## Development

### Running TypeScript Services
```bash
# Run all TypeScript services in development mode
npm run dev

# Run individual service
cd fast-requesthandler-service
npm run dev
```

### Running Java Services
```bash
# Build all Java services
mvn clean install

# Run individual service
cd fast-limitcheck-service
mvn spring-boot:run
```

### Service Ports
- **fast-requesthandler-service**: 3001
- **fast-enrichment-service**: 3002
- **fast-validation-service**: 3003
- **fast-orchestrator-service**: 3004
- **fast-limitcheck-service**: 8001
- **fast-accounting-service**: 8002
- **fast-vammediation-service**: 8003
- **fast-mdzmediation-service**: 8004

## Service Details

### TypeScript Services
Each TypeScript service includes:
- Express.js server with middleware
- Health check endpoints
- Request ID tracking
- Error handling
- Docker configuration
- TypeScript configuration

### Java Services
Each Java service includes:
- Spring Boot application structure
- Maven configuration
- Health check endpoints via Spring Actuator
- Basic service scaffolding (shell services)

## Scripts

### Root Level Scripts
```bash
# TypeScript services
npm run build          # Build all TypeScript services
npm run test           # Test all TypeScript services
npm run dev            # Run all TypeScript services in dev mode
npm run lint           # Lint all TypeScript services

# Java services
npm run java:build     # Build all Java services
npm run java:test      # Test all Java services
mvn clean install     # Direct Maven build
```

## Docker Support
All services include Docker configurations for containerized deployment.

## Contributing

1. Follow the established code style for each language
2. Update tests for any new functionality
3. Ensure all services build successfully
4. Update documentation as needed

## License

This project is proprietary to the GPP G3 initiative. 