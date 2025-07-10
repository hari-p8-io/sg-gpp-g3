export const SINGAPORE_TEST_ACCOUNTS = {
  VAM_ACCOUNT: {
    accountId: '123456789012',
    accountType: 'CORPORATE',
    bankCode: 'DBSSSGSG',
    expectedAuthMethod: 'BIOMETRIC',
    expectedSystem: 'VAM'
  },
  CORPORATE_ACCOUNT: {
    accountId: '456789012345',
    accountType: 'CORPORATE',
    bankCode: 'OCBCSGSG',
    expectedAuthMethod: 'TOKEN',
    expectedSystem: 'STANDARD'
  },
  STANDARD_RETAIL: {
    accountId: '789012345678',
    accountType: 'RETAIL',
    bankCode: 'UOBSSGSG',
    expectedAuthMethod: 'SMS',
    expectedSystem: 'STANDARD'
  },
  GOVERNMENT_ACCOUNT: {
    accountId: '901234567890',
    accountType: 'GOVERNMENT',
    bankCode: 'MASSGSG',
    expectedAuthMethod: 'CERTIFICATE',
    expectedSystem: 'GOVERNMENT'
  }
};

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