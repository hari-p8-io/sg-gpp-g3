import { 
  MARKET_BANKING_CONSTANTS, 
  getMarketConstants, 
  SINGAPORE_BANKING_CONSTANTS,
  ACCOUNT_TYPES,
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUS
} from './constants';

export class AccountUtils {
  
  /**
   * Get account system based on account pattern (Singapore implementation)
   */
  static getAccountSystem(accountId: string, market: string = 'SG'): string {
    const marketConstants = getMarketConstants(market);
    
    // VAM accounts always use VAM system
    if (accountId.startsWith('999') || accountId.includes('VAM')) {
      return marketConstants.ACCOUNT_SYSTEMS.VAM || 'VAM';
    }
    
    // Singapore-specific account system logic
    if (accountId.startsWith('888') || accountId.includes('CORP')) {
      return marketConstants.ACCOUNT_SYSTEMS.FAST;
    }
    
    // Default to MEPS for Singapore
    return marketConstants.ACCOUNT_SYSTEMS.MEPS;
  }

  /**
   * Get random bank code (Singapore implementation)
   */
  static getRandomBankCode(market: string = 'SG'): string {
    const marketConstants = getMarketConstants(market);
    const bankCodes = Object.values(marketConstants.BANK_CODES);
    return bankCodes[Math.floor(Math.random() * bankCodes.length)];
  }

  /**
   * Get random branch code (Singapore implementation)
   */
  static getRandomBranchCode(market: string = 'SG'): string {
    const marketConstants = getMarketConstants(market);
    const branchCodes = Object.values(marketConstants.BRANCH_CODES);
    return branchCodes[Math.floor(Math.random() * branchCodes.length)];
  }

  /**
   * Get account type based on account pattern
   */
  static getAccountType(accountId: string): string {
    if (accountId.includes('GOVT')) {
      return ACCOUNT_TYPES.GOVERNMENT;
    } else if (accountId.includes('CORP') || accountId.startsWith('888')) {
      return ACCOUNT_TYPES.CORPORATE;
    } else if (accountId.includes('UTIL')) {
      return ACCOUNT_TYPES.UTILITY;
    } else if (accountId.includes('VIRT')) {
      return ACCOUNT_TYPES.VIRTUAL;
    }
    return ACCOUNT_TYPES.PHYSICAL;
  }

  /**
   * Get account category based on account pattern
   */
  static getAccountCategory(accountId: string): string {
    if (accountId.includes('GOVT')) {
      return ACCOUNT_CATEGORIES.GOVERNMENT;
    } else if (accountId.includes('CORP') || accountId.startsWith('888')) {
      return ACCOUNT_CATEGORIES.CORPORATE;
    } else if (accountId.includes('UTIL')) {
      return ACCOUNT_CATEGORIES.UTILITY;
    }
    return ACCOUNT_CATEGORIES.RETAIL;
  }

  /**
   * Get account group based on account category (Singapore implementation)
   */
  static getAccountGroup(accountCategory: string, market: string = 'SG'): string {
    const marketConstants = getMarketConstants(market);
    
    switch (accountCategory) {
      case ACCOUNT_CATEGORIES.CORPORATE:
        return marketConstants.ACCOUNT_GROUPS.CORPORATE;
      case ACCOUNT_CATEGORIES.RETAIL:
        return marketConstants.ACCOUNT_GROUPS.RETAIL;
      default:
        return marketConstants.ACCOUNT_GROUPS.SGB; // Singapore Banking Group
    }
  }

  /**
   * Generate formatted date (DD/MM/YYYY format for Singapore)
   */
  static formatDateForMarket(date: Date, market: string = 'SG'): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  }

  /**
   * Get default currency (Singapore implementation)
   */
  static getMarketCurrency(market: string = 'SG'): string {
    const marketConstants = getMarketConstants(market);
    return marketConstants.CURRENCY_CODE;
  }

  /**
   * Get default country code (Singapore implementation)
   */
  static getMarketCountryCode(market: string = 'SG'): string {
    const marketConstants = getMarketConstants(market);
    return marketConstants.COUNTRY_CODE;
  }
} 