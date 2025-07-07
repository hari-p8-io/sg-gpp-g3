# Fast Accounting Service

A Java-based microservice for handling accounting and financial operations in the GPP G3 initiative.

## Overview

This is a shell service that provides the basic structure for a Spring Boot application. The service is ready for development and can be extended with business logic as needed.

## Technology Stack

- Java 17
- Spring Boot 3.2.0
- Maven 3.8+
- H2 Database (for development)

## Getting Started

### Prerequisites
- Java 17 or higher
- Maven 3.8 or higher

### Running the Service

```bash
# Build the service
mvn clean compile

# Run the service
mvn spring-boot:run
```

The service will start on port 8002.

### Health Check

Once running, you can check the service health at:
- Health endpoint: http://localhost:8002/actuator/health
- Service info: http://localhost:8002/actuator/info

## Service Structure

```
fast-accounting-service/
├── pom.xml                 # Maven configuration
└── README.md              # This file
```

## Development

This is a shell service ready for development. You can add:
- Business logic and controllers
- Data models and entities
- Service layers
- Configuration files
- Tests

## Port Configuration

- **Default Port**: 8002
- **Management Port**: 8002 (same as service port)

## Next Steps

1. Add your business logic in the appropriate packages
2. Configure database connections as needed
3. Add API endpoints for accounting operations
4. Implement financial transaction logic
5. Add comprehensive tests

## License

This project is proprietary to the GPP G3 initiative. 