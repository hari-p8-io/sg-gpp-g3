package com.gpp.g3.orchestrator.repository;

import com.gpp.g3.orchestrator.model.PaymentProcessingState;
import com.gpp.g3.orchestrator.model.ProcessingStatus;
import com.gpp.g3.orchestrator.model.WorkflowType;
import com.google.cloud.spring.data.spanner.repository.SpannerRepository;
import com.google.cloud.spring.data.spanner.repository.query.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Spanner repository for managing payment processing state
 */
@Repository
public interface PaymentProcessingStateRepository extends SpannerRepository<PaymentProcessingState, String> {

    /**
     * Find processing state by message hash (for deduplication)
     */
    @Query("SELECT * FROM payment_processing_state WHERE message_hash = @messageHash")
    Optional<PaymentProcessingState> findByMessageHash(@Param("messageHash") String messageHash);

    /**
     * Find all processing states by PUID
     */
    @Query("SELECT * FROM payment_processing_state WHERE puid = @puid ORDER BY created_at DESC")
    List<PaymentProcessingState> findByPuid(@Param("puid") String puid);

    /**
     * Find processing states by overall status
     */
    @Query("SELECT * FROM payment_processing_state WHERE overall_status = @status ORDER BY created_at DESC")
    List<PaymentProcessingState> findByOverallStatus(@Param("status") ProcessingStatus status);

    /**
     * Find processing states by workflow type
     */
    @Query("SELECT * FROM payment_processing_state WHERE workflow_type = @workflowType ORDER BY created_at DESC")
    List<PaymentProcessingState> findByWorkflowType(@Param("workflowType") WorkflowType workflowType);

    /**
     * Find pending processing states (not completed or failed)
     */
    @Query("SELECT * FROM payment_processing_state WHERE overall_status IN ('RECEIVED', 'PROCESSING', 'PENDING', 'RETRYING') ORDER BY created_at ASC")
    List<PaymentProcessingState> findPendingProcessingStates();

    /**
     * Find processing states that have timed out
     */
    @Query("SELECT * FROM payment_processing_state WHERE overall_status IN ('RECEIVED', 'PROCESSING', 'PENDING', 'RETRYING') AND created_at < @timeoutThreshold")
    List<PaymentProcessingState> findTimedOutProcessingStates(@Param("timeoutThreshold") Instant timeoutThreshold);

    /**
     * Find incomplete processing states for a specific service
     */
    @Query("SELECT * FROM payment_processing_state WHERE accounting_status IN ('RECEIVED', 'PROCESSING', 'PENDING', 'RETRYING') OR vam_mediation_status IN ('RECEIVED', 'PROCESSING', 'PENDING', 'RETRYING') OR limit_check_status IN ('RECEIVED', 'PROCESSING', 'PENDING', 'RETRYING')")
    List<PaymentProcessingState> findIncompleteProcessingStates();

    /**
     * Find processing states created within a time range
     */
    @Query("SELECT * FROM payment_processing_state WHERE created_at >= @startTime AND created_at <= @endTime ORDER BY created_at DESC")
    List<PaymentProcessingState> findByCreatedAtBetween(@Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

    /**
     * Find processing states by message type
     */
    @Query("SELECT * FROM payment_processing_state WHERE message_type = @messageType ORDER BY created_at DESC")
    List<PaymentProcessingState> findByMessageType(@Param("messageType") String messageType);

    /**
     * Count processing states by status
     */
    @Query("SELECT COUNT(*) FROM payment_processing_state WHERE overall_status = @status")
    long countByOverallStatus(@Param("status") ProcessingStatus status);

    /**
     * Count processing states by workflow type and status
     */
    @Query("SELECT COUNT(*) FROM payment_processing_state WHERE workflow_type = @workflowType AND overall_status = @status")
    long countByWorkflowTypeAndOverallStatus(@Param("workflowType") WorkflowType workflowType, @Param("status") ProcessingStatus status);

    /**
     * Find states with high retry count
     */
    @Query("SELECT * FROM payment_processing_state WHERE retry_count >= @minRetryCount ORDER BY retry_count DESC, created_at DESC")
    List<PaymentProcessingState> findHighRetryCountStates(@Param("minRetryCount") int minRetryCount);

    /**
     * Delete old completed processing states (for cleanup)
     */
    @Query("DELETE FROM payment_processing_state WHERE overall_status IN ('COMPLETED', 'FAILED') AND completed_at < @cutoffTime")
    void deleteOldCompletedStates(@Param("cutoffTime") Instant cutoffTime);

    /**
     * Find duplicate processing attempts (same message hash, different message ID)
     */
    @Query("SELECT * FROM payment_processing_state WHERE message_hash = @messageHash AND message_id != @messageId")
    List<PaymentProcessingState> findDuplicateProcessingAttempts(@Param("messageHash") String messageHash, @Param("messageId") String messageId);
} 