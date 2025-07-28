package com.gpp.g3.orchestrator.controller;

import com.gpp.g3.orchestrator.model.PaymentProcessingState;
import com.gpp.g3.orchestrator.service.StateManagementService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrchestratorControllerTest {

    @Mock
    private StateManagementService stateManagementService;

    @InjectMocks
    private OrchestratorController orchestratorController;

    private PaymentProcessingState testState;

    @BeforeEach
    void setUp() {
        testState = new PaymentProcessingState();
        testState.setMessageId("test-message-id");
        testState.setPuid("test-puid");
    }

    @Test
    void health_ShouldReturnHealthStatus() {
        // When
        ResponseEntity<Map<String, Object>> response = orchestratorController.health();

        // Then
        assertEquals(200, response.getStatusCodeValue());
        Map<String, Object> body = response.getBody();
        assertNotNull(body);
        assertEquals("fast-inwd-orchestrator-service", body.get("service"));
        assertEquals("healthy", body.get("status"));
        assertEquals("1.0.0", body.get("version"));
        assertNotNull(body.get("timestamp"));
    }

    @Test
    void getProcessingState_ExistingMessage_ShouldReturnState() {
        // Given
        String messageId = "test-message-id";
        when(stateManagementService.getProcessingState(messageId)).thenReturn(Optional.of(testState));

        // When
        ResponseEntity<PaymentProcessingState> response = orchestratorController.getProcessingState(messageId);

        // Then
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(testState, response.getBody());
        verify(stateManagementService).getProcessingState(messageId);
    }

    @Test
    void getProcessingState_NonExistingMessage_ShouldReturnNotFound() {
        // Given
        String messageId = "non-existing-message-id";
        when(stateManagementService.getProcessingState(messageId)).thenReturn(Optional.empty());

        // When
        ResponseEntity<PaymentProcessingState> response = orchestratorController.getProcessingState(messageId);

        // Then
        assertEquals(404, response.getStatusCodeValue());
        assertNull(response.getBody());
        verify(stateManagementService).getProcessingState(messageId);
    }

    @Test
    void getProcessingStatesByPuid_ShouldReturnStates() {
        // Given
        String puid = "test-puid";
        List<PaymentProcessingState> states = Arrays.asList(testState);
        when(stateManagementService.getProcessingStatesByPuid(puid)).thenReturn(states);

        // When
        ResponseEntity<List<PaymentProcessingState>> response = orchestratorController.getProcessingStatesByPuid(puid);

        // Then
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(states, response.getBody());
        verify(stateManagementService).getProcessingStatesByPuid(puid);
    }

    @Test
    void getPendingProcessingStates_ShouldReturnPendingStates() {
        // Given
        List<PaymentProcessingState> pendingStates = Arrays.asList(testState);
        when(stateManagementService.getPendingProcessingStates()).thenReturn(pendingStates);

        // When
        ResponseEntity<List<PaymentProcessingState>> response = orchestratorController.getPendingProcessingStates();

        // Then
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(pendingStates, response.getBody());
        verify(stateManagementService).getPendingProcessingStates();
    }

    @Test
    void getTimedOutProcessingStates_ShouldReturnTimedOutStates() {
        // Given
        long timeoutMinutes = 60;
        List<PaymentProcessingState> timedOutStates = Arrays.asList(testState);
        when(stateManagementService.getTimedOutProcessingStates(timeoutMinutes)).thenReturn(timedOutStates);

        // When
        ResponseEntity<List<PaymentProcessingState>> response = orchestratorController.getTimedOutProcessingStates(timeoutMinutes);

        // Then
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(timedOutStates, response.getBody());
        verify(stateManagementService).getTimedOutProcessingStates(timeoutMinutes);
    }

    @Test
    void markAsFailed_ExistingMessage_ShouldReturnUpdatedState() {
        // Given
        String messageId = "test-message-id";
        String errorMessage = "Test error";
        Map<String, String> request = Map.of("errorMessage", errorMessage);
        when(stateManagementService.markAsFailed(messageId, errorMessage)).thenReturn(testState);

        // When
        ResponseEntity<PaymentProcessingState> response = orchestratorController.markAsFailed(messageId, request);

        // Then
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(testState, response.getBody());
        verify(stateManagementService).markAsFailed(messageId, errorMessage);
    }

    @Test
    void markAsFailed_NonExistingMessage_ShouldReturnNotFound() {
        // Given
        String messageId = "non-existing-message-id";
        String errorMessage = "Test error";
        Map<String, String> request = Map.of("errorMessage", errorMessage);
        when(stateManagementService.markAsFailed(messageId, errorMessage)).thenThrow(new IllegalArgumentException());

        // When
        ResponseEntity<PaymentProcessingState> response = orchestratorController.markAsFailed(messageId, request);

        // Then
        assertEquals(404, response.getStatusCodeValue());
        verify(stateManagementService).markAsFailed(messageId, errorMessage);
    }

    @Test
    void retryProcessing_ExistingMessage_ShouldReturnUpdatedState() {
        // Given
        String messageId = "test-message-id";
        when(stateManagementService.incrementRetryCount(messageId)).thenReturn(testState);

        // When
        ResponseEntity<PaymentProcessingState> response = orchestratorController.retryProcessing(messageId);

        // Then
        assertEquals(200, response.getStatusCodeValue());
        assertEquals(testState, response.getBody());
        verify(stateManagementService).incrementRetryCount(messageId);
    }

    @Test
    void retryProcessing_NonExistingMessage_ShouldReturnNotFound() {
        // Given
        String messageId = "non-existing-message-id";
        when(stateManagementService.incrementRetryCount(messageId)).thenThrow(new IllegalArgumentException());

        // When
        ResponseEntity<PaymentProcessingState> response = orchestratorController.retryProcessing(messageId);

        // Then
        assertEquals(404, response.getStatusCodeValue());
        verify(stateManagementService).incrementRetryCount(messageId);
    }

    @Test
    void getProcessingStats_ShouldReturnStats() {
        // When
        ResponseEntity<Map<String, Object>> response = orchestratorController.getProcessingStats();

        // Then
        assertEquals(200, response.getStatusCodeValue());
        Map<String, Object> stats = response.getBody();
        assertNotNull(stats);
        assertTrue(stats.containsKey("totalMessages"));
        assertTrue(stats.containsKey("completedMessages"));
        assertTrue(stats.containsKey("failedMessages"));
        assertTrue(stats.containsKey("pendingMessages"));
        assertTrue(stats.containsKey("averageProcessingTimeMs"));
    }

    @Test
    void cleanupOldStates_ShouldReturnSuccess() {
        // Given
        long retentionDays = 30;
        doNothing().when(stateManagementService).cleanupOldCompletedStates(retentionDays);

        // When
        ResponseEntity<Map<String, String>> response = orchestratorController.cleanupOldStates(retentionDays);

        // Then
        assertEquals(200, response.getStatusCodeValue());
        Map<String, String> body = response.getBody();
        assertNotNull(body);
        assertEquals("success", body.get("status"));
        assertTrue(body.get("message").contains("Cleanup completed"));
        verify(stateManagementService).cleanupOldCompletedStates(retentionDays);
    }
} 