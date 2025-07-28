package com.gpp.g3.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gpp.g3.orchestrator.model.PaymentMessage;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

/**
 * Kafka consumer service for processing incoming payment messages
 */
@Service
public class KafkaConsumerService {

    private static final Logger logger = LoggerFactory.getLogger(KafkaConsumerService.class);

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WorkflowOrchestrationService workflowOrchestrationService;

    /**
     * Listen for incoming payment messages from external clients
     */
    @KafkaListener(topics = "${app.kafka.topics.enriched-messages:enriched-messages}", 
                   groupId = "${spring.kafka.consumer.group-id}")
    public void consumePaymentMessage(@Payload String message, 
                                    @Header(KafkaHeaders.RECEIVED_KEY) String key,
                                    @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                    @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                                    @Header(KafkaHeaders.OFFSET) long offset,
                                    Acknowledgment acknowledgment) {
        
        logger.info("Received payment message: key={}, topic={}, partition={}, offset={}", 
            key, topic, partition, offset);

        try {
            // Deserialize payment message
            PaymentMessage paymentMessage = objectMapper.readValue(message, PaymentMessage.class);
            
            logger.info("Processing payment message: messageId={}, messageType={}, puid={}", 
                paymentMessage.getMessageId(), paymentMessage.getMessageType(), paymentMessage.getPuid());

            // Process message through workflow orchestration
            workflowOrchestrationService.processPaymentMessage(paymentMessage);

            // Acknowledge message processing
            acknowledgment.acknowledge();
            
            logger.info("Successfully processed payment message: messageId={}", paymentMessage.getMessageId());

        } catch (Exception e) {
            logger.error("Error processing payment message: key={}, topic={}, partition={}, offset={}", 
                key, topic, partition, offset, e);
            
            // For now, we acknowledge even failed messages to prevent reprocessing
            // In production, implement proper error handling and dead letter queues
            acknowledgment.acknowledge();
        }
    }

    /**
     * Listen for responses from accounting service
     */
    @KafkaListener(topics = "${app.kafka.topics.accounting-responses:accounting-response-messages}", 
                   groupId = "${spring.kafka.consumer.group-id}")
    public void consumeAccountingResponse(@Payload String message,
                                        @Header(KafkaHeaders.RECEIVED_KEY) String messageId,
                                        Acknowledgment acknowledgment) {
        
        logger.info("Received accounting response for messageId: {}", messageId);

        try {
            // Parse response and update state
            // Assuming response format: {"messageId": "...", "status": "COMPLETED|FAILED", "data": "..."}
            var responseNode = objectMapper.readTree(message);
            String status = responseNode.get("status").asText();
            String responseData = responseNode.has("data") ? responseNode.get("data").toString() : null;

            ProcessingStatus processingStatus = ProcessingStatus.valueOf(status);
            workflowOrchestrationService.handleDownstreamResponse("accounting", messageId, processingStatus, responseData);

            acknowledgment.acknowledge();
            logger.info("Successfully processed accounting response for messageId: {}", messageId);

        } catch (Exception e) {
            logger.error("Error processing accounting response for messageId: {}", messageId, e);
            acknowledgment.acknowledge();
        }
    }

    /**
     * Listen for responses from VAM mediation service
     */
    @KafkaListener(topics = "${app.kafka.topics.vammediation-responses:vammediation-response-messages}", 
                   groupId = "${spring.kafka.consumer.group-id}")
    public void consumeVamMediationResponse(@Payload String message,
                                          @Header(KafkaHeaders.RECEIVED_KEY) String messageId,
                                          Acknowledgment acknowledgment) {
        
        logger.info("Received VAM mediation response for messageId: {}", messageId);

        try {
            var responseNode = objectMapper.readTree(message);
            String status = responseNode.get("status").asText();
            String responseData = responseNode.has("data") ? responseNode.get("data").toString() : null;

            ProcessingStatus processingStatus = ProcessingStatus.valueOf(status);
            workflowOrchestrationService.handleDownstreamResponse("vammediation", messageId, processingStatus, responseData);

            acknowledgment.acknowledge();
            logger.info("Successfully processed VAM mediation response for messageId: {}", messageId);

        } catch (Exception e) {
            logger.error("Error processing VAM mediation response for messageId: {}", messageId, e);
            acknowledgment.acknowledge();
        }
    }

    /**
     * Listen for responses from limit check service
     */
    @KafkaListener(topics = "${app.kafka.topics.limitcheck-responses:limitcheck-response-messages}", 
                   groupId = "${spring.kafka.consumer.group-id}")
    public void consumeLimitCheckResponse(@Payload String message,
                                        @Header(KafkaHeaders.RECEIVED_KEY) String messageId,
                                        Acknowledgment acknowledgment) {
        
        logger.info("Received limit check response for messageId: {}", messageId);

        try {
            var responseNode = objectMapper.readTree(message);
            String status = responseNode.get("status").asText();
            String responseData = responseNode.has("data") ? responseNode.get("data").toString() : null;

            ProcessingStatus processingStatus = ProcessingStatus.valueOf(status);
            workflowOrchestrationService.handleDownstreamResponse("limitcheck", messageId, processingStatus, responseData);

            acknowledgment.acknowledge();
            logger.info("Successfully processed limit check response for messageId: {}", messageId);

        } catch (Exception e) {
            logger.error("Error processing limit check response for messageId: {}", messageId, e);
            acknowledgment.acknowledge();
        }
    }
} 