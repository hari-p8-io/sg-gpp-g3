import { v4 as uuidv4 } from 'uuid';

export class UUIDGenerator {
  /**
   * Generate a standard UUID (36 characters)
   * Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   */
  static generateUUID(): string {
    return uuidv4();
  }

  /**
   * Validate if a string is a valid UUID
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
} 