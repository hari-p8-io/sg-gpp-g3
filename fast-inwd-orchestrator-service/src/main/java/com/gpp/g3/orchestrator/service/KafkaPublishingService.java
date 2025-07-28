package com.gpp.g3.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gpp.g3.orchestrator.model.JsonMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

/**
 * Service for publishing JSON messages to downstream services via Kafka
 */
@Service
public class KafkaPublishingService {

    private static final Logger logger = LoggerFactory.getLogger(KafkaPublishingService.class);

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${app.kafka.topics.accounting:json-accounting-messages}")
    private String accountingTopic;

    @Value("${app.kafka.topics.vammediation:json-vammediation-messages}")
    private String vamMediationTopic;

    @Value("${app.kafka.topics.limitcheck:json-limitcheck-messages}")
    private String limitCheckTopic;

    /**
     * Publish message to accounting service
     */
    public void publishToAccountingService(JsonMessage jsonMessage) {
        publishMessage(accountingTopic, jsonMessage, "accounting");
    }

    /**
     * Publish message to VAM mediation service
     */
    public void publishToVamMediationService(JsonMessage jsonMessage) {
        publishMessage(vamMediationTopic, jsonMessage, "vammediation");
    }

    /**
     * Publish message to limit check service
     */
    public void publishToLimitCheckService(JsonMessage jsonMessage) {
        publishMessage(limitCheckTopic, jsonMessage, "limitcheck");
    }

    /**
     * Generic method to publish message to a Kafka topic
     */
    private void publishMessage(String topic, JsonMessage jsonMessage, String serviceName) {
        try {
            logger.info("Publishing message to {} service: messageId={}", serviceName, jsonMessage.getMessageId());
            String messageJson = objectMapper.writeValueAsString(jsonMessage);
            kafkaTemplate.send(topic, jsonMessage.getMessageId(), messageJson);
            logger.info("Successfully published message to {} service: messageId={}", serviceName, jsonMessage.getMessageId());
        } catch (Exception e) {
            logger.error("Error publishing message to {} service: messageId={}", serviceName, jsonMessage.getMessageId(), e);
            throw new RuntimeException("Error publishing message to " + serviceName + " service", e);
        }
    }
} 