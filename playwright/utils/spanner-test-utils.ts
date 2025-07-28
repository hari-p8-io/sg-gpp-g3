import axios from 'axios';
import waitForExpect from 'wait-for-expect';

/**
 * Spanner test utilities for E2E tests
 * Uses the orchestrator service's REST API to query Spanner data
 */
export class SpannerTestUtils {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:18081') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get payment processing state by message ID
   * @param messageId The message ID to query
   */
  async getPaymentProcessingState(messageId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/state/${messageId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if a message exists in the deduplication cache
   * @param messageId The message ID to check
   */
  async isMessageDuplicate(messageId: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/deduplication/${messageId}`);
      return response.status === 200;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Wait for a message to be processed and reach a specific status
   * @param messageId The message ID to wait for
   * @param status The expected status
   * @param timeoutMs Maximum time to wait in milliseconds
   * @param intervalMs Interval between checks in milliseconds
   */
  async waitForMessageStatus(
    messageId: string,
    status: string,
    timeoutMs: number = 10000,
    intervalMs: number = 500
  ): Promise<void> {
    await waitForExpect(async () => {
      const state = await this.getPaymentProcessingState(messageId);
      expect(state).not.toBeNull();
      expect(state.status).toBe(status);
    }, timeoutMs, intervalMs);
  }

  /**
   * Wait for a message to be marked as duplicate
   * @param messageId The message ID to wait for
   * @param timeoutMs Maximum time to wait in milliseconds
   * @param intervalMs Interval between checks in milliseconds
   */
  async waitForMessageDuplicate(
    messageId: string,
    timeoutMs: number = 10000,
    intervalMs: number = 500
  ): Promise<void> {
    await waitForExpect(async () => {
      const isDuplicate = await this.isMessageDuplicate(messageId);
      expect(isDuplicate).toBe(true);
    }, timeoutMs, intervalMs);
  }
}

// Create and export a singleton instance
export const spannerUtils = new SpannerTestUtils(); 