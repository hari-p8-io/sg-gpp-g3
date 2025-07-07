import { test, expect } from '@playwright/test';
import GrpcClientHelper from '../../utils/grpc-client';

test.describe('Database Integration Tests', () => {
  let grpcClient: GrpcClientHelper;

  test.beforeEach(async () => {
    grpcClient = new GrpcClientHelper();
    
    // Clear mock storage before each test
    try {
      await grpcClient.clearMockStorage();
    } catch (error) {
      // Ignore errors if method not available
      console.log('ClearMockStorage not available, continuing...');
    }
  });

  test('should store PACS008 message in database', async () => {
    // Load test XML
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS008');

    // Process the message
    const response = await grpcClient.processPacsMessage('PACS008', xmlPayload);

    // Verify response
    expect(response.success).toBe(true);
    expect(GrpcClientHelper.isValidUUID(response.message_id)).toBe(true);
    expect(GrpcClientHelper.isValidPUID(response.puid)).toBe(true);

    // Wait for processing to complete
    await GrpcClientHelper.wait(500);

    // Verify database storage
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(1);

    const storedMessage = allMessages[0];
    expect(storedMessage.message_id).toBe(response.message_id);
    expect(storedMessage.puid).toBe(response.puid);
    expect(storedMessage.message_type).toBe('PACS008');
    expect(storedMessage.payload).toBe(xmlPayload);
    expect(['RECEIVED', 'VALIDATED', 'ENRICHED']).toContain(storedMessage.status);

    // Validate database record structure
    const validation = GrpcClientHelper.validateDatabaseRecord(storedMessage, 'PACS008');
    expect(validation.isValid).toBe(true);
    if (!validation.isValid) {
      console.log('Validation errors:', validation.errors);
    }
  });

  test('should store PACS007 message in database', async () => {
    // Load test XML
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS007');

    // Process the message
    const response = await grpcClient.processPacsMessage('PACS007', xmlPayload);

    // Verify response
    expect(response.success).toBe(true);
    expect(GrpcClientHelper.isValidUUID(response.message_id)).toBe(true);
    expect(GrpcClientHelper.isValidPUID(response.puid)).toBe(true);

    // Wait for processing to complete
    await GrpcClientHelper.wait(500);

    // Verify database storage
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(1);

    const storedMessage = allMessages[0];
    expect(storedMessage.message_id).toBe(response.message_id);
    expect(storedMessage.puid).toBe(response.puid);
    expect(storedMessage.message_type).toBe('PACS007');
    expect(storedMessage.payload).toBe(xmlPayload);
    expect(['RECEIVED', 'VALIDATED', 'ENRICHED']).toContain(storedMessage.status);

    // Validate database record structure
    const validation = GrpcClientHelper.validateDatabaseRecord(storedMessage, 'PACS007');
    expect(validation.isValid).toBe(true);
    if (!validation.isValid) {
      console.log('Validation errors:', validation.errors);
    }
  });

  test('should store PACS003 message in database', async () => {
    // Load test XML
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS003');

    // Process the message
    const response = await grpcClient.processPacsMessage('PACS003', xmlPayload);

    // Verify response
    expect(response.success).toBe(true);
    expect(GrpcClientHelper.isValidUUID(response.message_id)).toBe(true);
    expect(GrpcClientHelper.isValidPUID(response.puid)).toBe(true);

    // Wait for processing to complete
    await GrpcClientHelper.wait(500);

    // Verify database storage
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(1);

    const storedMessage = allMessages[0];
    expect(storedMessage.message_id).toBe(response.message_id);
    expect(storedMessage.puid).toBe(response.puid);
    expect(storedMessage.message_type).toBe('PACS003');
    expect(storedMessage.payload).toBe(xmlPayload);
    expect(['RECEIVED', 'VALIDATED', 'ENRICHED']).toContain(storedMessage.status);

    // Validate database record structure
    const validation = GrpcClientHelper.validateDatabaseRecord(storedMessage, 'PACS003');
    expect(validation.isValid).toBe(true);
    if (!validation.isValid) {
      console.log('Validation errors:', validation.errors);
    }
  });

  test('should store multiple messages in database', async () => {
    // Process multiple different messages
    const pacs008Xml = GrpcClientHelper.loadTestXML('PACS008');
    const pacs007Xml = GrpcClientHelper.loadTestXML('PACS007');
    const pacs003Xml = GrpcClientHelper.loadTestXML('PACS003');

    const response1 = await grpcClient.processPacsMessage('PACS008', pacs008Xml);
    const response2 = await grpcClient.processPacsMessage('PACS007', pacs007Xml);
    const response3 = await grpcClient.processPacsMessage('PACS003', pacs003Xml);

    // Verify all responses
    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);
    expect(response3.success).toBe(true);

    // Wait for processing to complete
    await GrpcClientHelper.wait(1000);

    // Verify database storage
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(3);

    // Verify each message type is stored
    const messageTypes = allMessages.map(msg => msg.message_type);
    expect(messageTypes).toContain('PACS008');
    expect(messageTypes).toContain('PACS007');
    expect(messageTypes).toContain('PACS003');

    // Verify all messages have unique IDs
    const messageIds = allMessages.map(msg => msg.message_id);
    const uniqueIds = [...new Set(messageIds)];
    expect(uniqueIds.length).toBe(3);

    const puids = allMessages.map(msg => msg.puid);
    const uniquePuids = [...new Set(puids)];
    expect(uniquePuids.length).toBe(3);
  });

  test('should query message by ID', async () => {
    // Process a message
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS008');
    const response = await grpcClient.processPacsMessage('PACS008', xmlPayload);

    // Wait for processing to complete
    await GrpcClientHelper.wait(500);

    // Query by message ID
    const statusResponse = await grpcClient.getMessageStatus(response.message_id);
    expect(statusResponse.message_id).toBe(response.message_id);
    expect(statusResponse.puid).toBe(response.puid);
    expect(statusResponse.message_type).toBe('PACS008');
    expect(['RECEIVED', 'VALIDATED', 'ENRICHED']).toContain(statusResponse.status);
  });

  test('should query message by PUID', async () => {
    // Process a message
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS008');
    const response = await grpcClient.processPacsMessage('PACS008', xmlPayload);

    // Wait for processing to complete
    await GrpcClientHelper.wait(500);

    // Query by PUID
    const statusResponse = await grpcClient.getMessageStatus(undefined, response.puid);
    expect(statusResponse.message_id).toBe(response.message_id);
    expect(statusResponse.puid).toBe(response.puid);
    expect(statusResponse.message_type).toBe('PACS008');
    expect(['RECEIVED', 'VALIDATED', 'ENRICHED']).toContain(statusResponse.status);
  });

  test('should track message status progression', async () => {
    // Process a message
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS008');
    const response = await grpcClient.processPacsMessage('PACS008', xmlPayload);

    // Verify initial status
    expect(['RECEIVED', 'VALIDATED']).toContain(response.status);

    // Wait for enrichment to complete
    await GrpcClientHelper.wait(1000);

    // Check final status
    const statusResponse = await grpcClient.getMessageStatus(response.message_id);
    expect(['VALIDATED', 'ENRICHED']).toContain(statusResponse.status);

    // Verify database record shows progression
    const allMessages = await grpcClient.getAllMessages();
    const storedMessage = allMessages.find(msg => msg.message_id === response.message_id);
    expect(storedMessage).toBeDefined();
    expect(['RECEIVED', 'VALIDATED', 'ENRICHED']).toContain(storedMessage!.status);
  });

  test('should validate Singapore market data in database', async () => {
    // Process Singapore PACS008 message
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS008');
    const response = await grpcClient.processPacsMessage('PACS008', xmlPayload);

    // Wait for processing to complete
    await GrpcClientHelper.wait(500);

    // Get stored message
    const allMessages = await grpcClient.getAllMessages();
    const storedMessage = allMessages[0];

    // Validate Singapore-specific fields in stored payload
    const sgValidation = GrpcClientHelper.validateSingaporeFields(storedMessage.payload);
    expect(sgValidation.hasValidCurrency).toBe(true);
    expect(sgValidation.hasValidCountry).toBe(true);

    // Log any warnings
    if (sgValidation.warnings.length > 0) {
      console.log('Singapore validation warnings:', sgValidation.warnings);
    }
  });

  test('should handle mock storage operations', async () => {
    // Check initial size
    const initialSize = await grpcClient.getMockStorageSize();
    expect(initialSize).toBe(0);

    // Process a message
    const xmlPayload = GrpcClientHelper.loadTestXML('PACS008');
    await grpcClient.processPacsMessage('PACS008', xmlPayload);

    // Check size after processing
    const sizeAfterProcessing = await grpcClient.getMockStorageSize();
    expect(sizeAfterProcessing).toBe(1);

    // Clear storage
    await grpcClient.clearMockStorage();

    // Check size after clearing
    const sizeAfterClearing = await grpcClient.getMockStorageSize();
    expect(sizeAfterClearing).toBe(0);

    // Verify no messages remain
    const allMessages = await grpcClient.getAllMessages();
    expect(allMessages.length).toBe(0);
  });
}); 