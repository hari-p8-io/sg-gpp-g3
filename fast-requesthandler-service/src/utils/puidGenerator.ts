export class PUIDGenerator {
  /**
   * Generate a 16-character PUID starting with "G3I"
   * Format: G3I + 13 random alphanumeric characters
   */
  static generatePUID(): string {
    const prefix = 'G3I';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix;
    
    for (let i = 0; i < 13; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Validate if a string is a valid PUID
   */
  static isValidPUID(puid: string): boolean {
    // Must be exactly 16 characters, start with G3I, followed by 13 alphanumeric characters
    const puidRegex = /^G3I[A-Z0-9]{13}$/;
    return puidRegex.test(puid);
  }

  /**
   * Generate a PUID with custom timestamp encoding (optional future enhancement)
   */
  static generatePUIDWithTimestamp(): string {
    const prefix = 'G3I';
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4); // Last 4 chars of timestamp in base36
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix + timestamp;
    
    // Fill remaining 9 characters with random alphanumeric
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }
} 