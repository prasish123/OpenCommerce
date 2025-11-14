/**
 * Artillery Load Test Processor
 * Custom functions and logic for load tests
 */

const axios = require('axios');

// Login once and reuse token
let authToken = null;
let tokenExpiry = null;

/**
 * Before scenario - login and get auth token
 */
async function login(userContext, events, done) {
  // Check if token is still valid
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    userContext.vars.authToken = authToken;
    return done();
  }

  try {
    const response = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'load_test_user',
      password: 'LoadTest123!',
      terminalId: 'TERMINAL-LOAD-TEST',
    });

    if (response.data.success) {
      authToken = response.data.token;
      tokenExpiry = Date.now() + (20 * 60 * 1000); // 20 minutes
      userContext.vars.authToken = authToken;
    }
  } catch (error) {
    console.error('Login failed:', error.message);
  }

  done();
}

/**
 * Generate random barcode
 */
function randomBarcode(userContext, events, done) {
  userContext.vars.randomBarcode = Math.floor(Math.random() * 9000000000000) + 1000000000000;
  done();
}

/**
 * Generate random date (last 30 days)
 */
function randomDate(userContext, events, done) {
  const now = new Date();
  const past = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const randomTime = past.getTime() + Math.random() * (now.getTime() - past.getTime());
  userContext.vars.randomDate = new Date(randomTime).toISOString();
  done();
}

/**
 * Get current timestamp
 */
function now(userContext, events, done) {
  userContext.vars.now = new Date().toISOString();
  done();
}

/**
 * Custom metrics logging
 */
function logMetrics(userContext, events, done) {
  const metrics = {
    timestamp: new Date().toISOString(),
    scenario: userContext.scenario.name,
    userId: userContext._uid,
    requestCount: userContext._successCount + userContext._failureCount,
    successCount: userContext._successCount,
    failureCount: userContext._failureCount,
  };

  console.log('METRICS:', JSON.stringify(metrics));
  done();
}

module.exports = {
  login,
  randomBarcode,
  randomDate,
  now,
  logMetrics,
};
