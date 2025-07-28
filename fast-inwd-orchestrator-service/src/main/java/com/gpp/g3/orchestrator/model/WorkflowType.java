package com.gpp.g3.orchestrator.model;

/**
 * Enum representing the different workflow types supported by the orchestrator
 */
public enum WorkflowType {
    /**
     * Credit Transfer Inward - Processing of incoming credit transfers
     */
    CTI("credit-transfer-inward"),
    
    /**
     * Direct Debit Inward - Processing of incoming direct debit instructions
     */
    DDI("direct-debit-inward");

    private final String configKey;

    WorkflowType(String configKey) {
        this.configKey = configKey;
    }

    public String getConfigKey() {
        return configKey;
    }

    /**
     * Determine workflow type from message type
     */
    public static WorkflowType fromMessageType(String messageType) {
        return switch (messageType.toUpperCase()) {
            case "PACS008", "PACS007" -> CTI;  // Credit transfers
            case "PACS003" -> DDI;             // Direct debit
            case "CAMT053", "CAMT054" -> CTI;  // Account statements (treated as CTI)
            default -> throw new IllegalArgumentException("Unsupported message type: " + messageType);
        };
    }

    /**
     * Check if this workflow requires VAM mediation based on account system
     */
    public boolean requiresVamMediation(String accountSystem) {
        return "VAM".equalsIgnoreCase(accountSystem);
    }

    /**
     * Check if this workflow requires limit checking based on auth method
     */
    public boolean requiresLimitCheck(String authMethod) {
        return "GROUPLIMIT".equalsIgnoreCase(authMethod);
    }

    @Override
    public String toString() {
        return configKey;
    }
} 