package com.gpp.g3.orchestrator.model;

/**
 * Enum representing the various processing states in the payment workflow
 */
public enum ProcessingStatus {
    /**
     * Message received but not yet processed
     */
    RECEIVED,
    
    /**
     * Currently being processed
     */
    PROCESSING,
    
    /**
     * Processing completed successfully
     */
    COMPLETED,
    
    /**
     * Processing failed
     */
    FAILED,
    
    /**
     * Processing is being retried
     */
    RETRYING,
    
    /**
     * Processing not required for this workflow/service
     */
    NOT_REQUIRED,
    
    /**
     * Processing is pending (waiting for dependency)
     */
    PENDING,
    
    /**
     * Processing timed out
     */
    TIMEOUT;

    /**
     * Check if this status represents a terminal state (no further processing)
     */
    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == NOT_REQUIRED || this == TIMEOUT;
    }

    /**
     * Check if this status represents a successful completion
     */
    public boolean isSuccessful() {
        return this == COMPLETED || this == NOT_REQUIRED;
    }

    /**
     * Check if this status represents an error state
     */
    public boolean isError() {
        return this == FAILED || this == TIMEOUT;
    }

    /**
     * Check if this status allows for retry
     */
    public boolean canRetry() {
        return this == FAILED || this == TIMEOUT;
    }

    /**
     * Get the next logical status after a successful operation
     */
    public ProcessingStatus getNextSuccessStatus() {
        return switch (this) {
            case RECEIVED, PENDING -> PROCESSING;
            case PROCESSING, RETRYING -> COMPLETED;
            default -> this;
        };
    }

    /**
     * Get the next logical status after a failed operation
     */
    public ProcessingStatus getNextFailureStatus() {
        return switch (this) {
            case RECEIVED, PENDING, PROCESSING -> FAILED;
            case RETRYING -> FAILED;
            default -> this;
        };
    }
} 