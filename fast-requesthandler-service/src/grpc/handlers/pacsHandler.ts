import * as grpc from '@grpc/grpc-js';
import { SpannerClient, SafeStrRecord } from '../../database/spanner';
import { UUIDGenerator } from '../../utils/uuidGenerator';
import { PUIDGenerator } from '../../utils/puidGenerator';
import { XSDValidator, ValidationResult } from '../../validation/xsdValidator';
import { SingaporeValidator } from '../../validation/singaporeValidator';
import { XMLParser, MessageInfo } from '../../utils/xmlParser';
import { EnrichmentClient } from '../clients/enrichmentClient';
import defaultConfig from '../../config/default';

export class PacsHandler {
  private spannerClient: SpannerClient;
  private xsdValidator: XSDValidator;
  private enrichmentClient: EnrichmentClient;

  constructor(spannerClient: SpannerClient) {
    this.spannerClient = spannerClient;
    this.xsdValidator = new XSDValidator();
    this.enrichmentClient = new EnrichmentClient(defaultConfig.grpc.enrichmentServiceUrl);
  }

  async processPacsMessage(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      const request = call.request;
      const { message_type, xml_payload, metadata } = request;

      // Input validation
      if (!message_type || !xml_payload) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: message_type or xml_payload',
        });
      }

      // Validate message type
      if (!['PACS008', 'PACS007', 'PACS003'].includes(message_type)) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Invalid message_type. Must be one of: PACS008, PACS007, PACS003',
        });
      }

      // Generate identifiers
      const messageId = UUIDGenerator.generateUUID();
      const puid = PUIDGenerator.generatePUID();
      const timestamp = Date.now();

      console.log(`📨 Processing ${message_type} message:`);
      console.log(`   Message ID: ${messageId}`);
      console.log(`   PUID: ${puid}`);
      console.log(`   Payload size: ${xml_payload.length} bytes`);

      // Extract message info for logging
      const messageInfo = XMLParser.extractMessageInfo(xml_payload);
      if (messageInfo.messageId) {
        console.log(`   Original Msg ID: ${messageInfo.messageId}`);
      }

      // Step 1: Basic XML well-formedness check
      if (!XMLParser.isWellFormedXML(xml_payload)) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Invalid XML payload format - not well-formed XML',
        });
      }

      // Step 2: XSD Schema validation
      const xsdValidation = this.xsdValidator.validateXML(message_type, xml_payload);
      if (!xsdValidation.isValid) {
        console.error(`❌ XSD validation failed for ${puid}:`, xsdValidation.errors);
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: `XSD validation failed: ${xsdValidation.errors.join(', ')}`,
        });
      }

      // Log XSD validation warnings if any
      if (xsdValidation.warnings && xsdValidation.warnings.length > 0) {
        console.warn(`⚠️  XSD validation warnings for ${puid}:`, xsdValidation.warnings);
      }

      // Step 3: Basic Singapore market validation (just warnings)
      const sgValidation = SingaporeValidator.validateBasicSingaporeMarket(xml_payload);
      if (sgValidation.warnings && sgValidation.warnings.length > 0) {
        console.warn(`🇸🇬 Singapore market warnings for ${puid}:`, sgValidation.warnings);
      }

      // Step 4: Persist to database
      const record: SafeStrRecord = {
        message_id: messageId,
        puid: puid,
        message_type: message_type,
        payload: xml_payload,
        created_at: new Date(),
        status: 'RECEIVED',
      };

      await this.spannerClient.insertMessage(record);

      // Update status to VALIDATED after successful XSD validation
      await this.spannerClient.updateMessageStatus(messageId, 'VALIDATED', new Date());

      // Step 5: Forward to enrichment service (async, don't block response)
      // The enrichment service will handle the entire pipeline: accountlookup -> referencedata -> validation -> orchestrator
      this.forwardToEnrichmentService(messageId, puid, message_type, xml_payload, metadata || {})
        .catch(error => {
          console.error(`❌ Failed to forward message ${puid} to enrichment service:`, error);
          // Update status to FAILED in background
          this.spannerClient.updateMessageStatus(messageId, 'FAILED').catch(dbError => {
            console.error(`❌ Failed to update status for ${messageId}:`, dbError);
          });
        });

      // Return immediate response - don't wait for enrichment
      const response = {
        message_id: messageId,
        puid: puid,
        success: true,
        error_message: '',
        timestamp: timestamp,
        status: 'VALIDATED',
      };

      console.log(`✅ Message ${puid} processed successfully and queued for enrichment`);
      callback(null, response);

    } catch (error) {
      console.error('❌ Error processing PACS message:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  }

  private async forwardToEnrichmentService(
    messageId: string,
    puid: string,
    messageType: string,
    xmlPayload: string,
    metadata: Record<string, string>
  ): Promise<void> {
    try {
      console.log(`🔄 Forwarding message ${puid} to enrichment service...`);
      
      const response = await this.enrichmentClient.forwardMessage(
        messageId,
        puid,
        messageType,
        xmlPayload,
        metadata,
        defaultConfig.processing.enrichmentTimeout
      );

      if (response.success) {
        console.log(`✅ Message ${puid} successfully processed through enrichment pipeline`);
        await this.spannerClient.updateMessageStatus(messageId, 'PIPELINE_COMPLETE', new Date());
      } else {
        console.error(`❌ Enrichment pipeline failed for ${puid}: ${response.error_message}`);
        await this.spannerClient.updateMessageStatus(messageId, 'FAILED', new Date());
      }
    } catch (error) {
      console.error(`❌ Enrichment pipeline error for ${puid}:`, error);
      await this.spannerClient.updateMessageStatus(messageId, 'FAILED', new Date());
      throw error;
    }
  }

  async getMessageStatus(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      const request = call.request;
      const { message_id, puid } = request;

      if (!message_id && !puid) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing identifier (message_id or puid)',
        });
      }

      let record: SafeStrRecord | null = null;

      // Try to get by message_id first
      if (message_id) {
        record = await this.spannerClient.getMessageById(message_id);
      }
      // Then try by puid
      else if (puid) {
        record = await this.spannerClient.getMessageByPuid(puid);
      }

      if (!record) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Message not found',
        });
      }

      const response = {
        message_id: record.message_id,
        puid: record.puid,
        status: record.status,
        created_at: record.created_at.getTime(),
        processed_at: record.processed_at?.getTime() || 0,
        message_type: record.message_type,
      };

      callback(null, response);
    } catch (error) {
      console.error('❌ Error getting message status:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  }

  async healthCheck(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      const isHealthy = await this.spannerClient.healthCheck();
      const response = {
        status: isHealthy ? 1 : 2, // 1 = SERVING, 2 = NOT_SERVING
        message: isHealthy ? 'Service is healthy' : 'Service is unhealthy',
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

  // Database inspection methods for testing
  async getAllMessages(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      const messages = await this.spannerClient.getAllMessages();
      
      // Convert messages to proto format
      const protoMessages = messages.map(msg => ({
        message_id: msg.message_id,
        puid: msg.puid,
        message_type: msg.message_type,
        payload: msg.payload,
        created_at: msg.created_at.getTime(),
        processed_at: msg.processed_at ? msg.processed_at.getTime() : 0,
        status: msg.status,
      }));

      const response = {
        messages: protoMessages,
      };

      callback(null, response);
    } catch (error) {
      console.error('❌ Failed to get all messages:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to retrieve messages',
      });
    }
  }

  async clearMockStorage(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      this.spannerClient.clearMockStorage();
      
      const response = {
        success: true,
        message: 'Mock storage cleared successfully',
      };

      callback(null, response);
    } catch (error) {
      console.error('❌ Failed to clear mock storage:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to clear mock storage',
      });
    }
  }

  async getMockStorageSize(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): Promise<void> {
    try {
      const size = this.spannerClient.getMockStorageSize();
      
      const response = {
        size: size,
      };

      callback(null, response);
    } catch (error) {
      console.error('❌ Failed to get mock storage size:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to get mock storage size',
      });
    }
  }
} 