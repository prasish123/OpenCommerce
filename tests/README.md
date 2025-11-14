# OpenCommerce POS Testing Suite

Comprehensive testing infrastructure for the OpenCommerce POS system.

## Test Types

### 1. Integration Tests

End-to-end tests that verify complete user flows work correctly.

**Location**: `tests/integration/`

**Run**:
```bash
npm run test:integration
```

**Tests**:
- `01-auth.test.ts`: Authentication flow (login, PIN, logout)
- `02-pos-transaction-flow.test.ts`: Complete POS checkout (cart → checkout → payment → inventory update)

**Coverage**:
- ✅ User authentication (username/password + PIN)
- ✅ Product lookup and scanning
- ✅ Cart management
- ✅ Age verification
- ✅ Payment processing
- ✅ Inventory management
- ✅ Loyalty points
- ✅ Error handling

### 2. Load Tests

Performance testing to ensure system can handle required throughput.

**Location**: `tests/load/`

**Requirements**:
- **Baseline**: 15 TPS (transactions per second)
- **Peak**: 10,000 TPS

**Tools**:
- **Artillery**: `artillery-config.yml`
- **K6**: `k6-load-test.js`

**Run Artillery**:
```bash
npm run test:load:artillery
```

**Run K6**:
```bash
npm run test:load:k6
```

**Test Phases**:
1. Warm-up: 5 TPS for 1 minute
2. Baseline: 15 TPS for 5 minutes
3. Ramp-up: 15 → 100 TPS over 2 minutes
4. High load: 100 → 1,000 TPS over 5 minutes
5. Peak: 1,000 → 10,000 TPS over 2 minutes
6. Sustained peak: 10,000 TPS for 1 minute
7. Cool-down: 10,000 → 15 TPS over 2 minutes

**Traffic Distribution**:
- 40%: Product lookups
- 30%: Complete POS transactions
- 20%: Order queue polling
- 10%: Analytics dashboard

**SLAs**:
- P95 response time: < 200ms
- P99 response time: < 500ms
- Error rate: < 1%
- Transaction completion: P95 < 5s, P99 < 10s

### 3. Regression Tests

API contract testing to prevent breaking changes.

**Location**: `tests/regression/`

**Run**:
```bash
npm run test:regression
```

**Tests**:
- API contract validation (JSON schema)
- Backward compatibility
- Error response formats
- Deprecated endpoint support

**Coverage**:
- ✅ Authentication API
- ✅ Product API
- ✅ Cart API
- ✅ Order API
- ✅ Analytics API
- ✅ Error responses (400, 401, 404)

## Running All Tests

```bash
# Run all test suites
npm test

# Run specific suite
npm run test:integration
npm run test:load:artillery
npm run test:load:k6
npm run test:regression

# Run with coverage
npm run test:coverage

# Watch mode (for development)
npm run test:watch
```

## Test Setup

### Prerequisites

1. **Node.js**: 20+
2. **PostgreSQL**: 16+
3. **Redis**: 7+
4. **Artillery**: `npm install -g artillery`
5. **K6**: Download from https://k6.io/docs/getting-started/installation

### Database Setup

```bash
# Create test database
createdb opencommerce_test

# Run migrations
npm run migrate:test

# Seed test data
npm run seed:test
```

### Environment Variables

Create `.env.test` file:

```env
NODE_ENV=test
DATABASE_URL=postgresql://localhost:5432/opencommerce_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=test_secret_key_change_in_production
```

## Test Data

Test users:
- **Cashier**: username: `test_cashier`, password: `password123`, PIN: `1234`
- **Manager**: username: `test_manager`, password: `manager123`, PIN: `5678`
- **Admin**: username: `test_admin`, password: `admin123`, PIN: `9999`

Test products:
- Beer 6-Pack: barcode `1234567890123`, price $12.99
- Wine Bottle: barcode `9876543210987`, price $19.99
- Spirits 750ml: barcode `5555555555555`, price $29.99

## CI/CD Integration

### GitHub Actions

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
      - run: npm run test:regression
      - run: npm run test:load:k6
```

## Performance Benchmarks

Expected performance on production hardware:
- **API response time**: P95 < 50ms, P99 < 100ms
- **Transaction processing**: P95 < 2s, P99 < 5s
- **Throughput**: 15 TPS sustained, 10K TPS peak (2-minute burst)
- **Database queries**: P95 < 10ms, P99 < 50ms
- **Memory usage**: < 2GB at baseline, < 8GB at peak
- **CPU usage**: < 30% at baseline, < 80% at peak

## Troubleshooting

### Tests Failing

1. **Database connection errors**:
   - Verify PostgreSQL is running: `pg_isready`
   - Check connection string in `.env.test`

2. **Authentication failures**:
   - Ensure test users exist in database
   - Check JWT_SECRET is set

3. **Timeout errors**:
   - Increase timeout in test config
   - Check system resources (CPU, memory)

### Load Tests Not Reaching Target TPS

1. **Increase system resources**:
   - More CPU cores
   - More memory
   - Faster disk I/O

2. **Optimize database**:
   - Add indexes
   - Tune PostgreSQL config
   - Enable connection pooling

3. **Scale horizontally**:
   - Run load tests from multiple machines
   - Use load balancer

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data in afterAll/afterEach
3. **Idempotency**: Tests should produce same results on repeated runs
4. **Speed**: Keep tests fast (integration < 10s, unit < 1s)
5. **Reliability**: No flaky tests - fix or remove
6. **Coverage**: Aim for 80%+ code coverage
7. **Realistic**: Use production-like test data

## Continuous Improvement

- Review test failures weekly
- Update load test scenarios quarterly
- Add regression tests for every bug fix
- Monitor test suite performance
- Keep test documentation up to date
