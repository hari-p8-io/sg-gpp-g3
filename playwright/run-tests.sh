#!/bin/bash
set -e

# Build the orchestrator service
echo "Building the orchestrator service..."
cd ../fast-inwd-orchestrator-service
mvn clean package -DskipTests

# Return to the playwright directory
cd ../playwright

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start Docker containers
echo "Starting Docker containers..."
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Run the tests
echo "Running tests..."
npx playwright test "$@"

# Show test report
echo "Opening test report..."
npx playwright show-report

# Cleanup
echo "Do you want to stop Docker containers? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
  echo "Stopping Docker containers..."
  docker-compose down
  echo "Docker containers stopped."
else
  echo "Docker containers are still running. Stop them manually with 'docker-compose down' when you're done."
fi 