package com.gpp.g3.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * Represents a JSON message sent to downstream services (accounting, VAM mediation, limit check)
 */
public class JsonMessage {

    @JsonProperty("messageId")
    private String messageId;

    @JsonProperty("puid")
    private String puid;

    @JsonProperty("messageType")
    private String messageType;

    @JsonProperty("processedAt")
    private Instant processedAt;

    @JsonProperty("workflow")
    private String workflow;

    @JsonProperty("paymentData")
    private PaymentData paymentData;

    @JsonProperty("enrichmentData")
    private EnrichmentData enrichmentData;

    @JsonProperty("metadata")
    private Map<String, Object> metadata;

    // Constructors
    public JsonMessage() {
        this.processedAt = Instant.now();
    }

    public JsonMessage(String messageId, String puid, String messageType, String workflow) {
        this();
        this.messageId = messageId;
        this.puid = puid;
        this.messageType = messageType;
        this.workflow = workflow;
    }

    // Getters and Setters
    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }

    public String getPuid() { return puid; }
    public void setPuid(String puid) { this.puid = puid; }

    public String getMessageType() { return messageType; }
    public void setMessageType(String messageType) { this.messageType = messageType; }

    public Instant getProcessedAt() { return processedAt; }
    public void setProcessedAt(Instant processedAt) { this.processedAt = processedAt; }

    public String getWorkflow() { return workflow; }
    public void setWorkflow(String workflow) { this.workflow = workflow; }

    public PaymentData getPaymentData() { return paymentData; }
    public void setPaymentData(PaymentData paymentData) { this.paymentData = paymentData; }

    public EnrichmentData getEnrichmentData() { return enrichmentData; }
    public void setEnrichmentData(EnrichmentData enrichmentData) { this.enrichmentData = enrichmentData; }

    public Map<String, Object> getMetadata() { return metadata; }
    public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }

    // Nested classes for payment and enrichment data
    public static class PaymentData {
        @JsonProperty("amount")
        private String amount;
        
        @JsonProperty("currency")
        private String currency;
        
        @JsonProperty("debtorAccount")
        private String debtorAccount;
        
        @JsonProperty("creditorAccount")
        private String creditorAccount;

        @JsonProperty("endToEndId")
        private String endToEndId;

        @JsonProperty("instructionId")
        private String instructionId;

        @JsonProperty("remittanceInfo")
        private String remittanceInfo;

        // Getters and setters
        public String getAmount() { return amount; }
        public void setAmount(String amount) { this.amount = amount; }
        public String getCurrency() { return currency; }
        public void setCurrency(String currency) { this.currency = currency; }
        public String getDebtorAccount() { return debtorAccount; }
        public void setDebtorAccount(String debtorAccount) { this.debtorAccount = debtorAccount; }
        public String getCreditorAccount() { return creditorAccount; }
        public void setCreditorAccount(String creditorAccount) { this.creditorAccount = creditorAccount; }
        public String getEndToEndId() { return endToEndId; }
        public void setEndToEndId(String endToEndId) { this.endToEndId = endToEndId; }
        public String getInstructionId() { return instructionId; }
        public void setInstructionId(String instructionId) { this.instructionId = instructionId; }
        public String getRemittanceInfo() { return remittanceInfo; }
        public void setRemittanceInfo(String remittanceInfo) { this.remittanceInfo = remittanceInfo; }
    }

    public static class EnrichmentData {
        @JsonProperty("accountSystem")
        private String accountSystem;
        
        @JsonProperty("authMethod")
        private String authMethod;

        // Getters and setters
        public String getAccountSystem() { return accountSystem; }
        public void setAccountSystem(String accountSystem) { this.accountSystem = accountSystem; }
        public String getAuthMethod() { return authMethod; }
        public void setAuthMethod(String authMethod) { this.authMethod = authMethod; }
    }
} 