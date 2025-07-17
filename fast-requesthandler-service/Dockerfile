FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:18-alpine AS production

WORKDIR /app

# Install dumb-init and grpc_health_probe for proper signal handling and health checks
RUN apk add --no-cache dumb-init wget ca-certificates && \
    wget -qO /usr/local/bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.22/grpc_health_probe-linux-amd64 && \
    chmod +x /usr/local/bin/grpc_health_probe

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose ports
EXPOSE 3001 50051

# Health check using gRPC health probe
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD grpc_health_probe -addr=localhost:50051 -service=gpp.g3.requesthandler.MessageHandler || exit 1

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"] 