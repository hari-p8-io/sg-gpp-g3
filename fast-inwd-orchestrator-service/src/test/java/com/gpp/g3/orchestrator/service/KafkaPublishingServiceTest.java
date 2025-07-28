package com.gpp.g3.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gpp.g3.orchestrator.model.JsonMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.time.Instant;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KafkaPublishingServiceTest {

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private KafkaPublishingService kafkaPublishingService;

    private JsonMessage testJsonMessage;

    @BeforeEach
    void setUp() {
        testJsonMessage = new JsonMessage("test-msg-id", "test-puid", "PACS008", "credit-transfer-inward");
        testJsonMessage.setProcessedAt(Instant.now());
        
        JsonMessage.PaymentData paymentData = new JsonMessage.PaymentData();
        paymentData.setAmount("100.00");
        paymentData.setCurrency("SGD");
        paymentData.setDebtorAccount("123456789");
        paymentData.setCreditorAccount("987654321");
        testJsonMessage.setPaymentData(paymentData);
    }

    @Test
    void publishToAccountingService_ShouldSendMessage() throws Exception {
        // Given
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"messageId\":\"test-msg-id\"}");
        when(kafkaTemplate.send(eq("fast-accounting"), eq(testJsonMessage.getMessageId()), any(String.class)))
            .thenReturn(future);

        // When
        kafkaPublishingService.publishToAccountingService(testJsonMessage);

        // Then
        verify(objectMapper).writeValueAsString(testJsonMessage);
        verify(kafkaTemplate).send(eq("fast-accounting"), eq(testJsonMessage.getMessageId()), any(String.class));
    }

    @Test
    void publishToVamMediationService_ShouldSendMessage() throws Exception {
        // Given
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"messageId\":\"test-msg-id\"}");
        when(kafkaTemplate.send(eq("fast-vammediation"), eq(testJsonMessage.getMessageId()), any(String.class)))
            .thenReturn(future);

        // When
        kafkaPublishingService.publishToVamMediationService(testJsonMessage);

        // Then
        verify(objectMapper).writeValueAsString(testJsonMessage);
        verify(kafkaTemplate).send(eq("fast-vammediation"), eq(testJsonMessage.getMessageId()), any(String.class));
    }

    @Test
    void publishToLimitCheckService_ShouldSendMessage() throws Exception {
        // Given
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"messageId\":\"test-msg-id\"}");
        when(kafkaTemplate.send(eq("fast-limitcheck"), eq(testJsonMessage.getMessageId()), any(String.class)))
            .thenReturn(future);

        // When
        kafkaPublishingService.publishToLimitCheckService(testJsonMessage);

        // Then
        verify(objectMapper).writeValueAsString(testJsonMessage);
        verify(kafkaTemplate).send(eq("fast-limitcheck"), eq(testJsonMessage.getMessageId()), any(String.class));
    }

    @Test
    void publishToAccountingService_WhenObjectMapperFails_ShouldHandleGracefully() throws Exception {
        // Given
        when(objectMapper.writeValueAsString(any())).thenThrow(new RuntimeException("JSON error"));

        // When & Then - should not throw exception, service catches and logs error
        kafkaPublishingService.publishToAccountingService(testJsonMessage);

        verify(objectMapper).writeValueAsString(testJsonMessage);
        verify(kafkaTemplate, never()).send(any(), any(), any());
    }

    @Test
    void publishToVamMediationService_WhenObjectMapperFails_ShouldHandleGracefully() throws Exception {
        // Given
        when(objectMapper.writeValueAsString(any())).thenThrow(new RuntimeException("JSON error"));

        // When & Then - should not throw exception, service catches and logs error
        kafkaPublishingService.publishToVamMediationService(testJsonMessage);

        verify(objectMapper).writeValueAsString(testJsonMessage);
        verify(kafkaTemplate, never()).send(any(), any(), any());
    }

    @Test
    void publishToLimitCheckService_WhenObjectMapperFails_ShouldHandleGracefully() throws Exception {
        // Given
        when(objectMapper.writeValueAsString(any())).thenThrow(new RuntimeException("JSON error"));

        // When & Then - should not throw exception, service catches and logs error
        kafkaPublishingService.publishToLimitCheckService(testJsonMessage);

        verify(objectMapper).writeValueAsString(testJsonMessage);
        verify(kafkaTemplate, never()).send(any(), any(), any());
    }
} 