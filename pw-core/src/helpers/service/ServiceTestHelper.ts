import { GrpcTestClient, ServiceConfig } from '../../clients/grpc/GrpcTestClient';
import { GrpcClientHelper } from '../../clients/grpc/GrpcClientHelper';
import path from 'path';
import fs from 'fs';

export interface TestMessage {
  messageType: string;
  xmlPayload: string;
  metadata?: Record<string, string>;
}

export interface TestResponse {
  success: boolean;
  messageId?: string;
  puid?: string;
  errorMessage?: string;
  [key: string]: any;
}

export class ServiceTestHelper {
  private grpcClient: GrpcTestClient;
  private serviceName: string;

  constructor(serviceName: string, config?: Partial<ServiceConfig>) {
    this.serviceName = serviceName;
    
    // Default configuration that can be overridden
    const defaultConfig: ServiceConfig = {
      serviceName,
      serviceUrl: this.getDefaultServiceUrl(serviceName),
      protoPath: this.getDefaultProtoPath(serviceName),
      packageName: this.getDefaultPackageName(serviceName),
      timeout: 30000
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.grpcClient = new GrpcTestClient(finalConfig);
  }

  private getDefaultServiceUrl(serviceName: string): string {
    const portMap: Record<string, number> = {
      'fast-requesthandler-service': 50051,
      'fast-enrichment-service': 50052,
      'fast-validation-service': 50053,
      'fast-accountlookup-service': 50059
    };

    const port = portMap[serviceName] || 50051;
    return `localhost:${port}`;
  }

  private getDefaultProtoPath(serviceName: string): string {
    // Assume proto files are in the service's proto directory
    const protoMap: Record<string, string> = {
      'fast-requesthandler-service': 'proto/message_handler.proto',
      'fast-enrichment-service': 'proto/enrichment_service.proto',
      'fast-validation-service': 'proto/validation_service.proto',
      'fast-accountlookup-service': 'proto/account_lookup_service.proto'
    };

    const protoFile = protoMap[serviceName] || 'proto/service.proto';
    return path.join(process.cwd(), protoFile);
  }

  private getDefaultPackageName(serviceName: string): string {
    const packageMap: Record<string, string> = {
      'fast-requesthandler-service': 'gpp.g3.requesthandler.MessageHandler',
      'fast-enrichment-service': 'gpp.g3.enrichment.EnrichmentService',
      'fast-validation-service': 'gpp.g3.validation.ValidationService',
      'fast-accountlookup-service': 'gpp.g3.accountlookup.AccountLookupService'
    };

    return packageMap[serviceName] || 'gpp.g3.service.Service';
  }

  async initialize(): Promise<void> {
    await this.grpcClient.connect();
    await this.grpcClient.waitForServiceReady();
  }

  async setupTest(): Promise<void> {
    // Wait for service to be ready
    await this.grpcClient.waitForServiceReady();
    
    // Clear any mock storage if available
    try {
      await this.grpcClient.call('ClearMockStorage', {});
    } catch (error) {
      // Ignore if method doesn't exist
    }
  }

  async teardownTest(): Promise<void> {
    // Clean up any test data
    try {
      await this.grpcClient.call('ClearMockStorage', {});
    } catch (error) {
      // Ignore if method doesn't exist
    }
  }

  async processMessage(message: TestMessage): Promise<TestResponse> {
    try {
      const response = await this.grpcClient.call('ProcessMessage', {
        message_type: message.messageType,
        xml_payload: message.xmlPayload,
        metadata: message.metadata || {}
      }) as any;

      return {
        success: true,
        messageId: response.message_id,
        puid: response.puid,
        ...response
      };
    } catch (error: any) {
      return {
        success: false,
        errorMessage: error?.message || error
      };
    }
  }

  async getMessageStatus(messageId: string, puid?: string): Promise<any> {
    return this.grpcClient.call('GetMessageStatus', {
      message_id: messageId,
      puid: puid || ''
    });
  }

  async healthCheck(): Promise<any> {
    return this.grpcClient.healthCheck();
  }

  async getAllMessages(): Promise<any[]> {
    try {
      const response = await this.grpcClient.call('GetAllMessages', {}) as any;
      return response?.messages || [];
    } catch (error) {
      return [];
    }
  }

  async waitForMessageToBeStored(messageId: string, puid: string, maxWaitTime: number = 10000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const allMessages = await this.getAllMessages();
        const found = allMessages.find((msg: any) => 
          msg.message_id === messageId || msg.puid === puid
        );
        
        if (found) {
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await GrpcClientHelper.wait(100);
    }
    
    throw new Error(`Message ${messageId}/${puid} not found after ${maxWaitTime}ms`);
  }

  async processMessageAndWait(message: TestMessage): Promise<{
    response: TestResponse;
    storedMessage: any;
  }> {
    // Process the message
    const response = await this.processMessage(message);

    if (!response.success) {
      throw new Error(`Failed to process message: ${response.errorMessage}`);
    }

    // Wait for background processing to complete
    await this.waitForMessageToBeStored(response.messageId!, response.puid!);

    // Get the stored message
    const allMessages = await this.getAllMessages();
    const storedMessage = allMessages.find((msg: any) => 
      msg.message_id === response.messageId || msg.puid === response.puid
    );

    return { response, storedMessage };
  }

  getGrpcClient(): GrpcTestClient {
    return this.grpcClient;
  }

  getServiceName(): string {
    return this.serviceName;
  }

  async shutdown(): Promise<void> {
    await this.grpcClient.disconnect();
  }
} 