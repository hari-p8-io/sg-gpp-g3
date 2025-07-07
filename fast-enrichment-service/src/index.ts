import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Load environment variables
const PORT = process.env.PORT || 50052;

// Load proto definition
const PROTO_PATH = path.join(__dirname, '../proto/enrichment_client.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const enrichmentProto = grpc.loadPackageDefinition(packageDefinition) as any;

// Enrichment service implementation
const enrichmentService = {
  // Enrich a PACS message with additional data
  EnrichPacsMessage: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const request = call.request;
      const { message_id, puid, message_type, xml_payload, metadata, timestamp } = request;
      
      console.log(`🔄 Enriching message: ${puid} (${message_type})`);
      
      // Simulate enrichment processing
      const enrichmentData: Record<string, string> = {
        customerSegment: 'premium',
        riskScore: Math.floor(Math.random() * 100).toString(),
        geoLocation: 'SG-Central',
        accountType: 'business',
        creditRating: 'A+',
        lastTransactionTime: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        enrichmentService: 'fast-enrichment-service-v1.0'
      };

      // Add some Singapore-specific enrichment
      if (xml_payload.includes('Singapore') || xml_payload.includes('SGD')) {
        enrichmentData.marketSegment = 'Singapore-FAST';
        enrichmentData.timezone = 'Asia/Singapore';
        enrichmentData.regulatoryCode = 'MAS-FAST-2024';
      }

      // Simulate enriched payload (in real implementation, this would modify the XML)
      const enrichedPayload = xml_payload.replace(
        '</Document>',
        `  <EnrichmentData>
    <CustomerSegment>${enrichmentData.customerSegment}</CustomerSegment>
    <RiskScore>${enrichmentData.riskScore}</RiskScore>
    <ProcessedAt>${new Date().toISOString()}</ProcessedAt>
  </EnrichmentData>
</Document>`
      );

      const response = {
        message_id,
        puid,
        success: true,
        enriched_payload: enrichedPayload,
        error_message: '',
        enrichment_data: enrichmentData,
        processed_at: Date.now(),
        next_service: 'fast-validation-service'
      };

      console.log(`✅ Message ${puid} enriched successfully`);
      callback(null, response);

    } catch (error) {
      console.error('❌ Error enriching message:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error during enrichment',
      });
    }
  },

  // Health check for the enrichment service
  HealthCheck: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const response = {
        status: 1, // SERVING
        message: 'Enrichment service is healthy'
      };
      callback(null, response);
    } catch (error) {
      console.error('❌ Health check failed:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Health check failed',
      });
    }
  }
};

// Create and start the gRPC server
const server = new grpc.Server();
server.addService(enrichmentProto.gpp.g3.enrichment.EnrichmentService.service, enrichmentService);

server.bindAsync(
  `0.0.0.0:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (error, port) => {
    if (error) {
      console.error('❌ Failed to start enrichment service:', error);
      return;
    }

    console.log(`🚀 fast-enrichment-service (gRPC) is running on port ${port}`);
    console.log(`📊 Health check available via gRPC HealthCheck method`);
    
    server.start();
  }
);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Shutting down gracefully...');
  server.tryShutdown(() => {
    console.log('✅ Server shutdown complete');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Shutting down gracefully...');
  server.tryShutdown(() => {
    console.log('✅ Server shutdown complete');
    process.exit(0);
  });
});

export default server; 