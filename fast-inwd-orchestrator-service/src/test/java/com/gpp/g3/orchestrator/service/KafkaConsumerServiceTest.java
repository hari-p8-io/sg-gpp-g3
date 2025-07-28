package com.gpp.g3.orchestrator.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gpp.g3.orchestrator.model.PaymentMessage;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KafkaConsumerServiceTest {

    @Mock
    private WorkflowOrchestrationService workflowOrchestrationService;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private KafkaConsumerService kafkaConsumerService;

    @Mock
    private Acknowledgment acknowledgment;

    private String testPayload;

    @BeforeEach
    void setUp() {
        testPayload = """
            {
                "messageId": "test-msg-id",
                "puid": "test-puid", 
                "messageType": "PACS008",
                "originalXmlPayload": "<test>xml</test>",
                "receivedAt": "2024-01-01T10:00:00Z"
            }
            """;
    }

    @Test
    void consumePaymentMessage_ValidPayload_ShouldProcessSuccessfully() throws Exception {
        // Given
        PaymentMessage paymentMessage = createTestPaymentMessage();
        when(objectMapper.readValue(testPayload, PaymentMessage.class)).thenReturn(paymentMessage);

        // When
        kafkaConsumerService.consumePaymentMessage(testPayload, "test-key", "test-topic", 0, 123L, acknowledgment);

        // Then
        verify(objectMapper).readValue(testPayload, PaymentMessage.class);
        verify(workflowOrchestrationService).processPaymentMessage(paymentMessage);
        verify(acknowledgment).acknowledge();
    }

    @Test
    void consumePaymentMessage_InvalidJson_ShouldHandleGracefully() throws Exception {
        // Given
        String invalidPayload = "invalid json";
        when(objectMapper.readValue(invalidPayload, PaymentMessage.class))
            .thenThrow(new RuntimeException("JSON parse error"));

        // When
        kafkaConsumerService.consumePaymentMessage(invalidPayload, "test-key", "test-topic", 0, 123L, acknowledgment);

        // Then
        verify(objectMapper).readValue(invalidPayload, PaymentMessage.class);
        verify(workflowOrchestrationService, never()).processPaymentMessage(any());
        verify(acknowledgment).acknowledge(); // Service acknowledges even failed messages
    }

    @Test
    void consumePaymentMessage_ProcessingError_ShouldHandleGracefully() throws Exception {
        // Given
        PaymentMessage paymentMessage = createTestPaymentMessage();
        when(objectMapper.readValue(testPayload, PaymentMessage.class)).thenReturn(paymentMessage);
        doThrow(new RuntimeException("Processing error")).when(workflowOrchestrationService)
            .processPaymentMessage(paymentMessage);

        // When
        kafkaConsumerService.consumePaymentMessage(testPayload, "test-key", "test-topic", 0, 123L, acknowledgment);

        // Then
        verify(objectMapper).readValue(testPayload, PaymentMessage.class);
        verify(workflowOrchestrationService).processPaymentMessage(paymentMessage);
        verify(acknowledgment).acknowledge(); // Service acknowledges even failed messages
    }

    @Test
    void consumeAccountingResponse_ValidPayload_ShouldProcessSuccessfully() throws Exception {
        // Given
        String responsePayload = """
            {
                "status": "COMPLETED",
                "data": {"result": "success"}
            }
            """;
        
        JsonNode responseNode = mock(JsonNode.class);
        JsonNode statusNode = mock(JsonNode.class);
        JsonNode dataNode = mock(JsonNode.class);

        when(objectMapper.readTree(responsePayload)).thenReturn(responseNode);
        when(responseNode.get("status")).thenReturn(statusNode);
        when(responseNode.has("data")).thenReturn(true);
        when(responseNode.get("data")).thenReturn(dataNode);
        when(statusNode.asText()).thenReturn("COMPLETED");
        when(dataNode.toString()).thenReturn("{\"result\": \"success\"}");

        // When
        kafkaConsumerService.consumeAccountingResponse(responsePayload, "test-msg-id", acknowledgment);

        // Then
        verify(objectMapper).readTree(responsePayload);
        verify(workflowOrchestrationService).handleDownstreamResponse(eq("accounting"), eq("test-msg-id"), 
            eq(ProcessingStatus.COMPLETED), eq("{\"result\": \"success\"}"));
        verify(acknowledgment).acknowledge();
    }

    @Test
    void consumeAccountingResponse_InvalidJson_ShouldHandleGracefully() throws Exception {
        // Given
        String invalidPayload = "invalid json";
        when(objectMapper.readTree(invalidPayload)).thenThrow(new RuntimeException("JSON parse error"));

        // When
        kafkaConsumerService.consumeAccountingResponse(invalidPayload, "test-msg-id", acknowledgment);

        // Then
        verify(objectMapper).readTree(invalidPayload);
        verify(workflowOrchestrationService, never()).handleDownstreamResponse(any(), any(), any(), any());
        verify(acknowledgment).acknowledge();
    }

    @Test
    void consumeVamMediationResponse_ValidPayload_ShouldProcessSuccessfully() throws Exception {
        // Given
        String responsePayload = """
            {
                "status": "COMPLETED",
                "data": {"result": "success"}
            }
            """;
        
        JsonNode responseNode = mock(JsonNode.class);
        JsonNode statusNode = mock(JsonNode.class);
        JsonNode dataNode = mock(JsonNode.class);

        when(objectMapper.readTree(responsePayload)).thenReturn(responseNode);
        when(responseNode.get("status")).thenReturn(statusNode);
        when(responseNode.has("data")).thenReturn(true);
        when(responseNode.get("data")).thenReturn(dataNode);
        when(statusNode.asText()).thenReturn("COMPLETED");
        when(dataNode.toString()).thenReturn("{\"result\": \"success\"}");

        // When
        kafkaConsumerService.consumeVamMediationResponse(responsePayload, "test-msg-id", acknowledgment);

        // Then
        verify(objectMapper).readTree(responsePayload);
        verify(workflowOrchestrationService).handleDownstreamResponse(eq("vammediation"), eq("test-msg-id"), 
            eq(ProcessingStatus.COMPLETED), eq("{\"result\": \"success\"}"));
        verify(acknowledgment).acknowledge();
    }

    @Test
    void consumeLimitCheckResponse_ValidPayload_ShouldProcessSuccessfully() throws Exception {
        // Given
        String responsePayload = """
            {
                "status": "COMPLETED"
            }
            """;
        
        JsonNode responseNode = mock(JsonNode.class);
        JsonNode statusNode = mock(JsonNode.class);

        when(objectMapper.readTree(responsePayload)).thenReturn(responseNode);
        when(responseNode.get("status")).thenReturn(statusNode);
        when(responseNode.has("data")).thenReturn(false);
        when(statusNode.asText()).thenReturn("COMPLETED");

        // When
        kafkaConsumerService.consumeLimitCheckResponse(responsePayload, "test-msg-id", acknowledgment);

        // Then
        verify(objectMapper).readTree(responsePayload);
        verify(workflowOrchestrationService).handleDownstreamResponse(eq("limitcheck"), eq("test-msg-id"), 
            eq(ProcessingStatus.COMPLETED), eq(null));
        verify(acknowledgment).acknowledge();
    }

    private PaymentMessage createTestPaymentMessage() {
        PaymentMessage message = new PaymentMessage();
        message.setMessageId("test-msg-id");
        message.setPuid("test-puid");
        message.setMessageType("PACS008");
        message.setOriginalXmlPayload("<test>xml</test>");
        message.setReceivedAt(Instant.now());
        return message;
    }
} 