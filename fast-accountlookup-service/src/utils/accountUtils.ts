import { 
  SINGAPORE_BANKING_CONSTANTS, 
  ACCOUNT_TYPES, 
  ACCOUNT_CATEGORIES 
} from './constants';

export class AccountUtils {
  
  static normalizeAccountId(accountId: string): string {
    // Remove any non-alphanumeric characters and convert to uppercase
    return accountId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  static determineAccountType(accountId: string): string {
    const normalizedId = this.normalizeAccountId(accountId);
    
    // Simulate business logic for different account types
    if (normalizedId.startsWith('CORP')) return ACCOUNT_TYPES.CORPORATE;
    if (normalizedId.startsWith('GOVT')) return ACCOUNT_TYPES.GOVERNMENT;
    if (normalizedId.startsWith('UTIL')) return ACCOUNT_TYPES.UTILITY;
    if (normalizedId.startsWith('SP')) return ACCOUNT_TYPES.UTILITY;
    
    return ACCOUNT_TYPES.PHYSICAL; // Default for individual accounts
  }

  static determineAccountCategory(accountId: string): string {
    const accountType = this.determineAccountType(accountId);
    
    switch (accountType) {
      case ACCOUNT_TYPES.CORPORATE:
        return ACCOUNT_CATEGORIES.CORPORATE;
      case ACCOUNT_TYPES.GOVERNMENT:
        return ACCOUNT_CATEGORIES.GOVERNMENT;
      case ACCOUNT_TYPES.UTILITY:
        return ACCOUNT_CATEGORIES.UTILITY;
      default:
        return ACCOUNT_CATEGORIES.RETAIL;
    }
  }

  static generateBranchId(accountId: string): string | null {
    const normalizedId = this.normalizeAccountId(accountId);
    
    // Simulate branch assignment based on account ID patterns
    if (normalizedId.length > 10) {
      const branchCodes = Object.values(SINGAPORE_BANKING_CONSTANTS.BRANCH_CODES);
      const index = normalizedId.length % branchCodes.length;
      return branchCodes[index] || null;
    }
    
    return SINGAPORE_BANKING_CONSTANTS.BRANCH_CODES.MAIN;
  }

  static getDefaultBankCode(): string {
    return SINGAPORE_BANKING_CONSTANTS.BANK_CODES.ANZ;
  }

  static getAccountSystem(accountType: string): string {
    switch (accountType) {
      case ACCOUNT_TYPES.CORPORATE:
      case ACCOUNT_TYPES.GOVERNMENT:
        return SINGAPORE_BANKING_CONSTANTS.ACCOUNT_SYSTEMS.MEPS;
      case ACCOUNT_TYPES.UTILITY:
        return SINGAPORE_BANKING_CONSTANTS.ACCOUNT_SYSTEMS.FAST;
      default:
        return SINGAPORE_BANKING_CONSTANTS.ACCOUNT_SYSTEMS.MDZ;
    }
  }

  static getAccountGroup(accountCategory: string): string {
    switch (accountCategory) {
      case ACCOUNT_CATEGORIES.CORPORATE:
        return SINGAPORE_BANKING_CONSTANTS.ACCOUNT_GROUPS.CORPORATE;
      case ACCOUNT_CATEGORIES.RETAIL:
        return SINGAPORE_BANKING_CONSTANTS.ACCOUNT_GROUPS.RETAIL;
      default:
        return SINGAPORE_BANKING_CONSTANTS.ACCOUNT_GROUPS.SGB;
    }
  }

  static validateAccountId(accountId: string): boolean {
    if (!accountId || accountId.trim().length === 0) {
      return false;
    }
    
    // Basic validation - account ID should be alphanumeric and between 5-20 characters
    const normalized = this.normalizeAccountId(accountId);
    return normalized.length >= 5 && normalized.length <= 20;
  }

  static isTestAccount(accountId: string): boolean {
    const normalizedId = this.normalizeAccountId(accountId);
    return normalizedId.includes('TEST') || 
           normalizedId.includes('DEMO') || 
           normalizedId.includes('SAMPLE');
  }

  static shouldSimulateError(accountId: string): boolean {
    const normalizedId = this.normalizeAccountId(accountId);
    return normalizedId.includes('ERROR') || 
           normalizedId.includes('FAIL') || 
           normalizedId.includes('NOTFOUND') || 
           normalizedId.includes('INACTIVE');
  }

  static getErrorType(accountId: string): string {
    const normalizedId = this.normalizeAccountId(accountId);
    
    if (normalizedId.includes('NOTFOUND')) return 'ACCOUNT_NOT_FOUND';
    if (normalizedId.includes('INACTIVE')) return 'ACCOUNT_INACTIVE';
    if (normalizedId.includes('ERROR') || normalizedId.includes('FAIL')) return 'PROCESSING_ERROR';
    
    return 'UNKNOWN_ERROR';
  }
} 