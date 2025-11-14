/**
 * K6 Load Test Script
 * Test 15 TPS baseline and peak 10K TPS
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const transactionDuration = new Trend('transaction_duration');
const successfulTransactions = new Counter('successful_transactions');
const failedTransactions = new Counter('failed_transactions');

// Test configuration
export const options = {
  stages: [
    // Warm-up: 5 VUs for 1 minute
    { duration: '1m', target: 5 },

    // Baseline: 15 VUs for 5 minutes (15 TPS)
    { duration: '5m', target: 15 },

    // Ramp-up to 100 VUs (100 TPS)
    { duration: '2m', target: 100 },

    // Ramp-up to 1000 VUs (1K TPS)
    { duration: '5m', target: 1000 },

    // Ramp-up to 10000 VUs (10K TPS)
    { duration: '2m', target: 10000 },

    // Sustained peak: 10K VUs for 1 minute
    { duration: '1m', target: 10000 },

    // Cool-down to baseline
    { duration: '2m', target: 15 },

    // Final cool-down
    { duration: '1m', target: 0 },
  ],

  // Thresholds (SLAs)
  thresholds: {
    // HTTP request duration
    http_req_duration: ['p(95)<200', 'p(99)<500'], // 95th percentile < 200ms, 99th < 500ms

    // HTTP request failed
    http_req_failed: ['rate<0.01'], // Error rate < 1%

    // Custom metrics
    errors: ['rate<0.01'],
    transaction_duration: ['p(95)<5000', 'p(99)<10000'], // Complete transaction < 5s (p95), < 10s (p99)
  },

  // System tags
  tags: {
    test_type: 'load',
    environment: 'staging',
  },
};

// Global variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
let authToken = '';

// Setup function - runs once at start
export function setup() {
  // Login to get auth token
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username: 'load_test_user',
    password: 'LoadTest123!',
    terminalId: 'TERMINAL-K6-TEST',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  const loginData = JSON.parse(loginRes.body);
  return { authToken: loginData.token };
}

// Main test function
export default function (data) {
  authToken = data.authToken;

  // Randomly select scenario based on traffic distribution
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Product Lookup
    productLookup();
  } else if (scenario < 0.7) {
    // 30% - Complete POS Transaction
    posTransactionFlow();
  } else if (scenario < 0.9) {
    // 20% - Order Queue Polling
    orderQueuePolling();
  } else {
    // 10% - Analytics Dashboard
    analyticsDashboard();
  }

  sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
}

/**
 * Scenario 1: Product Lookup
 */
function productLookup() {
  group('Product Lookup', () => {
    const barcode = Math.floor(Math.random() * 9000000000000) + 1000000000000;

    const res = http.get(`${BASE_URL}/api/products/barcode/${barcode}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const success = check(res, {
      'product lookup status is 200 or 404': (r) => r.status === 200 || r.status === 404,
      'product lookup response time < 200ms': (r) => r.timings.duration < 200,
    });

    errorRate.add(!success);
  });
}

/**
 * Scenario 2: Complete POS Transaction Flow
 */
function posTransactionFlow() {
  const startTime = new Date();

  group('POS Transaction Flow', () => {
    // Step 1: Create cart
    const createCartRes = http.post(`${BASE_URL}/api/cart`, JSON.stringify({
      storeId: 'STORE-001',
      terminalId: 'TERMINAL-K6-TEST',
    }), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    check(createCartRes, {
      'cart created': (r) => r.status === 201,
    });

    if (createCartRes.status !== 201) {
      errorRate.add(1);
      failedTransactions.add(1);
      return;
    }

    const cart = JSON.parse(createCartRes.body);
    const cartId = cart.id;

    sleep(1);

    // Step 2: Add items to cart
    const addItem1Res = http.post(`${BASE_URL}/api/cart/${cartId}/items`, JSON.stringify({
      barcode: '1234567890123',
      quantity: Math.floor(Math.random() * 5) + 1,
    }), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    check(addItem1Res, {
      'item 1 added': (r) => r.status === 200,
    });

    sleep(2);

    const addItem2Res = http.post(`${BASE_URL}/api/cart/${cartId}/items`, JSON.stringify({
      barcode: '9876543210987',
      quantity: Math.floor(Math.random() * 3) + 1,
    }), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    check(addItem2Res, {
      'item 2 added': (r) => r.status === 200,
    });

    sleep(3);

    // Step 3: Checkout
    const checkoutRes = http.post(`${BASE_URL}/api/cart/${cartId}/checkout`, JSON.stringify({
      tenders: [
        {
          tenderType: 'CREDIT_CARD',
          amount: 100,
        },
      ],
    }), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    const checkoutSuccess = check(checkoutRes, {
      'checkout successful': (r) => r.status === 200,
      'checkout response time < 1s': (r) => r.timings.duration < 1000,
    });

    if (checkoutSuccess) {
      successfulTransactions.add(1);
    } else {
      failedTransactions.add(1);
      errorRate.add(1);
    }

    // Track total transaction duration
    const endTime = new Date();
    transactionDuration.add(endTime - startTime);
  });
}

/**
 * Scenario 3: Order Queue Polling
 */
function orderQueuePolling() {
  group('Order Queue Polling', () => {
    // Get orders
    const getOrdersRes = http.get(`${BASE_URL}/api/orders?limit=50`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const success = check(getOrdersRes, {
      'orders fetched': (r) => r.status === 200,
      'orders response time < 200ms': (r) => r.timings.duration < 200,
    });

    errorRate.add(!success);

    if (success && getOrdersRes.body) {
      const orders = JSON.parse(getOrdersRes.body);
      if (orders.length > 0) {
        sleep(2);

        // Update first order status
        const orderId = orders[0].id;
        const updateStatusRes = http.put(`${BASE_URL}/api/orders/${orderId}/status`, JSON.stringify({
          status: 'ACCEPTED',
        }), {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        });

        check(updateStatusRes, {
          'order status updated': (r) => r.status === 200,
        });
      }
    }

    sleep(5);
  });
}

/**
 * Scenario 4: Analytics Dashboard
 */
function analyticsDashboard() {
  group('Analytics Dashboard', () => {
    // Real-time metrics
    const metricsRes = http.get(`${BASE_URL}/api/analytics/realtime/STORE-001`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    check(metricsRes, {
      'metrics fetched': (r) => r.status === 200,
    });

    // Trending products
    const trendingRes = http.get(`${BASE_URL}/api/analytics/trending?limit=20`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    check(trendingRes, {
      'trending products fetched': (r) => r.status === 200,
    });

    // Channel performance
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const channelRes = http.get(
      `${BASE_URL}/api/analytics/channels?startDate=${past}&endDate=${now}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    const success = check(channelRes, {
      'channel performance fetched': (r) => r.status === 200,
    });

    errorRate.add(!success);

    sleep(10);
  });
}

/**
 * Teardown function - runs once at end
 */
export function teardown(data) {
  // Logout
  http.post(`${BASE_URL}/api/auth/logout`, null, {
    headers: {
      Authorization: `Bearer ${data.authToken}`,
    },
  });
}
