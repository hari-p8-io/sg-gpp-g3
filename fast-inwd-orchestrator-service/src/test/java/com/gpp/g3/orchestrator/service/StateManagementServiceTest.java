package com.gpp.g3.orchestrator.service;

import com.gpp.g3.orchestrator.model.PaymentMessage;
import com.gpp.g3.orchestrator.model.PaymentProcessingState;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import com.gpp.g3.orchestrator.model.WorkflowType;
import com.gpp.g3.orchestrator.repository.PaymentProcessingStateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StateManagementServiceTest {

    @Mock
    private PaymentProcessingStateRepository stateRepository;

    @InjectMocks
    private StateManagementService stateManagementService;

    private PaymentMessage testMessage;
    private PaymentProcessingState testState;

    @BeforeEach
    void setUp() {
        testMessage = createTestPaymentMessage();
        testState = createTestProcessingState();
    }

    @Test
    void createInitialState_ShouldCreateNewState() {
        // Given
        when(stateRepository.save(any(PaymentProcessingState.class))).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.createInitialState(testMessage);

        // Then
        assertNotNull(result);
        assertEquals(testMessage.getMessageId(), result.getMessageId());
        assertEquals(testMessage.getPuid(), result.getPuid());
        assertEquals(testMessage.getMessageType(), result.getMessageType());
        assertEquals(WorkflowType.CTI, result.getWorkflowType());
        assertEquals(ProcessingStatus.RECEIVED, result.getOverallStatus());
        
        verify(stateRepository).save(any(PaymentProcessingState.class));
    }

    @Test
    void createInitialState_ShouldInitializeDownstreamStatuses() {
        // Given
        when(stateRepository.save(any(PaymentProcessingState.class))).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.createInitialState(testMessage);

        // Then
        assertEquals(ProcessingStatus.PENDING, result.getAccountingStatus());
        assertEquals(ProcessingStatus.NOT_REQUIRED, result.getVamMediationStatus()); // MDZ system
        assertEquals(ProcessingStatus.NOT_REQUIRED, result.getLimitCheckStatus()); // STANDARD auth
    }

    @Test
    void createInitialState_VamMediationRequired() {
        // Given
        testMessage.getEnrichmentData().getPhysicalAcctInfo().setAcctSys("VAM");
        when(stateRepository.save(any(PaymentProcessingState.class))).thenReturn(testState);
        
        // When
        PaymentProcessingState result = stateManagementService.createInitialState(testMessage);

        // Then
        verify(stateRepository).save(argThat(state -> 
            state.getVamMediationStatus() == ProcessingStatus.PENDING));
        assertNotNull(result);
    }

    @Test
    void createInitialState_LimitCheckRequired() {
        // Given
        testMessage.getEnrichmentData().setAuthMethod("GROUPLIMIT");
        when(stateRepository.save(any(PaymentProcessingState.class))).thenReturn(testState);
        
        // When
        PaymentProcessingState result = stateManagementService.createInitialState(testMessage);

        // Then
        verify(stateRepository).save(argThat(state -> 
            state.getLimitCheckStatus() == ProcessingStatus.PENDING));
        assertNotNull(result);
    }

    @Test
    void checkForDuplicate_ShouldReturnExistingState() {
        // Given
        when(stateRepository.findByMessageHash(anyString())).thenReturn(Optional.of(testState));

        // When
        Optional<PaymentProcessingState> result = stateManagementService.checkForDuplicate(testMessage);

        // Then
        assertTrue(result.isPresent());
        assertEquals(testState, result.get());
    }

    @Test
    void checkForDuplicate_ShouldReturnEmpty() {
        // Given
        when(stateRepository.findByMessageHash(anyString())).thenReturn(Optional.empty());

        // When
        Optional<PaymentProcessingState> result = stateManagementService.checkForDuplicate(testMessage);

        // Then
        assertFalse(result.isPresent());
    }

    @Test
    void updateAccountingStatus_ShouldUpdateStatus() {
        // Given
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));
        when(stateRepository.save(testState)).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.updateAccountingStatus(
            testMessage.getMessageId(), ProcessingStatus.COMPLETED);

        // Then
        assertEquals(ProcessingStatus.COMPLETED, result.getAccountingStatus());
        verify(stateRepository).save(testState);
    }

    @Test
    void updateAccountingStatus_MessageNotFound_ShouldThrowException() {
        // Given
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.empty());

        // When & Then
        assertThrows(IllegalArgumentException.class, () ->
            stateManagementService.updateAccountingStatus(testMessage.getMessageId(), ProcessingStatus.COMPLETED));
    }

    @Test
    void updateVamMediationStatus_ShouldUpdateStatus() {
        // Given
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));
        when(stateRepository.save(testState)).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.updateVamMediationStatus(
            testMessage.getMessageId(), ProcessingStatus.COMPLETED);

        // Then
        assertEquals(ProcessingStatus.COMPLETED, result.getVamMediationStatus());
        verify(stateRepository).save(testState);
    }

    @Test
    void updateLimitCheckStatus_ShouldUpdateStatus() {
        // Given
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));
        when(stateRepository.save(testState)).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.updateLimitCheckStatus(
            testMessage.getMessageId(), ProcessingStatus.COMPLETED);

        // Then
        assertEquals(ProcessingStatus.COMPLETED, result.getLimitCheckStatus());
        verify(stateRepository).save(testState);
    }

    @Test
    void updateStatus_AllServicesCompleted_ShouldMarkAsCompleted() {
        // Given
        testState.setAccountingStatus(ProcessingStatus.COMPLETED);
        testState.setVamMediationStatus(ProcessingStatus.NOT_REQUIRED);
        testState.setLimitCheckStatus(ProcessingStatus.NOT_REQUIRED);
        
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));
        when(stateRepository.save(testState)).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.updateAccountingStatus(
            testMessage.getMessageId(), ProcessingStatus.COMPLETED);

        // Then
        assertEquals(ProcessingStatus.COMPLETED, result.getOverallStatus());
        assertNotNull(result.getCompletedAt());
    }

    @Test
    void markAsFailed_ShouldUpdateStateAsFailed() {
        // Given
        String errorMessage = "Test error";
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));
        when(stateRepository.save(testState)).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.markAsFailed(testMessage.getMessageId(), errorMessage);

        // Then
        assertEquals(ProcessingStatus.FAILED, result.getOverallStatus());
        assertEquals(errorMessage, result.getErrorMessage());
        verify(stateRepository).save(testState);
    }

    @Test
    void incrementRetryCount_ShouldIncrementCounter() {
        // Given
        int initialRetryCount = testState.getRetryCount();
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));
        when(stateRepository.save(testState)).thenReturn(testState);

        // When
        PaymentProcessingState result = stateManagementService.incrementRetryCount(testMessage.getMessageId());

        // Then
        assertEquals(initialRetryCount + 1, result.getRetryCount());
        verify(stateRepository).save(testState);
    }

    @Test
    void getProcessingState_ShouldReturnState() {
        // Given
        when(stateRepository.findById(testMessage.getMessageId())).thenReturn(Optional.of(testState));

        // When
        Optional<PaymentProcessingState> result = stateManagementService.getProcessingState(testMessage.getMessageId());

        // Then
        assertTrue(result.isPresent());
        assertEquals(testState, result.get());
    }

    @Test
    void getProcessingStatesByPuid_ShouldReturnStates() {
        // Given
        List<PaymentProcessingState> states = List.of(testState);
        when(stateRepository.findByPuid(testMessage.getPuid())).thenReturn(states);

        // When
        List<PaymentProcessingState> result = stateManagementService.getProcessingStatesByPuid(testMessage.getPuid());

        // Then
        assertEquals(1, result.size());
        assertEquals(testState, result.get(0));
    }

    @Test
    void getPendingProcessingStates_ShouldReturnPendingStates() {
        // Given
        List<PaymentProcessingState> states = List.of(testState);
        when(stateRepository.findPendingProcessingStates()).thenReturn(states);

        // When
        List<PaymentProcessingState> result = stateManagementService.getPendingProcessingStates();

        // Then
        assertEquals(1, result.size());
        assertEquals(testState, result.get(0));
    }

    @Test
    void getTimedOutProcessingStates_ShouldReturnTimedOutStates() {
        // Given
        long timeoutMinutes = 30;
        List<PaymentProcessingState> states = List.of(testState);
        when(stateRepository.findTimedOutProcessingStates(any(Instant.class))).thenReturn(states);

        // When
        List<PaymentProcessingState> result = stateManagementService.getTimedOutProcessingStates(timeoutMinutes);

        // Then
        assertEquals(1, result.size());
        assertEquals(testState, result.get(0));
        verify(stateRepository).findTimedOutProcessingStates(any(Instant.class));
    }

    @Test
    void cleanupOldCompletedStates_ShouldCallRepository() {
        // Given
        long retentionDays = 30;

        // When
        stateManagementService.cleanupOldCompletedStates(retentionDays);

        // Then
        verify(stateRepository).deleteOldCompletedStates(any(Instant.class));
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
} 