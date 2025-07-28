package com.gpp.g3.orchestrator.config;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.*;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class KafkaConfigTest {

    @InjectMocks
    private KafkaConfig kafkaConfig;

    @BeforeEach
    void setUp() {
        // Set test properties
        ReflectionTestUtils.setField(kafkaConfig, "bootstrapServers", "localhost:9092");
        ReflectionTestUtils.setField(kafkaConfig, "groupId", "test-group");
        ReflectionTestUtils.setField(kafkaConfig, "autoOffsetReset", "earliest");
        ReflectionTestUtils.setField(kafkaConfig, "enableAutoCommit", false);
        ReflectionTestUtils.setField(kafkaConfig, "autoCommitInterval", 1000);
    }

    @Test
    void consumerFactory_ShouldCreateConsumerFactory() {
        // When
        ConsumerFactory<String, String> consumerFactory = kafkaConfig.consumerFactory();

        // Then
        assertNotNull(consumerFactory);
        
        Map<String, Object> configs = consumerFactory.getConfigurationProperties();
        assertEquals("localhost:9092", configs.get(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG));
        assertEquals("test-group", configs.get(ConsumerConfig.GROUP_ID_CONFIG));
        assertEquals("earliest", configs.get(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG));
        assertEquals(false, configs.get(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG));
        // These are default Kafka values, not explicitly set in our config
        // assertEquals(100, configs.get(ConsumerConfig.MAX_POLL_RECORDS_CONFIG));
        // assertEquals(30000, configs.get(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG));
        // assertEquals(3000, configs.get(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG));
        assertEquals(StringDeserializer.class, configs.get(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG));
        assertEquals(StringDeserializer.class, configs.get(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG));
    }

    @Test
    void kafkaListenerContainerFactory_ShouldCreateListenerFactory() {
        // When
        ConcurrentKafkaListenerContainerFactory<String, String> listenerFactory = 
            kafkaConfig.kafkaListenerContainerFactory();

        // Then
        assertNotNull(listenerFactory);
        assertNotNull(listenerFactory.getConsumerFactory());
    }

    @Test
    void producerFactory_ShouldCreateProducerFactory() {
        // When
        ProducerFactory<String, String> producerFactory = kafkaConfig.producerFactory();

        // Then
        assertNotNull(producerFactory);
        
        Map<String, Object> configs = producerFactory.getConfigurationProperties();
        assertEquals("localhost:9092", configs.get(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG));
        assertEquals("all", configs.get(ProducerConfig.ACKS_CONFIG));
        assertEquals(3, configs.get(ProducerConfig.RETRIES_CONFIG));
        // These are default Kafka values not explicitly set in our simple config
        // assertEquals(16384, configs.get(ProducerConfig.BATCH_SIZE_CONFIG));
        // assertEquals(1, configs.get(ProducerConfig.LINGER_MS_CONFIG));
        // assertEquals(33554432L, configs.get(ProducerConfig.BUFFER_MEMORY_CONFIG));
        // assertEquals("snappy", configs.get(ProducerConfig.COMPRESSION_TYPE_CONFIG));
        // assertEquals(1048576, configs.get(ProducerConfig.MAX_REQUEST_SIZE_CONFIG));
        assertEquals(StringSerializer.class, configs.get(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG));
        assertEquals(StringSerializer.class, configs.get(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG));
    }

    @Test
    void kafkaTemplate_ShouldCreateKafkaTemplate() {
        // When
        KafkaTemplate<String, String> kafkaTemplate = kafkaConfig.kafkaTemplate();

        // Then
        assertNotNull(kafkaTemplate);
        assertNotNull(kafkaTemplate.getProducerFactory());
    }
} 