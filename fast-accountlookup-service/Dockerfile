FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S accountlookup -u 1001

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY proto/ ./proto/

# Build TypeScript
RUN npm run build

# Change ownership to non-root user
RUN chown -R accountlookup:nodejs /usr/src/app
USER accountlookup

# Expose gRPC port
EXPOSE 50059

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const grpc = require('@grpc/grpc-js'); const client = new grpc.Client('localhost:50059', grpc.credentials.createInsecure()); setTimeout(() => process.exit(0), 1000);" || exit 1

# Start the service
CMD ["npm", "start"] 