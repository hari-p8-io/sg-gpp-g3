package com.gpp.g3.orchestrator.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import com.gpp.g3.orchestrator.model.JsonMessage;
import com.gpp.g3.orchestrator.model.PaymentMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * Service for transforming PACS/CAMT XML messages to JSON format for downstream services
 */
@Service
public class MessageTransformationService {

    private static final Logger logger = LoggerFactory.getLogger(MessageTransformationService.class);

    @Autowired
    private ObjectMapper objectMapper;

    private final XmlMapper xmlMapper;

    public MessageTransformationService() {
        this.xmlMapper = new XmlMapper();
    }

    /**
     * Transform a PaymentMessage to JsonMessage for downstream services
     */
    public JsonMessage transformToJson(PaymentMessage paymentMessage) {
        logger.info("Transforming message to JSON: messageId={}, messageType={}", 
            paymentMessage.getMessageId(), paymentMessage.getMessageType());

        try {
            // Determine workflow type, handling unsupported message types gracefully
            String workflowType;
            try {
                workflowType = paymentMessage.determineWorkflowType().getConfigKey();
            } catch (IllegalArgumentException e) {
                logger.warn("Unsupported message type: {}, using default workflow", paymentMessage.getMessageType());
                workflowType = "unknown";
            }
            
            JsonMessage jsonMessage = new JsonMessage(
                paymentMessage.getMessageId(),
                paymentMessage.getPuid(),
                paymentMessage.getMessageType(),
                workflowType
            );

            // Extract payment data from XML
            JsonMessage.PaymentData paymentData = extractPaymentData(paymentMessage);
            jsonMessage.setPaymentData(paymentData);

            // Transform enrichment data
            JsonMessage.EnrichmentData enrichmentData = transformEnrichmentData(paymentMessage);
            jsonMessage.setEnrichmentData(enrichmentData);

            // Add metadata
            Map<String, Object> metadata = createMetadata(paymentMessage);
            jsonMessage.setMetadata(metadata);

            logger.info("Successfully transformed message to JSON: messageId={}", paymentMessage.getMessageId());
            return jsonMessage;

        } catch (Exception e) {
            logger.error("Error transforming message to JSON: messageId={}", paymentMessage.getMessageId(), e);
            throw new RuntimeException("Failed to transform message to JSON", e);
        }
    }

    /**
     * Extract payment data from XML payload
     */
    private JsonMessage.PaymentData extractPaymentData(PaymentMessage paymentMessage) {
        JsonMessage.PaymentData paymentData = new JsonMessage.PaymentData();

        try {
            String xmlPayload = paymentMessage.getOriginalXmlPayload();
            if (xmlPayload == null || xmlPayload.trim().isEmpty()) {
                logger.warn("Empty XML payload for message: {}", paymentMessage.getMessageId());
                return paymentData;
            }

            // Parse XML to JSON node
            JsonNode xmlJsonNode = xmlMapper.readTree(xmlPayload);

            // Extract common payment fields based on message type
            switch (paymentMessage.getMessageType().toUpperCase()) {
                case "PACS008" -> extractPacs008Data(xmlJsonNode, paymentData);
                case "PACS007" -> extractPacs007Data(xmlJsonNode, paymentData);
                case "PACS003" -> extractPacs003Data(xmlJsonNode, paymentData);
                case "CAMT053" -> extractCamt053Data(xmlJsonNode, paymentData);
                case "CAMT054" -> extractCamt054Data(xmlJsonNode, paymentData);
                default -> logger.warn("Unsupported message type for extraction: {}", paymentMessage.getMessageType());
            }

        } catch (Exception e) {
            logger.error("Error extracting payment data from XML: messageId={}", paymentMessage.getMessageId(), e);
        }

        return paymentData;
    }

    /**
     * Extract data from PACS008 (Credit Transfer) message
     */
    private void extractPacs008Data(JsonNode xmlNode, JsonMessage.PaymentData paymentData) {
        try {
            // Navigate through PACS008 structure
            JsonNode document = xmlNode.path("Document");
            JsonNode fiToFiCustomerCreditTransfer = document.path("FIToFiCustomerCreditTransfer");
            JsonNode creditTransferTransactionInformation = fiToFiCustomerCreditTransfer.path("CreditTransferTransactionInformation");

            // Extract amount and currency
            JsonNode instructedAmount = creditTransferTransactionInformation.path("Amount").path("InstructedAmount");
            if (!instructedAmount.isMissingNode()) {
                paymentData.setAmount(instructedAmount.path("value").asText());
                paymentData.setCurrency(instructedAmount.path("Ccy").asText());
            }

            // Extract account information
            JsonNode debtorAccount = creditTransferTransactionInformation.path("DebtorAccount").path("Identification").path("Other").path("Identification");
            if (!debtorAccount.isMissingNode()) {
                paymentData.setDebtorAccount(debtorAccount.asText());
            }

            JsonNode creditorAccount = creditTransferTransactionInformation.path("CreditorAccount").path("Identification").path("Other").path("Identification");
            if (!creditorAccount.isMissingNode()) {
                paymentData.setCreditorAccount(creditorAccount.asText());
            }

            // Extract payment identification
            JsonNode endToEndId = creditTransferTransactionInformation.path("PaymentIdentification").path("EndToEndIdentification");
            if (!endToEndId.isMissingNode()) {
                paymentData.setEndToEndId(endToEndId.asText());
            }

        } catch (Exception e) {
            logger.error("Error extracting PACS008 data", e);
        }
    }

    /**
     * Extract data from PACS007 (Payment Return) message
     */
    private void extractPacs007Data(JsonNode xmlNode, JsonMessage.PaymentData paymentData) {
        try {
            // Navigate through PACS007 structure
            JsonNode document = xmlNode.path("Document");
            JsonNode fiToFiPaymentReturn = document.path("FIToFiPaymentReturn");
            JsonNode transactionInformation = fiToFiPaymentReturn.path("TransactionInformation");

            // Extract returned amount
            JsonNode returnedInstructedAmount = transactionInformation.path("ReturnedInstructedAmount");
            if (!returnedInstructedAmount.isMissingNode()) {
                paymentData.setAmount(returnedInstructedAmount.path("value").asText());
                paymentData.setCurrency(returnedInstructedAmount.path("Ccy").asText());
            }

            // Extract original payment identification
            JsonNode originalEndToEndId = transactionInformation.path("OriginalEndToEndIdentification");
            if (!originalEndToEndId.isMissingNode()) {
                paymentData.setEndToEndId(originalEndToEndId.asText());
            }

        } catch (Exception e) {
            logger.error("Error extracting PACS007 data", e);
        }
    }

    /**
     * Extract data from PACS003 (Direct Debit) message
     */
    private void extractPacs003Data(JsonNode xmlNode, JsonMessage.PaymentData paymentData) {
        try {
            // Navigate through PACS003 structure
            JsonNode document = xmlNode.path("Document");
            JsonNode fiToFiCustomerDirectDebit = document.path("FIToFiCustomerDirectDebit");
            JsonNode directDebitTransactionInformation = fiToFiCustomerDirectDebit.path("DirectDebitTransactionInformation");

            // Extract amount and currency
            JsonNode instructedAmount = directDebitTransactionInformation.path("InstructedAmount");
            if (!instructedAmount.isMissingNode()) {
                paymentData.setAmount(instructedAmount.path("value").asText());
                paymentData.setCurrency(instructedAmount.path("Ccy").asText());
            }

            // Extract account information
            JsonNode debtorAccount = directDebitTransactionInformation.path("DebtorAccount").path("Identification").path("Other").path("Identification");
            if (!debtorAccount.isMissingNode()) {
                paymentData.setDebtorAccount(debtorAccount.asText());
            }

            JsonNode creditorAccount = directDebitTransactionInformation.path("CreditorAccount").path("Identification").path("Other").path("Identification");
            if (!creditorAccount.isMissingNode()) {
                paymentData.setCreditorAccount(creditorAccount.asText());
            }

        } catch (Exception e) {
            logger.error("Error extracting PACS003 data", e);
        }
    }

    /**
     * Extract data from CAMT053 (Bank Statement) message
     */
    private void extractCamt053Data(JsonNode xmlNode, JsonMessage.PaymentData paymentData) {
        try {
            // Navigate through CAMT053 structure
            JsonNode document = xmlNode.path("Document");
            JsonNode bankToCustomerStatement = document.path("BankToCustomerStatement");
            JsonNode statement = bankToCustomerStatement.path("Statement");

            // Extract account identification
            JsonNode account = statement.path("Account").path("Identification").path("Other").path("Identification");
            if (!account.isMissingNode()) {
                paymentData.setCreditorAccount(account.asText());
            }

        } catch (Exception e) {
            logger.error("Error extracting CAMT053 data", e);
        }
    }

    /**
     * Extract data from CAMT054 (Debit/Credit Notification) message
     */
    private void extractCamt054Data(JsonNode xmlNode, JsonMessage.PaymentData paymentData) {
        try {
            // Navigate through CAMT054 structure
            JsonNode document = xmlNode.path("Document");
            JsonNode bankToCustomerDebitCreditNotification = document.path("BankToCustomerDebitCreditNotification");
            JsonNode notification = bankToCustomerDebitCreditNotification.path("Notification");

            // Extract account identification
            JsonNode account = notification.path("Account").path("Identification").path("Other").path("Identification");
            if (!account.isMissingNode()) {
                paymentData.setCreditorAccount(account.asText());
            }

        } catch (Exception e) {
            logger.error("Error extracting CAMT054 data", e);
        }
    }

    /**
     * Transform enrichment data from PaymentMessage to JsonMessage format
     */
    private JsonMessage.EnrichmentData transformEnrichmentData(PaymentMessage paymentMessage) {
        JsonMessage.EnrichmentData enrichmentData = new JsonMessage.EnrichmentData();

        if (paymentMessage.getEnrichmentData() != null) {
            PaymentMessage.EnrichmentData source = paymentMessage.getEnrichmentData();
            
            enrichmentData.setAccountSystem(source.getPhysicalAcctInfo() != null ? 
                source.getPhysicalAcctInfo().getAcctSys() : null);
            enrichmentData.setAuthMethod(source.getAuthMethod());

            // Create account info
            if (source.getPhysicalAcctInfo() != null) {
                // Transform physical account info to JSON account info if needed
                // This is a simplified mapping
            }
        }

        return enrichmentData;
    }

    /**
     * Create metadata for the JSON message
     */
    private Map<String, Object> createMetadata(PaymentMessage paymentMessage) {
        Map<String, Object> metadata = new HashMap<>();
        
        metadata.put("transformedAt", System.currentTimeMillis());
        metadata.put("originalMessageType", paymentMessage.getMessageType());
        
        // Handle unsupported message types gracefully
        try {
            metadata.put("workflowType", paymentMessage.determineWorkflowType().getConfigKey());
            metadata.put("requiresVamMediation", paymentMessage.requiresVamMediation());
            metadata.put("requiresLimitCheck", paymentMessage.requiresLimitCheck());
        } catch (IllegalArgumentException e) {
            metadata.put("workflowType", "unknown");
            metadata.put("requiresVamMediation", false);
            metadata.put("requiresLimitCheck", false);
        }
        
        if (paymentMessage.getMetadata() != null) {
            metadata.putAll(paymentMessage.getMetadata());
        }

        return metadata;
    }
} 