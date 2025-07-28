import { 
  ACCOUNT_TYPES,
  ACCOUNT_CATEGORIES,
  SINGAPORE_BANKING_CONSTANTS,
  getMarketConstants
} from './constants';

export class AccountUtils {
  
  /**
   * Normalize account ID by removing spaces and converting to uppercase
   */
  static normalizeAccountId(accountId: string): string {
    return accountId.trim().toUpperCase().replace(/\s+/g, '');
  }

  /**
   * Validate account ID format
   */
  static validateAccountId(accountId: string): boolean {
    if (!accountId || accountId.trim().length === 0) {
      return false;
    }
    
    const normalized = this.normalizeAccountId(accountId);
    return /^[A-Z0-9]{8,20}$/.test(normalized);
  }

  /**
   * Check if account should simulate error for testing
   */
  static shouldSimulateError(accountId: string): boolean {
    const normalized = this.normalizeAccountId(accountId);
    return normalized.includes('ERROR') || 
           normalized.includes('FAIL') || 
           normalized.startsWith('111') || 
           normalized.endsWith('999');
  }

  /**
   * Get error type based on account pattern
   */
  static getErrorType(accountId: string): string {
    const normalized = this.normalizeAccountId(accountId);
    
    if (normalized.includes('NOTFOUND') || normalized.startsWith('111')) {
      return 'ACCOUNT_NOT_FOUND';
    }
    
    if (normalized.includes('INACTIVE') || normalized.endsWith('999')) {
      return 'ACCOUNT_INACTIVE';
    }
    
    return 'PROCESSING_ERROR';
  }

  /**
   * Check if account is a test account
   */
  static isTestAccount(accountId: string): boolean {
    const normalized = this.normalizeAccountId(accountId);
    return normalized.includes('TEST') || 
           normalized.includes('DEMO') || 
           normalized.includes('MOCK') ||
           normalized.startsWith('999') ||
           normalized.startsWith('888') ||
           normalized.includes('PREMIUM') ||
           normalized.includes('BUSINESS');
  }

  /**
   * Determine account type based on account pattern
   */
  static determineAccountType(accountId: string): string {
    const normalized = this.normalizeAccountId(accountId);
    
    if (normalized.includes('GOVT') || normalized.includes('GOVERNMENT')) {
      return ACCOUNT_TYPES.GOVERNMENT;
    } else if (normalized.includes('CORP') || normalized.startsWith('888')) {
      return ACCOUNT_TYPES.CORPORATE;
    } else if (normalized.includes('UTIL') || normalized.includes('UTILITY')) {
      return ACCOUNT_TYPES.UTILITY;
    } else if (normalized.includes('VIRT') || normalized.includes('VIRTUAL')) {
      return ACCOUNT_TYPES.VIRTUAL;
    }
    
    return ACCOUNT_TYPES.PHYSICAL;
  }

  /**
   * Determine account category based on account pattern
   */
  static determineAccountCategory(accountId: string): string {
    const normalized = this.normalizeAccountId(accountId);
    
    if (normalized.includes('GOVT') || normalized.includes('GOVERNMENT')) {
      return ACCOUNT_CATEGORIES.GOVERNMENT;
    } else if (normalized.includes('CORP') || normalized.startsWith('888')) {
      return ACCOUNT_CATEGORIES.CORPORATE;
    } else if (normalized.includes('UTIL') || normalized.includes('UTILITY')) {
      return ACCOUNT_CATEGORIES.UTILITY;
    }
    
    return ACCOUNT_CATEGORIES.RETAIL;
  }

  /**
   * Get account system based on account pattern (core logic: MDZ or VAM ONLY)
   * User requirement: Only VAM or MDZ are valid account systems
   */
  static getAccountSystem(accountId: string): string {
    const normalized = this.normalizeAccountId(accountId);
    
    // VAM accounts: accounts starting with 999 or containing VAM
    if (normalized.startsWith('999') || normalized.includes('VAM')) {
      return 'VAM';
    }
    
    // ALL other accounts use MDZ (no MEPS, FAST, or other systems)
    return 'MDZ';
  }

  /**
   * Generate branch ID
   */
  static generateBranchId(): string {
    const branchCodes = Object.values(SINGAPORE_BANKING_CONSTANTS.BRANCH_CODES);
    return branchCodes[Math.floor(Math.random() * branchCodes.length)] || '001';
  }

  /**
   * Get default bank code
   */
  static getDefaultBankCode(): string {
    const bankCodes = Object.values(SINGAPORE_BANKING_CONSTANTS.BANK_CODES);
    return bankCodes[Math.floor(Math.random() * bankCodes.length)] || 'DBSSSGSGXXX';
  }

  /**
   * Get account group based on account category
   */
  static getAccountGroup(accountCategory: string): string {
    const marketConstants = getMarketConstants('SG');
    
    switch (accountCategory) {
      case ACCOUNT_CATEGORIES.CORPORATE:
        return marketConstants.ACCOUNT_GROUPS.CORPORATE;
      case ACCOUNT_CATEGORIES.RETAIL:
        return marketConstants.ACCOUNT_GROUPS.RETAIL;
      default:
        return marketConstants.ACCOUNT_GROUPS.SGB;
    }
  }
} 