import { EnrichmentData } from '../types/accountLookup';
import { AccountUtils } from '../utils/accountUtils';
import { DateUtils } from '../utils/dateUtils';
import { SINGAPORE_BANKING_CONSTANTS, ACCOUNT_STATUS } from '../utils/constants';
import { logger } from '../utils/logger';

export class MockDataGenerator {
  
  static generateMockEnrichmentData(cdtrAcctId: string, messageType: string): EnrichmentData {
    logger.debug('Generating mock enrichment data', { cdtrAcctId, messageType });
    
    const normalizedAcctId = AccountUtils.normalizeAccountId(cdtrAcctId);
    const accountType = AccountUtils.determineAccountType(cdtrAcctId);
    const accountCategory = AccountUtils.determineAccountCategory(cdtrAcctId);
    const accountSystem = AccountUtils.getAccountSystem(accountType, cdtrAcctId); // Pass accountId for VAM routing
    const accountGroup = AccountUtils.getAccountGroup(accountCategory);
    const branchId = AccountUtils.generateBranchId(cdtrAcctId);
    
    const physicalAcctInfo: any = {
      acctId: cdtrAcctId,
      acctSys: accountSystem,
      acctGroup: accountGroup,
      country: SINGAPORE_BANKING_CONSTANTS.COUNTRY_CODE,
      acctAttributes: {
        acctType: accountType,
        acctCategory: accountCategory,
        acctPurpose: this.generateAccountPurpose(accountType)
      },
      acctOpsAttributes: {
        isActive: "Yes",
        acctStatus: ACCOUNT_STATUS.ACTIVE,
        openDate: DateUtils.generateOpenDate(),
        expiryDate: DateUtils.generateExpiryDate(),
        restraints: {
          stopAll: "N",
          stopDebits: "N",
          stopCredits: "N",
          stopAtm: "N",
          stopEftPos: "N",
          stopUnknown: "N",
          warnings: "None"
        }
      },
      bicfi: AccountUtils.getDefaultBankCode(),
      currencyCode: SINGAPORE_BANKING_CONSTANTS.CURRENCY_CODE
    };

    if (branchId) {
      physicalAcctInfo.branchId = branchId;
    }
    
    return {
      receivedAcctId: cdtrAcctId,
      lookupStatusCode: 200,
      lookupStatusDesc: "Success",
      normalizedAcctId,
      matchedAcctId: cdtrAcctId,
      partialMatch: "N",
      isPhysical: "Y",
      physicalAcctInfo
    };
  }

  static generateAccountNotFoundResponse(cdtrAcctId: string): EnrichmentData {
    logger.debug('Generating account not found response', { cdtrAcctId });
    
    return {
      receivedAcctId: cdtrAcctId,
      lookupStatusCode: 404,
      lookupStatusDesc: "Account not found in system",
      normalizedAcctId: AccountUtils.normalizeAccountId(cdtrAcctId),
      matchedAcctId: cdtrAcctId,
      partialMatch: "N",
      isPhysical: "UNKNOWN"
    };
  }

  static generateAccountInactiveResponse(cdtrAcctId: string): EnrichmentData {
    logger.debug('Generating account inactive response', { cdtrAcctId });
    
    const normalizedAcctId = AccountUtils.normalizeAccountId(cdtrAcctId);
    const accountType = AccountUtils.determineAccountType(cdtrAcctId);
    const accountCategory = AccountUtils.determineAccountCategory(cdtrAcctId);
    const accountSystem = AccountUtils.getAccountSystem(accountType, cdtrAcctId); // Pass accountId for VAM routing
    const accountGroup = AccountUtils.getAccountGroup(accountCategory);
    const branchId = AccountUtils.generateBranchId(cdtrAcctId);
    
    const physicalAcctInfo: any = {
      acctId: cdtrAcctId,
      acctSys: accountSystem,
      acctGroup: accountGroup,
      country: SINGAPORE_BANKING_CONSTANTS.COUNTRY_CODE,
      acctAttributes: {
        acctType: accountType,
        acctCategory: accountCategory,
        acctPurpose: this.generateAccountPurpose(accountType)
      },
      acctOpsAttributes: {
        isActive: "No",
        acctStatus: ACCOUNT_STATUS.SUSPENDED,
        openDate: DateUtils.generateOpenDate(),
        expiryDate: DateUtils.generateExpiryDate(),
        restraints: {
          stopAll: "Y",
          stopDebits: "Y",
          stopCredits: "Y",
          stopAtm: "Y",
          stopEftPos: "Y",
          stopUnknown: "Y",
          warnings: "Account suspended"
        }
      },
      bicfi: AccountUtils.getDefaultBankCode(),
      currencyCode: SINGAPORE_BANKING_CONSTANTS.CURRENCY_CODE
    };

    if (branchId) {
      physicalAcctInfo.branchId = branchId;
    }
    
    return {
      receivedAcctId: cdtrAcctId,
      lookupStatusCode: 200,
      lookupStatusDesc: "Account found but inactive",
      normalizedAcctId,
      matchedAcctId: cdtrAcctId,
      partialMatch: "N",
      isPhysical: "Y",
      physicalAcctInfo
    };
  }

  static generateProcessingErrorResponse(cdtrAcctId: string): EnrichmentData {
    logger.debug('Generating processing error response', { cdtrAcctId });
    
    return {
      receivedAcctId: cdtrAcctId,
      lookupStatusCode: 500,
      lookupStatusDesc: "Internal processing error",
      normalizedAcctId: AccountUtils.normalizeAccountId(cdtrAcctId),
      matchedAcctId: cdtrAcctId,
      partialMatch: "N",
      isPhysical: "UNKNOWN"
    };
  }

  private static generateAccountPurpose(accountType: string): string {
    switch (accountType) {
      case 'Corporate':
        return 'BUSINESS_OPERATIONS';
      case 'Government':
        return 'GOVERNMENT_SERVICES';
      case 'Utility':
        return 'UTILITY_SERVICES';
      default:
        return 'GENERAL_BANKING';
    }
  }

  static generateVariedMockData(cdtrAcctId: string, messageType: string): EnrichmentData {
    // Add some variation to mock data based on account ID characteristics
    const normalizedId = AccountUtils.normalizeAccountId(cdtrAcctId);
    const baseData = this.generateMockEnrichmentData(cdtrAcctId, messageType);
    
    // Vary some fields for more realistic testing
    if (normalizedId.length > 15 && baseData.physicalAcctInfo) {
      baseData.physicalAcctInfo.acctOpsAttributes.restraints.warnings = "High-value account";
    }
    
    if (normalizedId.includes('PREMIUM') && baseData.physicalAcctInfo) {
      baseData.physicalAcctInfo.acctAttributes.acctCategory = 'PREMIUM';
    }
    
    if (normalizedId.includes('BUSINESS') && baseData.physicalAcctInfo) {
      baseData.physicalAcctInfo.acctAttributes.acctCategory = 'BUSINESS';
    }
    
    return baseData;
  }

  static async simulateDelay(delayMs: number): Promise<void> {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
} 