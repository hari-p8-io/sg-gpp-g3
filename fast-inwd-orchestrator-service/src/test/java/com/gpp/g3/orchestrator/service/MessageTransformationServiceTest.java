package com.gpp.g3.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gpp.g3.orchestrator.model.JsonMessage;
import com.gpp.g3.orchestrator.model.PaymentMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageTransformationServiceTest {

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private MessageTransformationService messageTransformationService;

    private PaymentMessage testMessage;

    @BeforeEach
    void setUp() {
        testMessage = createTestPaymentMessage();
        // Initialize the XmlMapper manually since it's created in constructor
        messageTransformationService = new MessageTransformationService();
    }

    @Test
    void transformToJson_ValidPacs008_ShouldTransformSuccessfully() {
        // Given
        testMessage.setMessageType("PACS008");
        testMessage.setOriginalXmlPayload(createPacs008Xml());

        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result);
        assertEquals(testMessage.getMessageId(), result.getMessageId());
        assertEquals(testMessage.getPuid(), result.getPuid());
        assertEquals(testMessage.getMessageType(), result.getMessageType());
        assertEquals("credit-transfer-inward", result.getWorkflow());
        assertNotNull(result.getProcessedAt());
    }

    @Test
    void transformToJson_ValidPacs003_ShouldTransformSuccessfully() {
        // Given
        testMessage.setMessageType("PACS003");
        testMessage.setOriginalXmlPayload(createPacs003Xml());

        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result);
        assertEquals("PACS003", result.getMessageType());
        assertEquals("direct-debit-inward", result.getWorkflow());
    }

    @Test
    void transformToJson_EmptyXmlPayload_ShouldHandleGracefully() {
        // Given
        testMessage.setOriginalXmlPayload("");

        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result);
        assertEquals(testMessage.getMessageId(), result.getMessageId());
        // Payment data should be empty but not null
        assertNotNull(result.getPaymentData());
    }

    @Test
    void transformToJson_NullXmlPayload_ShouldHandleGracefully() {
        // Given
        testMessage.setOriginalXmlPayload(null);

        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result);
        assertEquals(testMessage.getMessageId(), result.getMessageId());
        assertNotNull(result.getPaymentData());
    }

    @Test
    void transformToJson_WithEnrichmentData_ShouldTransformEnrichmentData() {
        // Given
        PaymentMessage.EnrichmentData enrichmentData = new PaymentMessage.EnrichmentData();
        enrichmentData.setAuthMethod("GROUPLIMIT");
        
        PaymentMessage.PhysicalAcctInfo acctInfo = new PaymentMessage.PhysicalAcctInfo();
        acctInfo.setAcctSys("VAM");
        acctInfo.setCountry("SG");
        enrichmentData.setPhysicalAcctInfo(acctInfo);
        
        testMessage.setEnrichmentData(enrichmentData);

        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result.getEnrichmentData());
        assertEquals("VAM", result.getEnrichmentData().getAccountSystem());
        assertEquals("GROUPLIMIT", result.getEnrichmentData().getAuthMethod());
    }

    @Test
    void transformToJson_WithMetadata_ShouldIncludeMetadata() {
        // Given
        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result.getMetadata());
        assertTrue(result.getMetadata().containsKey("transformedAt"));
        assertTrue(result.getMetadata().containsKey("originalMessageType"));
        assertTrue(result.getMetadata().containsKey("workflowType"));
        assertEquals("PACS008", result.getMetadata().get("originalMessageType"));
        assertEquals("credit-transfer-inward", result.getMetadata().get("workflowType"));
    }

    @Test
    void transformToJson_InvalidXml_ShouldHandleError() {
        // Given
        testMessage.setOriginalXmlPayload("invalid-xml-content");

        // When & Then
        // Should not throw exception but handle gracefully
        assertDoesNotThrow(() -> {
            JsonMessage result = messageTransformationService.transformToJson(testMessage);
            assertNotNull(result);
        });
    }

    @Test
    void transformToJson_UnsupportedMessageType_ShouldLogWarning() {
        // Given
        testMessage.setMessageType("UNSUPPORTED");
        testMessage.setOriginalXmlPayload("<test>content</test>");

        // When
        JsonMessage result = messageTransformationService.transformToJson(testMessage);

        // Then
        assertNotNull(result);
        assertEquals("UNSUPPORTED", result.getMessageType());
        // Payment data should be created but potentially empty
        assertNotNull(result.getPaymentData());
    }

    // Helper methods
    private PaymentMessage createTestPaymentMessage() {
        PaymentMessage message = new PaymentMessage();
        message.setMessageId("test-message-id");
        message.setPuid("test-puid");
        message.setMessageType("PACS008");
        message.setReceivedAt(Instant.now());

        PaymentMessage.EnrichmentData enrichmentData = new PaymentMessage.EnrichmentData();
        enrichmentData.setAuthMethod("STANDARD");
        
        PaymentMessage.PhysicalAcctInfo acctInfo = new PaymentMessage.PhysicalAcctInfo();
        acctInfo.setAcctSys("MDZ");
        acctInfo.setCountry("SG");
        acctInfo.setCurrencyCode("SGD");
        enrichmentData.setPhysicalAcctInfo(acctInfo);
        
        message.setEnrichmentData(enrichmentData);
        return message;
    }

    private String createPacs008Xml() {
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
                <FIToFICstmrCdtTrf>
                    <GrpHdr>
                        <MsgId>TEST_MSG_001</MsgId>
                        <CreDtTm>2024-12-13T10:00:00Z</CreDtTm>
                    </GrpHdr>
                    <CdtTrfTxInf>
                        <PmtId>
                            <EndToEndId>TEST_E2E_001</EndToEndId>
                        </PmtId>
                        <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
                        <Dbtr>
                            <Nm>Test Debtor</Nm>
                        </Dbtr>
                        <Cdtr>
                            <Nm>Test Creditor</Nm>
                        </Cdtr>
                    </CdtTrfTxInf>
                </FIToFICstmrCdtTrf>
            </Document>
            """;
    }

    private String createPacs003Xml() {
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.003.001.08">
                <FIToFICstmrDrctDbt>
                    <GrpHdr>
                        <MsgId>TEST_DDI_001</MsgId>
                        <CreDtTm>2024-12-13T10:00:00Z</CreDtTm>
                    </GrpHdr>
                    <DrctDbtTxInf>
                        <PmtId>
                            <EndToEndId>TEST_DDI_E2E_001</EndToEndId>
                        </PmtId>
                        <InstrAmt Ccy="SGD">500.00</InstrAmt>
                        <Dbtr>
                            <Nm>Test Debtor</Nm>
                        </Dbtr>
                        <Cdtr>
                            <Nm>Test Creditor</Nm>
                        </Cdtr>
                    </DrctDbtTxInf>
                </FIToFICstmrDrctDbt>
            </Document>
            """;
    }
} 