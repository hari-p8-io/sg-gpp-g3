package com.gpp.g3.orchestrator.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;

/**
 * Configuration for CTI and DDI workflows
 */
@Configuration
@ConfigurationProperties(prefix = "app.workflows")
public class WorkflowConfiguration {

    private Map<String, Object> cti;
    private Map<String, Object> ddi;

    /**
     * Get CTI (Credit Transfer Inward) workflow configuration
     */
    public Map<String, Object> getCtiWorkflow() {
        if (cti == null) {
            return getDefaultCtiWorkflow();
        }
        return cti;
    }

    /**
     * Get DDI (Direct Debit Inward) workflow configuration
     */
    public Map<String, Object> getDdiWorkflow() {
        if (ddi == null) {
            return getDefaultDdiWorkflow();
        }
        return ddi;
    }

    /**
     * Default CTI workflow configuration
     */
    private Map<String, Object> getDefaultCtiWorkflow() {
        return Map.of(
            "name", "credit-transfer-inward",
            "description", "Workflow for processing credit transfer inward messages",
            "steps", List.of(
                Map.of(
                    "name", "deduplication-check",
                    "service", "DeduplicationService",
                    "description", "Check for duplicate messages",
                    "required", true
                ),
                Map.of(
                    "name", "pacs-to-json-transform",
                    "service", "MessageTransformationService",
                    "description", "Transform PACS/CAMT XML to JSON",
                    "required", true
                ),
                Map.of(
                    "name", "publish-to-downstream",
                    "service", "JsonPublishingService",
                    "description", "Publish JSON to downstream services",
                    "required", true,
                    "targets", List.of("accounting", "vammediation", "limitcheck")
                )
            ),
            "timeoutMinutes", 30,
            "maxRetries", 3
        );
    }

    /**
     * Default DDI workflow configuration
     */
    private Map<String, Object> getDefaultDdiWorkflow() {
        return Map.of(
            "name", "direct-debit-inward",
            "description", "Workflow for processing direct debit inward messages",
            "steps", List.of(
                Map.of(
                    "name", "deduplication-check",
                    "service", "DeduplicationService",
                    "description", "Check for duplicate messages",
                    "required", true
                ),
                Map.of(
                    "name", "pacs-to-json-transform",
                    "service", "MessageTransformationService",
                    "description", "Transform PACS XML to JSON",
                    "required", true
                ),
                Map.of(
                    "name", "publish-to-downstream",
                    "service", "JsonPublishingService",
                    "description", "Publish JSON to downstream services",
                    "required", true,
                    "targets", List.of("accounting", "vammediation", "limitcheck")
                )
            ),
            "timeoutMinutes", 45,
            "maxRetries", 3
        );
    }

    // Getters and Setters
    public Map<String, Object> getCti() {
        return cti;
    }

    public void setCti(Map<String, Object> cti) {
        this.cti = cti;
    }

    public Map<String, Object> getDdi() {
        return ddi;
    }

    public void setDdi(Map<String, Object> ddi) {
        this.ddi = ddi;
    }
} 