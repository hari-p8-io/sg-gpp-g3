export const SINGAPORE_TEST_ACCOUNTS = {
  STANDARD_RETAIL: {
    accountId: '123456789012',
    accountType: 'RETAIL',
    expectedAuthMethod: 'AFPONLY',
    expectedSystem: 'MDZ',
    routingHint: 'MDZ'
  },
  VAM_ACCOUNT: {
    accountId: '999888777666',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'GROUPLIMIT',
    expectedSystem: 'VAM',
    routingHint: 'VAM'
  },
  CORPORATE_ACCOUNT: {
    accountId: '888777666555',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedSystem: 'MEPS',
    routingHint: 'CORPORATE'
  },
  GOVERNMENT_ACCOUNT: {
    accountId: '777666555444',
    accountType: 'GOVERNMENT',
    expectedAuthMethod: 'AFPTHENLIMIT',
    expectedSystem: 'MEPS',
    routingHint: 'GOVERNMENT'
  },
  HIGH_VALUE_ACCOUNT: {
    accountId: '666555444333',
    accountType: 'CORPORATE',
    expectedAuthMethod: 'GROUPLIMIT',
    expectedSystem: 'VAM',
    routingHint: 'HIGH_VALUE'
  }
};

export const SINGAPORE_ACCOUNT_TYPES = ['RETAIL', 'CORPORATE', 'GOVERNMENT'] as const;
export type SingaporeAccountType = typeof SINGAPORE_ACCOUNT_TYPES[number];

export const SINGAPORE_BANK_CODES = [
  'DBSSSGSG',
  'OCBCSGSG', 
  'UOBSSGSG',
  'POSB',
  'MASSGSG'
];

export const SINGAPORE_TEST_CONFIG = {
  currency: 'SGD',
  country: 'SG',
  timezone: 'Asia/Singapore',
  defaultAmount: '1000.00',
  maxAmount: '999999.99'
}; 