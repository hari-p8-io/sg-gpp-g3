package com.gpp.g3.orchestrator.service;

import com.gpp.g3.orchestrator.model.PaymentMessage;
import com.gpp.g3.orchestrator.model.PaymentProcessingState;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import com.gpp.g3.orchestrator.model.WorkflowType;
import com.gpp.g3.orchestrator.repository.PaymentProcessingStateRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/**
 * Service for managing payment processing state in Cloud Spanner
 * 
 * Handles state tracking throughout the entire payment processing lifecycle
 */
@Service
@Transactional
public class StateManagementService {

    private static final Logger logger = LoggerFactory.getLogger(StateManagementService.class);

    @Autowired
    private PaymentProcessingStateRepository stateRepository;

    /**
     * Create initial processing state for a new payment message
     */
    public PaymentProcessingState createInitialState(PaymentMessage message) {
        logger.info("Creating initial processing state for message: {}", message.getMessageId());

        WorkflowType workflowType = message.determineWorkflowType();
        
        PaymentProcessingState state = new PaymentProcessingState(
            message.getMessageId(),
            message.getPuid(),
            message.getMessageType(),
            workflowType
        );

        // Set message hash for deduplication
        state.setMessageHash(generateMessageHash(message));

        // Set enrichment data JSON
        if (message.getEnrichmentData() != null) {
            state.setEnrichmentDataJson(serializeEnrichmentData(message.getEnrichmentData()));
        }

        // Initialize downstream service statuses based on workflow requirements
        initializeDownstreamStatuses(state, message);

        PaymentProcessingState savedState = stateRepository.save(state);
        logger.info("Initial processing state created: messageId={}, workflowType={}", 
            savedState.getMessageId(), savedState.getWorkflowType());

        return savedState;
    }

    /**
     * Check for duplicate messages using message hash
     */
    public Optional<PaymentProcessingState> checkForDuplicate(PaymentMessage message) {
        String messageHash = generateMessageHash(message);
        Optional<PaymentProcessingState> existingState = stateRepository.findByMessageHash(messageHash);
        
        if (existingState.isPresent()) {
            logger.warn("Duplicate message detected: messageId={}, originalMessageId={}", 
                message.getMessageId(), existingState.get().getMessageId());
        }
        
        return existingState;
    }

    /**
     * Update accounting service status
     */
    public PaymentProcessingState updateAccountingStatus(String messageId, ProcessingStatus status) {
        return updateDownstreamServiceStatus(messageId, "accounting", status);
    }

    /**
     * Update VAM mediation service status
     */
    public PaymentProcessingState updateVamMediationStatus(String messageId, ProcessingStatus status) {
        return updateDownstreamServiceStatus(messageId, "vam_mediation", status);
    }

    /**
     * Update limit check service status
     */
    public PaymentProcessingState updateLimitCheckStatus(String messageId, ProcessingStatus status) {
        return updateDownstreamServiceStatus(messageId, "limit_check", status);
    }

    /**
     * Update a specific downstream service status
     */
    private PaymentProcessingState updateDownstreamServiceStatus(String messageId, String serviceName, ProcessingStatus status) {
        logger.info("Updating {} status for message: {} to {}", serviceName, messageId, status);

        Optional<PaymentProcessingState> optionalState = stateRepository.findById(messageId);
        if (optionalState.isEmpty()) {
            logger.error("Processing state not found for messageId: {}", messageId);
            throw new IllegalArgumentException("Processing state not found for messageId: " + messageId);
        }

        PaymentProcessingState state = optionalState.get();

        // Update the specific service status
        switch (serviceName) {
            case "accounting" -> state.setAccountingStatus(status);
            case "vam_mediation" -> state.setVamMediationStatus(status);
            case "limit_check" -> state.setLimitCheckStatus(status);
            default -> throw new IllegalArgumentException("Unknown service name: " + serviceName);
        }

        // Check if all downstream services are completed
        if (state.areAllDownstreamServicesCompleted()) {
            state.markAsCompleted();
            logger.info("All downstream services completed for message: {}", messageId);
        }

        PaymentProcessingState savedState = stateRepository.save(state);
        logger.info("Updated {} status for message: {} to {}", serviceName, messageId, status);

        return savedState;
    }

    /**
     * Mark processing as failed with error message
     */
    public PaymentProcessingState markAsFailed(String messageId, String errorMessage) {
        logger.error("Marking processing as failed for message: {} - {}", messageId, errorMessage);

        Optional<PaymentProcessingState> optionalState = stateRepository.findById(messageId);
        if (optionalState.isEmpty()) {
            logger.error("Processing state not found for messageId: {}", messageId);
            throw new IllegalArgumentException("Processing state not found for messageId: " + messageId);
        }

        PaymentProcessingState state = optionalState.get();
        state.markAsFailed(errorMessage);

        return stateRepository.save(state);
    }

    /**
     * Increment retry count for a message
     */
    public PaymentProcessingState incrementRetryCount(String messageId) {
        logger.info("Incrementing retry count for message: {}", messageId);

        Optional<PaymentProcessingState> optionalState = stateRepository.findById(messageId);
        if (optionalState.isEmpty()) {
            logger.error("Processing state not found for messageId: {}", messageId);
            throw new IllegalArgumentException("Processing state not found for messageId: " + messageId);
        }

        PaymentProcessingState state = optionalState.get();
        state.incrementRetryCount();

        return stateRepository.save(state);
    }

    /**
     * Get processing state by message ID
     */
    public Optional<PaymentProcessingState> getProcessingState(String messageId) {
        return stateRepository.findById(messageId);
    }

    /**
     * Find all processing states for a PUID
     */
    public List<PaymentProcessingState> getProcessingStatesByPuid(String puid) {
        return stateRepository.findByPuid(puid);
    }

    /**
     * Find pending processing states
     */
    public List<PaymentProcessingState> getPendingProcessingStates() {
        return stateRepository.findPendingProcessingStates();
    }

    /**
     * Find timed-out processing states
     */
    public List<PaymentProcessingState> getTimedOutProcessingStates(long timeoutMinutes) {
        Instant timeoutThreshold = Instant.now().minus(timeoutMinutes, ChronoUnit.MINUTES);
        return stateRepository.findTimedOutProcessingStates(timeoutThreshold);
    }

    /**
     * Cleanup old completed processing states
     */
    public void cleanupOldCompletedStates(long retentionDays) {
        Instant cutoffTime = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        stateRepository.deleteOldCompletedStates(cutoffTime);
        logger.info("Cleaned up old completed states older than {} days", retentionDays);
    }

    /**
     * Initialize downstream service statuses based on workflow requirements
     */
    private void initializeDownstreamStatuses(PaymentProcessingState state, PaymentMessage message) {
        // Accounting is always required
        state.setAccountingStatus(ProcessingStatus.PENDING);

        // VAM mediation only required for VAM account system
        if (message.requiresVamMediation()) {
            state.setVamMediationStatus(ProcessingStatus.PENDING);
        } else {
            state.setVamMediationStatus(ProcessingStatus.NOT_REQUIRED);
        }

        // Limit check only required for GROUPLIMIT auth method
        if (message.requiresLimitCheck()) {
            state.setLimitCheckStatus(ProcessingStatus.PENDING);
        } else {
            state.setLimitCheckStatus(ProcessingStatus.NOT_REQUIRED);
        }
    }

    /**
     * Generate message hash for deduplication
     */
    private String generateMessageHash(PaymentMessage message) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String content = message.getPuid() + "|" + message.getMessageType() + "|" + 
                           (message.getOriginalXmlPayload() != null ? message.getOriginalXmlPayload() : "");
            byte[] hash = digest.digest(content.getBytes());
            
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            logger.error("Error generating message hash", e);
            throw new RuntimeException("Error generating message hash", e);
        }
    }

    /**
     * Serialize enrichment data to JSON string
     */
    private String serializeEnrichmentData(PaymentMessage.EnrichmentData enrichmentData) {
        // TODO: Implement JSON serialization using Jackson ObjectMapper
        // This is a placeholder implementation
        return "{}";
    }
} 