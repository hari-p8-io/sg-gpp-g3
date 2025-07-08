export const SINGAPORE_BANKING_CONSTANTS = {
  COUNTRY_CODE: "SG",
  CURRENCY_CODE: "SGD",
  TIMEZONE: "Asia/Singapore",
  BANK_CODES: {
    ANZ: "ANZBSG3MXXX",
    DBS: "DBSSSGSGXXX",
    OCBC: "OCBCSGSGXXX",
    UOB: "UOVBSGSGXXX"
  },
  ACCOUNT_SYSTEMS: {
    MDZ: "MDZ", // Main clearing system
    MEPS: "MEPS", // Electronic payment system
    FAST: "FAST" // Fast payment system
  },
  ACCOUNT_GROUPS: {
    SGB: "SGB", // Singapore Banking Group
    RETAIL: "RETAIL",
    CORPORATE: "CORPORATE"
  },
  BRANCH_CODES: {
    MAIN: "001",
    ORCHARD: "002",
    RAFFLES: "003",
    MARINA: "004"
  }
};

export const ERROR_CODES = {
  INVALID_INPUT: "LOOKUP_INVALID_INPUT_001",
  ACCOUNT_NOT_FOUND: "LOOKUP_ACCOUNT_NOT_FOUND_002",
  ACCOUNT_INACTIVE: "LOOKUP_ACCOUNT_INACTIVE_003",
  PROCESSING_ERROR: "LOOKUP_PROCESSING_ERROR_004",
  TIMEOUT: "LOOKUP_TIMEOUT_005",
  RATE_LIMIT: "LOOKUP_RATE_LIMIT_006"
};

export const ACCOUNT_TYPES = {
  PHYSICAL: "Physical",
  VIRTUAL: "Virtual",
  CORPORATE: "Corporate",
  GOVERNMENT: "Government",
  UTILITY: "Utility"
};

export const ACCOUNT_CATEGORIES = {
  RETAIL: "RETAIL",
  CORPORATE: "CORPORATE",
  GOVERNMENT: "GOVERNMENT",
  UTILITY: "UTILITY"
};

export const ACCOUNT_STATUS = {
  ACTIVE: "Active",
  CLOSED: "Closed",
  SUSPENDED: "Suspended",
  DORMANT: "Dormant"
}; 