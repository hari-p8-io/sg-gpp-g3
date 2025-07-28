#!/usr/bin/env node

const http = require('http');
const https = require('https');

const MOCK_ACCOUNTLOOKUP_URL = process.env.MOCK_ACCOUNTLOOKUP_URL || 'http://localhost:8080';
const MOCK_REFERENCEDATA_URL = process.env.MOCK_REFERENCEDATA_URL || 'http://localhost:8081';

/**
 * Setup mock expectations for account lookup service
 */
async function setupAccountLookupMocks() {
  console.log('Setting up Account Lookup service mocks...');
  
  const mockExpectations = [
    {
      httpRequest: {
        method: 'GET',
        path: '/account/.*',
        headers: {
          'Content-Type': ['application/json']
        }
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          success: true,
          data: {
            accountId: 'ACC123456789',
            accountName: 'Test Account',
            accountType: 'CURRENT',
            currency: 'SGD',
            status: 'ACTIVE',
            bankCode: 'DBSSSGSG',
            branchCode: '001'
          }
        })
      }
    },
    {
      httpRequest: {
        method: 'POST',
        path: '/account/validate',
        headers: {
          'Content-Type': ['application/json']
        }
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          success: true,
          valid: true,
          data: {
            accountId: 'ACC123456789',
            accountName: 'Test Account',
            currency: 'SGD',
            status: 'ACTIVE'
          }
        })
      }
    },
    {
      httpRequest: {
        method: 'GET',
        path: '/health'
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          status: 'healthy',
          service: 'mock-accountlookup',
          timestamp: new Date().toISOString()
        })
      }
    }
  ];

  for (const expectation of mockExpectations) {
    await sendMockExpectation(MOCK_ACCOUNTLOOKUP_URL, expectation);
  }
  
  console.log('Account Lookup service mocks set up successfully');
}

/**
 * Setup mock expectations for reference data service
 */
async function setupReferenceDataMocks() {
  console.log('Setting up Reference Data service mocks...');
  
  const mockExpectations = [
    {
      httpRequest: {
        method: 'GET',
        path: '/banks/.*',
        headers: {
          'Content-Type': ['application/json']
        }
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          success: true,
          data: {
            bankCode: 'DBSSSGSG',
            bankName: 'DBS Bank Ltd',
            country: 'SG',
            currency: 'SGD',
            active: true
          }
        })
      }
    },
    {
      httpRequest: {
        method: 'GET',
        path: '/currencies/.*',
        headers: {
          'Content-Type': ['application/json']
        }
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          success: true,
          data: {
            currency: 'SGD',
            name: 'Singapore Dollar',
            country: 'SG',
            active: true,
            decimalPlaces: 2
          }
        })
      }
    },
    {
      httpRequest: {
        method: 'POST',
        path: '/validate/bic',
        headers: {
          'Content-Type': ['application/json']
        }
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          success: true,
          valid: true,
          data: {
            bic: 'DBSSSGSG',
            bankName: 'DBS Bank Ltd',
            country: 'SG'
          }
        })
      }
    },
    {
      httpRequest: {
        method: 'GET',
        path: '/health'
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          'Content-Type': ['application/json']
        },
        body: JSON.stringify({
          status: 'healthy',
          service: 'mock-referencedata',
          timestamp: new Date().toISOString()
        })
      }
    }
  ];

  for (const expectation of mockExpectations) {
    await sendMockExpectation(MOCK_REFERENCEDATA_URL, expectation);
  }
  
  console.log('Reference Data service mocks set up successfully');
}

/**
 * Send mock expectation to MockServer
 */
async function sendMockExpectation(baseUrl, expectation) {
  const url = `${baseUrl}/mockserver/expectation`;
  const data = JSON.stringify(expectation);
  
  return new Promise((resolve, reject) => {
    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(url, options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseData);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Wait for mock server to be ready
 */
async function waitForMockServer(url, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`${url}/mockserver/status`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(5000, () => reject(new Error('Timeout')));
      });
      
      return true;
    } catch (error) {
      console.log(`Waiting for mock server at ${url}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error(`Mock server at ${url} not ready within ${timeout}ms`);
}

/**
 * Main function to set up all mock servers
 */
async function main() {
  try {
    console.log('Setting up mock servers for CI testing...');
    
    // Wait for mock servers to be ready
    await waitForMockServer(MOCK_ACCOUNTLOOKUP_URL);
    await waitForMockServer(MOCK_REFERENCEDATA_URL);
    
    // Set up mock expectations
    await setupAccountLookupMocks();
    await setupReferenceDataMocks();
    
    console.log('All mock servers set up successfully!');
    
    // Verify mocks are working
    console.log('Verifying mock setups...');
    await verifyMockSetup(MOCK_ACCOUNTLOOKUP_URL, '/health');
    await verifyMockSetup(MOCK_REFERENCEDATA_URL, '/health');
    
    console.log('Mock server setup completed successfully!');
    
  } catch (error) {
    console.error('Failed to set up mock servers:', error);
    process.exit(1);
  }
}

/**
 * Verify mock setup by making a test request
 */
async function verifyMockSetup(baseUrl, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✓ Mock server at ${baseUrl} is responding correctly`);
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => reject(new Error('Timeout')));
  });
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  setupAccountLookupMocks,
  setupReferenceDataMocks,
  waitForMockServer,
  main
}; 