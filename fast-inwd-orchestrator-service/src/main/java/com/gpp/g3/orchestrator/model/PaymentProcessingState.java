package com.gpp.g3.orchestrator.model;

import com.google.cloud.spring.data.spanner.core.mapping.Column;
import com.google.cloud.spring.data.spanner.core.mapping.PrimaryKey;
import com.google.cloud.spring.data.spanner.core.mapping.Table;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * Spanner entity representing the processing state of a payment message
 * 
 * Tracks the complete lifecycle from initial processing through downstream service responses
 */
@Table(name = "payment_processing_state")
public class PaymentProcessingState {

    @PrimaryKey
    @Column(name = "message_id")
    private String messageId;

    @Column(name = "puid")
    private String puid;

    @Column(name = "message_type")
    private String messageType;

    @Column(name = "workflow_type")
    private WorkflowType workflowType;

    @Column(name = "overall_status")
    private ProcessingStatus overallStatus;

    @Column(name = "accounting_status")
    private ProcessingStatus accountingStatus;

    @Column(name = "vam_mediation_status")
    private ProcessingStatus vamMediationStatus;

    @Column(name = "limit_check_status")
    private ProcessingStatus limitCheckStatus;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "message_hash")
    private String messageHash;

    @Column(name = "retry_count")
    private Integer retryCount;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "enrichment_data")
    private String enrichmentDataJson;

    @Column(name = "response_data")
    private String responseDataJson;

    // Constructors
    public PaymentProcessingState() {
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
        this.overallStatus = ProcessingStatus.RECEIVED;
        this.retryCount = 0;
    }

    public PaymentProcessingState(String messageId, String puid, String messageType, WorkflowType workflowType) {
        this();
        this.messageId = messageId;
        this.puid = puid;
        this.messageType = messageType;
        this.workflowType = workflowType;
    }

    // Getters and Setters
    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    public String getPuid() {
        return puid;
    }

    public void setPuid(String puid) {
        this.puid = puid;
    }

    public String getMessageType() {
        return messageType;
    }

    public void setMessageType(String messageType) {
        this.messageType = messageType;
    }

    public WorkflowType getWorkflowType() {
        return workflowType;
    }

    public void setWorkflowType(WorkflowType workflowType) {
        this.workflowType = workflowType;
    }

    public ProcessingStatus getOverallStatus() {
        return overallStatus;
    }

    public void setOverallStatus(ProcessingStatus overallStatus) {
        this.overallStatus = overallStatus;
        this.updatedAt = Instant.now();
    }

    public ProcessingStatus getAccountingStatus() {
        return accountingStatus;
    }

    public void setAccountingStatus(ProcessingStatus accountingStatus) {
        this.accountingStatus = accountingStatus;
        this.updatedAt = Instant.now();
    }

    public ProcessingStatus getVamMediationStatus() {
        return vamMediationStatus;
    }

    public void setVamMediationStatus(ProcessingStatus vamMediationStatus) {
        this.vamMediationStatus = vamMediationStatus;
        this.updatedAt = Instant.now();
    }

    public ProcessingStatus getLimitCheckStatus() {
        return limitCheckStatus;
    }

    public void setLimitCheckStatus(ProcessingStatus limitCheckStatus) {
        this.limitCheckStatus = limitCheckStatus;
        this.updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
        this.updatedAt = Instant.now();
    }

    public String getMessageHash() {
        return messageHash;
    }

    public void setMessageHash(String messageHash) {
        this.messageHash = messageHash;
    }

    public Integer getRetryCount() {
        return retryCount;
    }

    public void setRetryCount(Integer retryCount) {
        this.retryCount = retryCount;
        this.updatedAt = Instant.now();
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
        this.updatedAt = Instant.now();
    }

    public String getEnrichmentDataJson() {
        return enrichmentDataJson;
    }

    public void setEnrichmentDataJson(String enrichmentDataJson) {
        this.enrichmentDataJson = enrichmentDataJson;
    }

    public String getResponseDataJson() {
        return responseDataJson;
    }

    public void setResponseDataJson(String responseDataJson) {
        this.responseDataJson = responseDataJson;
    }

    // Helper methods
    public void incrementRetryCount() {
        this.retryCount++;
        this.updatedAt = Instant.now();
    }

    public void markAsCompleted() {
        this.overallStatus = ProcessingStatus.COMPLETED;
        this.completedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markAsFailed(String errorMessage) {
        this.overallStatus = ProcessingStatus.FAILED;
        this.errorMessage = errorMessage;
        this.updatedAt = Instant.now();
    }

    public boolean isCompleted() {
        return ProcessingStatus.COMPLETED.equals(this.overallStatus);
    }

    public boolean isFailed() {
        return ProcessingStatus.FAILED.equals(this.overallStatus);
    }

    public boolean areAllDownstreamServicesCompleted() {
        return isStatusCompleted(accountingStatus) &&
               isStatusCompleted(vamMediationStatus) &&
               isStatusCompleted(limitCheckStatus);
    }

    private boolean isStatusCompleted(ProcessingStatus status) {
        return status == null || ProcessingStatus.COMPLETED.equals(status) || ProcessingStatus.NOT_REQUIRED.equals(status);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        PaymentProcessingState that = (PaymentProcessingState) o;
        return Objects.equals(messageId, that.messageId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(messageId);
    }

    @Override
    public String toString() {
        return "PaymentProcessingState{" +
                "messageId='" + messageId + '\'' +
                ", puid='" + puid + '\'' +
                ", messageType='" + messageType + '\'' +
                ", workflowType=" + workflowType +
                ", overallStatus=" + overallStatus +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
} 