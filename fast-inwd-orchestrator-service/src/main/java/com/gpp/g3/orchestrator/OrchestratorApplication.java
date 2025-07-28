package com.gpp.g3.orchestrator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Main application class for Fast Inward Orchestrator Service
 * 
 * Provides configurable workflows for CTI (Credit Transfer Inward) and DDI (Direct Debit Inward)
 * with state management in Google Cloud Spanner.
 */
@SpringBootApplication
@EnableKafka
@EnableAsync
@EnableScheduling
public class OrchestratorApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrchestratorApplication.class, args);
    }
} 