package com.gpp.g3.orchestrator.controller;

import com.gpp.g3.orchestrator.model.PaymentProcessingState;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import com.gpp.g3.orchestrator.service.StateManagementService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * REST controller for orchestrator service monitoring and management
 */
@RestController
@RequestMapping("/api/v1/orchestrator")
@CrossOrigin(origins = "*")
public class OrchestratorController {

    private static final Logger logger = LoggerFactory.getLogger(OrchestratorController.class);

    @Autowired
    private StateManagementService stateManagementService;

    /**
     * Health check endpoint
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> health = Map.of(
            "service", "fast-inwd-orchestrator-service",
            "status", "healthy",
            "timestamp", System.currentTimeMillis(),
            "version", "1.0.0"
        );
        return ResponseEntity.ok(health);
    }

    /**
     * Get processing state by message ID
     */
    @GetMapping("/state/{messageId}")
    public ResponseEntity<PaymentProcessingState> getProcessingState(@PathVariable String messageId) {
        logger.info("Getting processing state for messageId: {}", messageId);
        
        Optional<PaymentProcessingState> state = stateManagementService.getProcessingState(messageId);
        
        if (state.isPresent()) {
            return ResponseEntity.ok(state.get());
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Get all processing states for a PUID
     */
    @GetMapping("/state/puid/{puid}")
    public ResponseEntity<List<PaymentProcessingState>> getProcessingStatesByPuid(@PathVariable String puid) {
        logger.info("Getting processing states for puid: {}", puid);
        
        List<PaymentProcessingState> states = stateManagementService.getProcessingStatesByPuid(puid);
        return ResponseEntity.ok(states);
    }

    /**
     * Get pending processing states
     */
    @GetMapping("/state/pending")
    public ResponseEntity<List<PaymentProcessingState>> getPendingProcessingStates() {
        logger.info("Getting pending processing states");
        
        List<PaymentProcessingState> states = stateManagementService.getPendingProcessingStates();
        return ResponseEntity.ok(states);
    }

    /**
     * Get timed-out processing states
     */
    @GetMapping("/state/timeout")
    public ResponseEntity<List<PaymentProcessingState>> getTimedOutProcessingStates(
            @RequestParam(defaultValue = "30") long timeoutMinutes) {
        logger.info("Getting timed-out processing states with timeout: {} minutes", timeoutMinutes);
        
        List<PaymentProcessingState> states = stateManagementService.getTimedOutProcessingStates(timeoutMinutes);
        return ResponseEntity.ok(states);
    }

    /**
     * Manually mark a message as failed
     */
    @PostMapping("/state/{messageId}/fail")
    public ResponseEntity<PaymentProcessingState> markAsFailed(@PathVariable String messageId, 
                                                             @RequestBody Map<String, String> request) {
        logger.info("Manually marking messageId as failed: {}", messageId);
        
        String errorMessage = request.getOrDefault("errorMessage", "Manually marked as failed");
        
        try {
            PaymentProcessingState updatedState = stateManagementService.markAsFailed(messageId, errorMessage);
            return ResponseEntity.ok(updatedState);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Retry processing for a failed message
     */
    @PostMapping("/state/{messageId}/retry")
    public ResponseEntity<PaymentProcessingState> retryProcessing(@PathVariable String messageId) {
        logger.info("Retrying processing for messageId: {}", messageId);
        
        try {
            PaymentProcessingState updatedState = stateManagementService.incrementRetryCount(messageId);
            return ResponseEntity.ok(updatedState);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Get processing statistics
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getProcessingStats() {
        logger.info("Getting processing statistics");
        
        // This would typically aggregate data from the database
        // For now, return a basic structure
        Map<String, Object> stats = Map.of(
            "totalMessages", 0,
            "completedMessages", 0,
            "failedMessages", 0,
            "pendingMessages", 0,
            "averageProcessingTimeMs", 0
        );
        
        return ResponseEntity.ok(stats);
    }

    /**
     * Cleanup old completed states
     */
    @PostMapping("/cleanup")
    public ResponseEntity<Map<String, String>> cleanupOldStates(
            @RequestParam(defaultValue = "30") long retentionDays) {
        logger.info("Cleaning up old completed states with retention: {} days", retentionDays);
        
        try {
            stateManagementService.cleanupOldCompletedStates(retentionDays);
            
            Map<String, String> response = Map.of(
                "status", "success",
                "message", "Cleanup completed for states older than " + retentionDays + " days"
            );
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error during cleanup", e);
            
            Map<String, String> response = Map.of(
                "status", "error",
                "message", "Cleanup failed: " + e.getMessage()
            );
            
            return ResponseEntity.internalServerError().body(response);
        }
    }
} 