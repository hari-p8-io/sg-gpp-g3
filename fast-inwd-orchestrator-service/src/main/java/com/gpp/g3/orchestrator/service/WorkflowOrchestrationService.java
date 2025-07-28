package com.gpp.g3.orchestrator.service;

import com.gpp.g3.orchestrator.config.WorkflowConfiguration;
import com.gpp.g3.orchestrator.model.JsonMessage;
import com.gpp.g3.orchestrator.model.PaymentMessage;
import com.gpp.g3.orchestrator.model.PaymentProcessingState;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import com.gpp.g3.orchestrator.model.WorkflowType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Service for orchestrating configurable workflows for CTI and DDI processing
 */
@Service
public class WorkflowOrchestrationService {

    private static final Logger logger = LoggerFactory.getLogger(WorkflowOrchestrationService.class);

    @Autowired
    private StateManagementService stateManagementService;

    @Autowired
    private MessageTransformationService messageTransformationService;

    @Autowired
    private KafkaPublishingService kafkaPublishingService;

    @Autowired
    private WorkflowConfiguration workflowConfiguration;

    /**
     * Process incoming payment message through the appropriate workflow
     */
    public void processPaymentMessage(PaymentMessage paymentMessage) {
        logger.info("Processing payment message: messageId={}, messageType={}", 
            paymentMessage.getMessageId(), paymentMessage.getMessageType());

        try {
            // Step 1: Check for duplicates
            Optional<PaymentProcessingState> duplicateState = stateManagementService.checkForDuplicate(paymentMessage);
            if (duplicateState.isPresent()) {
                logger.warn("Duplicate message detected, skipping processing: messageId={}", paymentMessage.getMessageId());
                return;
            }

            // Step 2: Create initial processing state
            PaymentProcessingState processingState = stateManagementService.createInitialState(paymentMessage);

            // Step 3: Determine workflow type
            WorkflowType workflowType = paymentMessage.determineWorkflowType();
            logger.info("Determined workflow type: {} for message: {}", workflowType, paymentMessage.getMessageId());

            // Step 4: Execute workflow steps
            executeWorkflow(workflowType, paymentMessage, processingState);

        } catch (Exception e) {
            logger.error("Error processing payment message: messageId={}", paymentMessage.getMessageId(), e);
            stateManagementService.markAsFailed(paymentMessage.getMessageId(), e.getMessage());
            throw e;
        }
    }

    /**
     * Execute the appropriate workflow based on type
     */
    private void executeWorkflow(WorkflowType workflowType, PaymentMessage paymentMessage, PaymentProcessingState processingState) {
        switch (workflowType) {
            case CTI -> executeCtiWorkflow(paymentMessage, processingState);
            case DDI -> executeDdiWorkflow(paymentMessage, processingState);
            default -> throw new IllegalArgumentException("Unsupported workflow type: " + workflowType);
        }
    }

    /**
     * Execute Credit Transfer Inward (CTI) workflow
     */
    private void executeCtiWorkflow(PaymentMessage paymentMessage, PaymentProcessingState processingState) {
        logger.info("Executing CTI workflow for message: {}", paymentMessage.getMessageId());

        try {
            // Get CTI workflow configuration
            Map<String, Object> ctiConfig = workflowConfiguration.getCtiWorkflow();
            List<Map<String, Object>> steps = (List<Map<String, Object>>) ctiConfig.get("steps");

            // Execute each workflow step, passing transformed message between steps
            JsonMessage transformedMessage = null;
            for (Map<String, Object> step : steps) {
                transformedMessage = executeWorkflowStep(step, paymentMessage, processingState, transformedMessage);
            }

        } catch (Exception e) {
            logger.error("Error executing CTI workflow for message: {}", paymentMessage.getMessageId(), e);
            throw e;
        }
    }

    /**
     * Execute Direct Debit Inward (DDI) workflow
     */
    private void executeDdiWorkflow(PaymentMessage paymentMessage, PaymentProcessingState processingState) {
        logger.info("Executing DDI workflow for message: {}", paymentMessage.getMessageId());

        try {
            // Get DDI workflow configuration
            Map<String, Object> ddiConfig = workflowConfiguration.getDdiWorkflow();
            List<Map<String, Object>> steps = (List<Map<String, Object>>) ddiConfig.get("steps");

            // Execute each workflow step, passing transformed message between steps
            JsonMessage transformedMessage = null;
            for (Map<String, Object> step : steps) {
                transformedMessage = executeWorkflowStep(step, paymentMessage, processingState, transformedMessage);
            }

        } catch (Exception e) {
            logger.error("Error executing DDI workflow for message: {}", paymentMessage.getMessageId(), e);
            throw e;
        }
    }

    /**
     * Execute individual workflow step
     */
    private JsonMessage executeWorkflowStep(Map<String, Object> step, PaymentMessage paymentMessage, PaymentProcessingState processingState, JsonMessage transformedMessage) {
        String stepName = (String) step.get("name");
        String serviceName = (String) step.get("service");

        logger.info("Executing workflow step: {} using service: {} for message: {}", 
            stepName, serviceName, paymentMessage.getMessageId());

        try {
            return switch (stepName) {
                case "deduplication-check" -> {
                    executeDeduplicationCheck(paymentMessage, processingState);
                    yield transformedMessage;
                }
                case "pacs-to-json-transform" -> executeMessageTransformation(paymentMessage, processingState);
                case "publish-to-downstream" -> {
                    executeDownstreamPublishing(step, paymentMessage, processingState, transformedMessage);
                    yield transformedMessage;
                }
                default -> {
                    logger.warn("Unknown workflow step: {}", stepName);
                    yield transformedMessage;
                }
            };

        } catch (Exception e) {
            logger.error("Error executing workflow step: {} for message: {}", stepName, paymentMessage.getMessageId(), e);
            throw e;
        }
    }

    /**
     * Execute deduplication check step
     */
    private void executeDeduplicationCheck(PaymentMessage paymentMessage, PaymentProcessingState processingState) {
        logger.info("Executing deduplication check for message: {}", paymentMessage.getMessageId());
        
        // Deduplication was already done in processPaymentMessage, but we update status here
        stateManagementService.updateAccountingStatus(paymentMessage.getMessageId(), ProcessingStatus.PROCESSING);
    }

    /**
     * Execute message transformation step
     */
    private JsonMessage executeMessageTransformation(PaymentMessage paymentMessage, PaymentProcessingState processingState) {
        logger.info("Executing message transformation for message: {}", paymentMessage.getMessageId());

        try {
            // Transform message to JSON
            JsonMessage jsonMessage = messageTransformationService.transformToJson(paymentMessage);
            
            // Store transformed message in processing state (optional)
            // processingState.setResponseDataJson(serializeJsonMessage(jsonMessage));
            
            logger.info("Message transformation completed for message: {}", paymentMessage.getMessageId());
            return jsonMessage;

        } catch (Exception e) {
            logger.error("Message transformation failed for message: {}", paymentMessage.getMessageId(), e);
            throw e;
        }
    }

    /**
     * Execute downstream publishing step
     */
    private void executeDownstreamPublishing(Map<String, Object> step, PaymentMessage paymentMessage, PaymentProcessingState processingState, JsonMessage jsonMessage) {
        logger.info("Executing downstream publishing for message: {}", paymentMessage.getMessageId());

        try {
            // Use the already transformed JSON message

            // Get target services from step configuration
            List<String> targets = (List<String>) step.get("targets");
            if (targets == null) {
                // Default targets based on message requirements
                targets = determineDefaultTargets(paymentMessage);
            }

            // Publish to each target service
            for (String target : targets) {
                publishToTargetService(target, jsonMessage, paymentMessage);
            }

            logger.info("Downstream publishing completed for message: {}", paymentMessage.getMessageId());

        } catch (Exception e) {
            logger.error("Downstream publishing failed for message: {}", paymentMessage.getMessageId(), e);
            throw e;
        }
    }

    /**
     * Determine default target services based on message requirements
     */
    private List<String> determineDefaultTargets(PaymentMessage paymentMessage) {
        List<String> targets = List.of("accounting"); // Accounting is always required

        // Add VAM mediation if required
        if (paymentMessage.requiresVamMediation()) {
            targets = List.of("accounting", "vammediation");
        }

        // Add limit check if required
        if (paymentMessage.requiresLimitCheck()) {
            if (paymentMessage.requiresVamMediation()) {
                targets = List.of("accounting", "vammediation", "limitcheck");
            } else {
                targets = List.of("accounting", "limitcheck");
            }
        }

        return targets;
    }

    /**
     * Publish message to a specific target service
     */
    private void publishToTargetService(String target, JsonMessage jsonMessage, PaymentMessage originalMessage) {
        logger.info("Publishing to target service: {} for message: {}", target, jsonMessage.getMessageId());

        try {
            switch (target) {
                case "accounting" -> {
                    kafkaPublishingService.publishToAccountingService(jsonMessage);
                    stateManagementService.updateAccountingStatus(originalMessage.getMessageId(), ProcessingStatus.PROCESSING);
                }
                case "vammediation" -> {
                    kafkaPublishingService.publishToVamMediationService(jsonMessage);
                    stateManagementService.updateVamMediationStatus(originalMessage.getMessageId(), ProcessingStatus.PROCESSING);
                }
                case "limitcheck" -> {
                    kafkaPublishingService.publishToLimitCheckService(jsonMessage);
                    stateManagementService.updateLimitCheckStatus(originalMessage.getMessageId(), ProcessingStatus.PROCESSING);
                }
                default -> logger.warn("Unknown target service: {}", target);
            }

        } catch (Exception e) {
            logger.error("Failed to publish to target service: {} for message: {}", target, jsonMessage.getMessageId(), e);
            throw e;
        }
    }

    /**
     * Handle responses from downstream services
     */
    public void handleDownstreamResponse(String serviceName, String messageId, ProcessingStatus status, String responseData) {
        logger.info("Handling downstream response from {}: messageId={}, status={}", serviceName, messageId, status);

        try {
            // Update specific service status
            PaymentProcessingState updatedState = switch (serviceName) {
                case "accounting" -> stateManagementService.updateAccountingStatus(messageId, status);
                case "vammediation" -> stateManagementService.updateVamMediationStatus(messageId, status);
                case "limitcheck" -> stateManagementService.updateLimitCheckStatus(messageId, status);
                default -> throw new IllegalArgumentException("Unknown service name: " + serviceName);
            };

            // Check if all services are completed
            if (updatedState.areAllDownstreamServicesCompleted()) {
                logger.info("All downstream services completed for message: {}", messageId);
                // Additional completion logic can be added here
            }

        } catch (Exception e) {
            logger.error("Error handling downstream response from {}: messageId={}", serviceName, messageId, e);
            stateManagementService.markAsFailed(messageId, "Error handling response from " + serviceName + ": " + e.getMessage());
        }
    }
} 