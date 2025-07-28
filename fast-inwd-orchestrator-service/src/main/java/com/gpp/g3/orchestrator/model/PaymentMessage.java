package com.gpp.g3.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * Represents an incoming payment message from external clients via Kafka
 */
public class PaymentMessage {

    @JsonProperty("messageId")
    private String messageId;

    @JsonProperty("puid")
    private String puid;

    @JsonProperty("messageType")
    private String messageType;

    @JsonProperty("originalMessage")
    private String originalXmlPayload;

    @JsonProperty("enrichmentData")
    private EnrichmentData enrichmentData;

    @JsonProperty("validationResult")
    private JsonNode validationResult;

    @JsonProperty("receivedAt")
    private Instant receivedAt;

    @JsonProperty("metadata")
    private Map<String, Object> metadata;

    // Constructors
    public PaymentMessage() {
        this.receivedAt = Instant.now();
    }

    public PaymentMessage(String messageId, String puid, String messageType, String originalXmlPayload) {
        this();
        this.messageId = messageId;
        this.puid = puid;
        this.messageType = messageType;
        this.originalXmlPayload = originalXmlPayload;
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

    public String getOriginalXmlPayload() {
        return originalXmlPayload;
    }

    public void setOriginalXmlPayload(String originalXmlPayload) {
        this.originalXmlPayload = originalXmlPayload;
    }

    public EnrichmentData getEnrichmentData() {
        return enrichmentData;
    }

    public void setEnrichmentData(EnrichmentData enrichmentData) {
        this.enrichmentData = enrichmentData;
    }

    public JsonNode getValidationResult() {
        return validationResult;
    }

    public void setValidationResult(JsonNode validationResult) {
        this.validationResult = validationResult;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public void setReceivedAt(Instant receivedAt) {
        this.receivedAt = receivedAt;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    // Helper methods
    public WorkflowType determineWorkflowType() {
        return WorkflowType.fromMessageType(this.messageType);
    }

    public String getAccountSystem() {
        return enrichmentData != null && enrichmentData.getPhysicalAcctInfo() != null 
            ? enrichmentData.getPhysicalAcctInfo().getAcctSys()
            : null;
    }

    public String getAuthMethod() {
        return enrichmentData != null 
            ? enrichmentData.getAuthMethod()
            : null;
    }

    public boolean requiresVamMediation() {
        return determineWorkflowType().requiresVamMediation(getAccountSystem());
    }

    public boolean requiresLimitCheck() {
        return determineWorkflowType().requiresLimitCheck(getAuthMethod());
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        PaymentMessage that = (PaymentMessage) o;
        return Objects.equals(messageId, that.messageId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(messageId);
    }

    @Override
    public String toString() {
        return "PaymentMessage{" +
                "messageId='" + messageId + '\'' +
                ", puid='" + puid + '\'' +
                ", messageType='" + messageType + '\'' +
                ", receivedAt=" + receivedAt +
                '}';
    }

    /**
     * Nested class for enrichment data
     */
    public static class EnrichmentData {
        @JsonProperty("receivedAcctId")
        private String receivedAcctId;

        @JsonProperty("lookupStatusCode")
        private Integer lookupStatusCode;

        @JsonProperty("lookupStatusDesc")
        private String lookupStatusDesc;

        @JsonProperty("normalizedAcctId")
        private String normalizedAcctId;

        @JsonProperty("matchedAcctId")
        private String matchedAcctId;

        @JsonProperty("isPhysical")
        private String isPhysical;

        @JsonProperty("authMethod")
        private String authMethod;

        @JsonProperty("physicalAcctInfo")
        private PhysicalAcctInfo physicalAcctInfo;

        // Getters and Setters
        public String getReceivedAcctId() { return receivedAcctId; }
        public void setReceivedAcctId(String receivedAcctId) { this.receivedAcctId = receivedAcctId; }

        public Integer getLookupStatusCode() { return lookupStatusCode; }
        public void setLookupStatusCode(Integer lookupStatusCode) { this.lookupStatusCode = lookupStatusCode; }

        public String getLookupStatusDesc() { return lookupStatusDesc; }
        public void setLookupStatusDesc(String lookupStatusDesc) { this.lookupStatusDesc = lookupStatusDesc; }

        public String getNormalizedAcctId() { return normalizedAcctId; }
        public void setNormalizedAcctId(String normalizedAcctId) { this.normalizedAcctId = normalizedAcctId; }

        public String getMatchedAcctId() { return matchedAcctId; }
        public void setMatchedAcctId(String matchedAcctId) { this.matchedAcctId = matchedAcctId; }

        public String getIsPhysical() { return isPhysical; }
        public void setIsPhysical(String isPhysical) { this.isPhysical = isPhysical; }

        public String getAuthMethod() { return authMethod; }
        public void setAuthMethod(String authMethod) { this.authMethod = authMethod; }

        public PhysicalAcctInfo getPhysicalAcctInfo() { return physicalAcctInfo; }
        public void setPhysicalAcctInfo(PhysicalAcctInfo physicalAcctInfo) { this.physicalAcctInfo = physicalAcctInfo; }
    }

    /**
     * Nested class for physical account information
     */
    public static class PhysicalAcctInfo {
        @JsonProperty("acctSys")
        private String acctSys;

        @JsonProperty("acctGroup")
        private String acctGroup;

        @JsonProperty("country")
        private String country;

        @JsonProperty("currencyCode")
        private String currencyCode;

        // Getters and Setters
        public String getAcctSys() { return acctSys; }
        public void setAcctSys(String acctSys) { this.acctSys = acctSys; }

        public String getAcctGroup() { return acctGroup; }
        public void setAcctGroup(String acctGroup) { this.acctGroup = acctGroup; }

        public String getCountry() { return country; }
        public void setCountry(String country) { this.country = country; }

        public String getCurrencyCode() { return currencyCode; }
        public void setCurrencyCode(String currencyCode) { this.currencyCode = currencyCode; }
    }
} 