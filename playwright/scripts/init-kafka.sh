#!/bin/bash
set -e

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
until kafka-topics --bootstrap-server kafka:9092 --list > /dev/null 2>&1; do
  echo "Kafka not ready yet, waiting..."
  sleep 2
done

echo "Kafka is ready!"

# Create required topics
echo "Creating Kafka topics..."

TOPICS=(
  "enriched-messages"
  "json-accounting-messages"
  "json-vammediation-messages"
  "json-limitcheck-messages"
)

for topic in "${TOPICS[@]}"; do
  echo "Creating topic: $topic"
  kafka-topics --bootstrap-server kafka:9092 --create --if-not-exists --topic "$topic" --partitions 1 --replication-factor 1
done

echo "Listing all topics:"
kafka-topics --bootstrap-server kafka:9092 --list

echo "Kafka setup complete!" 