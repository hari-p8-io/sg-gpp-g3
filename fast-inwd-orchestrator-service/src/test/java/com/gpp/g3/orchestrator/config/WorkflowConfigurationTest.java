package com.gpp.g3.orchestrator.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class WorkflowConfigurationTest {

    @InjectMocks
    private WorkflowConfiguration workflowConfiguration;

    @BeforeEach
    void setUp() {
        // The configuration is hardcoded in the class
    }

    @Test
    void getCtiWorkflow_ShouldReturnCtiConfiguration() {
        // When
        Map<String, Object> ctiWorkflow = workflowConfiguration.getCtiWorkflow();

        // Then
        assertNotNull(ctiWorkflow);
        assertEquals("credit-transfer-inward", ctiWorkflow.get("name"));
        assertEquals("Workflow for processing credit transfer inward messages", ctiWorkflow.get("description"));
        
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) ctiWorkflow.get("steps");
        assertNotNull(steps);
        assertEquals(3, steps.size());
        
        // Verify step names
        assertEquals("deduplication-check", steps.get(0).get("name"));
        assertEquals("pacs-to-json-transform", steps.get(1).get("name"));
        assertEquals("publish-to-downstream", steps.get(2).get("name"));
        
        // Verify services
        assertEquals("DeduplicationService", steps.get(0).get("service"));
        assertEquals("MessageTransformationService", steps.get(1).get("service"));
        assertEquals("JsonPublishingService", steps.get(2).get("service"));
    }

    @Test
    void getDdiWorkflow_ShouldReturnDdiConfiguration() {
        // When
        Map<String, Object> ddiWorkflow = workflowConfiguration.getDdiWorkflow();

        // Then
        assertNotNull(ddiWorkflow);
        assertEquals("direct-debit-inward", ddiWorkflow.get("name"));
        assertEquals("Workflow for processing direct debit inward messages", ddiWorkflow.get("description"));
        
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) ddiWorkflow.get("steps");
        assertNotNull(steps);
        assertEquals(3, steps.size());
        
        // Verify step names
        assertEquals("deduplication-check", steps.get(0).get("name"));
        assertEquals("pacs-to-json-transform", steps.get(1).get("name"));
        assertEquals("publish-to-downstream", steps.get(2).get("name"));
        
        // Verify services
        assertEquals("DeduplicationService", steps.get(0).get("service"));
        assertEquals("MessageTransformationService", steps.get(1).get("service"));
        assertEquals("JsonPublishingService", steps.get(2).get("service"));
    }

    @Test
    void getCtiWorkflow_ShouldReturnTargetServices() {
        // When
        Map<String, Object> ctiWorkflow = workflowConfiguration.getCtiWorkflow();

        // Then
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) ctiWorkflow.get("steps");
        Map<String, Object> publishStep = steps.get(2); // publish-to-downstream step
        
        @SuppressWarnings("unchecked")
        List<String> targets = (List<String>) publishStep.get("targets");
        assertNotNull(targets);
        assertEquals(3, targets.size());
        assertTrue(targets.contains("accounting"));
        assertTrue(targets.contains("vammediation"));
        assertTrue(targets.contains("limitcheck"));
    }

    @Test
    void getDdiWorkflow_ShouldReturnTargetServices() {
        // When
        Map<String, Object> ddiWorkflow = workflowConfiguration.getDdiWorkflow();

        // Then
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> steps = (List<Map<String, Object>>) ddiWorkflow.get("steps");
        Map<String, Object> publishStep = steps.get(2); // publish-to-downstream step
        
        @SuppressWarnings("unchecked")
        List<String> targets = (List<String>) publishStep.get("targets");
        assertNotNull(targets);
        assertEquals(3, targets.size());
        assertTrue(targets.contains("accounting"));
        assertTrue(targets.contains("vammediation"));
        assertTrue(targets.contains("limitcheck"));
    }

    @Test
    void workflowSteps_ShouldHaveRequiredProperties() {
        // Test CTI workflow steps
        Map<String, Object> ctiWorkflow = workflowConfiguration.getCtiWorkflow();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> ctiSteps = (List<Map<String, Object>>) ctiWorkflow.get("steps");
        
        for (Map<String, Object> step : ctiSteps) {
            assertNotNull(step.get("name"), "Step should have a name");
            assertNotNull(step.get("service"), "Step should have a service");
        }

        // Test DDI workflow steps
        Map<String, Object> ddiWorkflow = workflowConfiguration.getDdiWorkflow();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> ddiSteps = (List<Map<String, Object>>) ddiWorkflow.get("steps");
        
        for (Map<String, Object> step : ddiSteps) {
            assertNotNull(step.get("name"), "Step should have a name");
            assertNotNull(step.get("service"), "Step should have a service");
        }
    }
} 