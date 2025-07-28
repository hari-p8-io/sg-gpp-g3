package com.gpp.g3.orchestrator.service;

import com.gpp.g3.orchestrator.config.WorkflowConfiguration;
import com.gpp.g3.orchestrator.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkflowOrchestrationServiceTest {

    @Mock
    private StateManagementService stateManagementService;

    @Mock
    private MessageTransformationService messageTransformationService;

    @Mock
    private KafkaPublishingService kafkaPublishingService;

    @Mock
    private WorkflowConfiguration workflowConfiguration;

    @InjectMocks
    private WorkflowOrchestrationService workflowOrchestrationService;

    private PaymentMessage testMessage;
    private PaymentProcessingState testState;
    private JsonMessage testJsonMessage;

    @BeforeEach
    void setUp() {
        testMessage = createTestPaymentMessage();
        testState = createTestProcessingState();
        testJsonMessage = createTestJsonMessage();
    }

    @Test
    void processPaymentMessage_NoDuplicate_ShouldProcessSuccessfully() {
        // Given
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.empty());
        when(stateManagementService.createInitialState(testMessage)).thenReturn(testState);
        when(workflowConfiguration.getCtiWorkflow()).thenReturn(createCtiWorkflowConfig());
        when(messageTransformationService.transformToJson(testMessage)).thenReturn(testJsonMessage);

        // When
        workflowOrchestrationService.processPaymentMessage(testMessage);

        // Then
        verify(stateManagementService).checkForDuplicate(testMessage);
        verify(stateManagementService).createInitialState(testMessage);
        verify(messageTransformationService).transformToJson(testMessage);
        verify(kafkaPublishingService).publishToAccountingService(testJsonMessage);
    }

    @Test
    void processPaymentMessage_DuplicateFound_ShouldSkipProcessing() {
        // Given
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.of(testState));

        // When
        workflowOrchestrationService.processPaymentMessage(testMessage);

        // Then
        verify(stateManagementService).checkForDuplicate(testMessage);
        verify(stateManagementService, never()).createInitialState(any());
        verify(messageTransformationService, never()).transformToJson(any());
        verify(kafkaPublishingService, never()).publishToAccountingService(any());
    }

    @Test
    void processPaymentMessage_CTIWorkflow_ShouldExecuteCorrectSteps() {
        // Given
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.empty());
        when(stateManagementService.createInitialState(testMessage)).thenReturn(testState);
        when(workflowConfiguration.getCtiWorkflow()).thenReturn(createCtiWorkflowConfig());
        when(messageTransformationService.transformToJson(testMessage)).thenReturn(testJsonMessage);

        // When
        workflowOrchestrationService.processPaymentMessage(testMessage);

        // Then
        verify(workflowConfiguration).getCtiWorkflow();
        verify(messageTransformationService).transformToJson(testMessage);
        verify(kafkaPublishingService).publishToAccountingService(testJsonMessage);
    }

    @Test
    void processPaymentMessage_DDIWorkflow_ShouldExecuteCorrectSteps() {
        // Given
        testMessage.setMessageType("PACS003"); // Direct debit
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.empty());
        when(stateManagementService.createInitialState(testMessage)).thenReturn(testState);
        when(workflowConfiguration.getDdiWorkflow()).thenReturn(createDdiWorkflowConfig());
        when(messageTransformationService.transformToJson(testMessage)).thenReturn(testJsonMessage);

        // When
        workflowOrchestrationService.processPaymentMessage(testMessage);

        // Then
        verify(workflowConfiguration).getDdiWorkflow();
        verify(messageTransformationService).transformToJson(testMessage);
        verify(kafkaPublishingService).publishToAccountingService(testJsonMessage);
    }

    @Test
    void processPaymentMessage_VamMediationRequired_ShouldPublishToVam() {
        // Given
        testMessage.getEnrichmentData().getPhysicalAcctInfo().setAcctSys("VAM");
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.empty());
        when(stateManagementService.createInitialState(testMessage)).thenReturn(testState);
        when(workflowConfiguration.getCtiWorkflow()).thenReturn(createCtiWorkflowConfig());
        when(messageTransformationService.transformToJson(testMessage)).thenReturn(testJsonMessage);

        // When
        workflowOrchestrationService.processPaymentMessage(testMessage);

        // Then
        verify(kafkaPublishingService).publishToAccountingService(testJsonMessage);
        verify(kafkaPublishingService).publishToVamMediationService(testJsonMessage);
    }

    @Test
    void processPaymentMessage_LimitCheckRequired_ShouldPublishToLimitCheck() {
        // Given
        testMessage.getEnrichmentData().setAuthMethod("GROUPLIMIT");
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.empty());
        when(stateManagementService.createInitialState(testMessage)).thenReturn(testState);
        when(workflowConfiguration.getCtiWorkflow()).thenReturn(createCtiWorkflowConfig());
        when(messageTransformationService.transformToJson(testMessage)).thenReturn(testJsonMessage);

        // When
        workflowOrchestrationService.processPaymentMessage(testMessage);

        // Then
        verify(kafkaPublishingService).publishToAccountingService(testJsonMessage);
        verify(kafkaPublishingService).publishToLimitCheckService(testJsonMessage);
    }

    @Test
    void processPaymentMessage_ProcessingError_ShouldMarkAsFailed() {
        // Given
        when(stateManagementService.checkForDuplicate(testMessage)).thenReturn(Optional.empty());
        when(stateManagementService.createInitialState(testMessage)).thenReturn(testState);
        when(workflowConfiguration.getCtiWorkflow()).thenThrow(new RuntimeException("Test error"));

        // When & Then
        assertThrows(RuntimeException.class, () -> 
            workflowOrchestrationService.processPaymentMessage(testMessage));
        
        verify(stateManagementService).markAsFailed(eq(testMessage.getMessageId()), anyString());
    }

    @Test
    void handleDownstreamResponse_AccountingService_ShouldUpdateStatus() {
        // Given
        String messageId = "test-message-id";
        ProcessingStatus status = ProcessingStatus.COMPLETED;
        String responseData = "test-response";
        
        when(stateManagementService.updateAccountingStatus(messageId, status)).thenReturn(testState);

        // When
        workflowOrchestrationService.handleDownstreamResponse("accounting", messageId, status, responseData);

        // Then
        verify(stateManagementService).updateAccountingStatus(messageId, status);
    }

    @Test
    void handleDownstreamResponse_VamMediationService_ShouldUpdateStatus() {
        // Given
        String messageId = "test-message-id";
        ProcessingStatus status = ProcessingStatus.COMPLETED;
        String responseData = "test-response";
        
        when(stateManagementService.updateVamMediationStatus(messageId, status)).thenReturn(testState);

        // When
        workflowOrchestrationService.handleDownstreamResponse("vammediation", messageId, status, responseData);

        // Then
        verify(stateManagementService).updateVamMediationStatus(messageId, status);
    }

    @Test
    void handleDownstreamResponse_LimitCheckService_ShouldUpdateStatus() {
        // Given
        String messageId = "test-message-id";
        ProcessingStatus status = ProcessingStatus.COMPLETED;
        String responseData = "test-response";
        
        when(stateManagementService.updateLimitCheckStatus(messageId, status)).thenReturn(testState);

        // When
        workflowOrchestrationService.handleDownstreamResponse("limitcheck", messageId, status, responseData);

        // Then
        verify(stateManagementService).updateLimitCheckStatus(messageId, status);
    }

    @Test
    void handleDownstreamResponse_UnknownService_ShouldMarkAsFailed() {
        // Given
        String messageId = "test-message-id";
        ProcessingStatus status = ProcessingStatus.COMPLETED;
        String responseData = "test-response";

        // When
        workflowOrchestrationService.handleDownstreamResponse("unknown", messageId, status, responseData);

        // Then
        verify(stateManagementService).markAsFailed(eq(messageId), contains("Error handling response from unknown"));
    }

    @Test
    void handleDownstreamResponse_AllServicesCompleted_ShouldLogCompletion() {
        // Given
        String messageId = "test-message-id";
        ProcessingStatus status = ProcessingStatus.COMPLETED;
        String responseData = "test-response";
        
        PaymentProcessingState completedState = createTestProcessingState();
        completedState.setAccountingStatus(ProcessingStatus.COMPLETED);
        completedState.setVamMediationStatus(ProcessingStatus.NOT_REQUIRED);
        completedState.setLimitCheckStatus(ProcessingStatus.NOT_REQUIRED);
        
        when(stateManagementService.updateAccountingStatus(messageId, status)).thenReturn(completedState);

        // When
        workflowOrchestrationService.handleDownstreamResponse("accounting", messageId, status, responseData);

        // Then
        verify(stateManagementService).updateAccountingStatus(messageId, status);
        // Verify log message would be generated (can't easily test logging without additional setup)
    }

    @Test
    void handleDownstreamResponse_ServiceError_ShouldMarkAsFailed() {
        // Given
        String messageId = "test-message-id";
        ProcessingStatus status = ProcessingStatus.COMPLETED;
        String responseData = "test-response";
        
        when(stateManagementService.updateAccountingStatus(messageId, status))
            .thenThrow(new RuntimeException("Database error"));

        // When
        workflowOrchestrationService.handleDownstreamResponse("accounting", messageId, status, responseData);

        // Then
        verify(stateManagementService).markAsFailed(eq(messageId), contains("Error handling response from accounting"));
    }

    // Helper methods
    private PaymentMessage createTestPaymentMessage() {
        PaymentMessage message = new PaymentMessage();
        message.setMessageId("test-message-id");
        message.setPuid("test-puid");
        message.setMessageType("PACS008");
        message.setOriginalXmlPayload("<test>xml</test>");
        message.setReceivedAt(Instant.now());

        PaymentMessage.EnrichmentData enrichmentData = new PaymentMessage.EnrichmentData();
        enrichmentData.setAuthMethod("STANDARD");
        
        PaymentMessage.PhysicalAcctInfo acctInfo = new PaymentMessage.PhysicalAcctInfo();
        acctInfo.setAcctSys("MDZ");
        acctInfo.setCountry("SG");
        acctInfo.setCurrencyCode("SGD");
        enrichmentData.setPhysicalAcctInfo(acctInfo);
        
        message.setEnrichmentData(enrichmentData);
        return message;
    }

    private PaymentProcessingState createTestProcessingState() {
        PaymentProcessingState state = new PaymentProcessingState();
        state.setMessageId("test-message-id");
        state.setPuid("test-puid");
        state.setMessageType("PACS008");
        state.setWorkflowType(WorkflowType.CTI);
        state.setOverallStatus(ProcessingStatus.RECEIVED);
        state.setAccountingStatus(ProcessingStatus.PENDING);
        state.setVamMediationStatus(ProcessingStatus.NOT_REQUIRED);
        state.setLimitCheckStatus(ProcessingStatus.NOT_REQUIRED);
        state.setRetryCount(0);
        return state;
    }

    private JsonMessage createTestJsonMessage() {
        return new JsonMessage("test-message-id", "test-puid", "PACS008", "credit-transfer-inward");
    }

    private Map<String, Object> createCtiWorkflowConfig() {
        return Map.of(
            "name", "credit-transfer-inward",
            "steps", List.of(
                Map.of(
                    "name", "deduplication-check",
                    "service", "DeduplicationService",
                    "required", true
                ),
                Map.of(
                    "name", "pacs-to-json-transform",
                    "service", "MessageTransformationService",
                    "required", true
                ),
                Map.of(
                    "name", "publish-to-downstream",
                    "service", "JsonPublishingService",
                    "required", true,
                    "targets", List.of("accounting", "vammediation", "limitcheck")
                )
            )
        );
    }

    private Map<String, Object> createDdiWorkflowConfig() {
        return Map.of(
            "name", "direct-debit-inward",
            "steps", List.of(
                Map.of(
                    "name", "deduplication-check",
                    "service", "DeduplicationService",
                    "required", true
                ),
                Map.of(
                    "name", "pacs-to-json-transform",
                    "service", "MessageTransformationService",
                    "required", true
                ),
                Map.of(
                    "name", "publish-to-downstream",
                    "service", "JsonPublishingService",
                    "required", true,
                    "targets", List.of("accounting", "vammediation", "limitcheck")
                )
            )
        );
    }
} 