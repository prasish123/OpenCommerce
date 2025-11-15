# OpenCommerce Operations Runbook

Day-to-day operations guide for managing OpenCommerce POS in production.

**Last Updated**: November 15, 2025
**Version**: 1.0

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Common Tasks](#common-tasks)
3. [Incident Response](#incident-response)
4. [Performance Optimization](#performance-optimization)
5. [Data Management](#data-management)
6. [Compliance & Auditing](#compliance--auditing)
7. [Maintenance Windows](#maintenance-windows)
8. [Emergency Procedures](#emergency-procedures)

---

## Daily Operations

### Morning Checklist (Store Opening)

```bash
# 1. Check system health
curl https://pos.yourstore.com/health

# 2. Verify database connectivity
pm2 logs opencommerce-api --lines 10 | grep "Database connection established"

# 3. Check overnight sync status
curl https://pos.yourstore.com/api/sync/status
```

### Evening Checklist (Store Closing)

```bash
# 1. Force sync if needed
curl -X POST https://pos.yourstore.com/api/sync/force \
  -H "Content-Type: application/json" \
  -d '{"storeId": "STORE_001", "terminalId": "POS-001"}'

# 2. Check for pending conflicts
curl https://pos.yourstore.com/api/sync/conflicts/pending

# 3. Review logs for errors
pm2 logs opencommerce-api --lines 100 | grep ERROR

# 4. Verify backups completed
ls -lh /backups/postgres/ | tail -5
```

---

## Common Tasks

### 1. User Management

**Create New User**:
```bash
# Use the seed data script as template or via API:
curl -X POST https://pos.yourstore.com/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "cashier2",
    "pin": "1234",
    "role": "CASHIER",
    "firstName": "Jane",
    "lastName": "Doe"
  }'
```

**Deactivate User**:
```bash
curl -X POST https://pos.yourstore.com/api/users/{userId}/deactivate \
  -H "Content-Type: application/json" \
  -d '{"deactivatedBy": "admin1"}'
```

**Reset PIN**:
```bash
curl -X PATCH https://pos.yourstore.com/api/users/{userId}/pin \
  -H "Content-Type: application/json" \
  -d '{"newPin": "5678"}'
```

### 2. Product Management

**Add New Product**:
```bash
curl -X POST https://pos.yourstore.com/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "barcode": "123456789",
    "description": "Product Name",
    "basePrice": 9.99,
    "category": "BEER",
    "requiresAgeVerification": true,
    "active": true
  }'
```

**Update Inventory**:
```bash
curl -X POST https://pos.yourstore.com/api/inventory/adjust \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "uuid-here",
    "storeId": "STORE_001",
    "adjustment": 50,
    "reason": "RECEIVING"
  }'
```

### 3. Sync Conflict Resolution

**List Pending Conflicts**:
```bash
curl https://pos.yourstore.com/api/sync/conflicts/pending
```

**Resolve Conflict (Server Wins)**:
```bash
curl -X POST https://pos.yourstore.com/api/sync/conflicts/{conflictId}/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "SERVER_WINS",
    "resolvedBy": "manager1"
  }'
```

**Resolve Conflict (Local Wins)**:
```bash
curl -X POST https://pos.yourstore.com/api/sync/conflicts/{conflictId}/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "LOCAL_WINS",
    "resolvedBy": "manager1"
  }'
```

### 4. Age Verification Photo Retrieval

**Get Photo for Audit**:
```bash
# Download photo for compliance audit
curl https://pos.yourstore.com/api/compliance/age-verification-photo/{fileName} \
  -o verification_photo.jpg
```

**Manual Cleanup**:
```bash
# Photos older than 365 days are auto-deleted
# Manual cleanup if needed:
find /path/to/OpenCommerce/data/age-verification-photos/ -mtime +365 -delete
```

### 5. Receipt Reprinting

**Reprint Receipt**:
```bash
curl -X POST https://pos.yourstore.com/api/receipt/print \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-uuid-here"
  }'
```

---

## Incident Response

### Severity Levels

**P0 - Critical** (Response: Immediate)
- POS system completely down
- Payment processing failing
- Data corruption/loss
- Security breach

**P1 - High** (Response: < 1 hour)
- Performance degradation (>5s response times)
- Partial system outage
- Integration failures (DoorDash, Uber Eats)

**P2 - Medium** (Response: < 4 hours)
- Non-critical features broken
- Sync conflicts requiring manual intervention
- Printer/scanner issues

**P3 - Low** (Response: Next business day)
- Cosmetic issues
- Feature requests
- Documentation updates

### Incident Response Workflow

1. **Acknowledge**
   ```bash
   # Create incident ticket
   # Notify on-call team
   # Post status update
   ```

2. **Assess**
   ```bash
   # Check system health
   curl https://pos.yourstore.com/health

   # Check logs
   pm2 logs opencommerce-api --lines 500

   # Check database
   sudo -u postgres psql opencommerce -c "SELECT COUNT(*) FROM order_service.retail_transactions WHERE created_at > NOW() - INTERVAL '1 hour';"
   ```

3. **Mitigate**
   ```bash
   # Restart services if needed
   pm2 restart opencommerce-api

   # Clear cache if needed
   redis-cli FLUSHALL

   # Rollback if needed
   git checkout <previous-commit>
   npm run build
   pm2 restart opencommerce-api
   ```

4. **Resolve**
   - Apply fix
   - Test thoroughly
   - Deploy to production
   - Monitor for 1 hour

5. **Document**
   - Write post-mortem
   - Update runbook
   - Create preventive measures

### Common Incident Scenarios

#### Scenario 1: POS System Down

**Symptoms**: Cannot access POS, health check failing

**Diagnosis**:
```bash
# Check if process is running
pm2 status

# Check if port is listening
sudo lsof -i :3000

# Check system resources
htop
df -h
```

**Resolution**:
```bash
# Restart application
pm2 restart opencommerce-api

# If that doesn't work, rebuild and restart
cd /path/to/OpenCommerce
git pull
npm install
npm run build
pm2 restart opencommerce-api
```

#### Scenario 2: Payment Processing Failing

**Symptoms**: Stripe payments returning errors

**Diagnosis**:
```bash
# Check Stripe API status
curl https://status.stripe.com/api/v2/status.json

# Check logs for Stripe errors
pm2 logs opencommerce-api | grep -i stripe

# Verify Stripe keys in environment
pm2 env 0 | grep STRIPE
```

**Resolution**:
```bash
# If keys are wrong, update .env
nano .env
pm2 restart opencommerce-api

# If Stripe is down, use offline mode
# Transactions will sync when service restores
```

#### Scenario 3: Database Connection Lost

**Symptoms**: "Database connection failed" errors

**Diagnosis**:
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE datname='opencommerce';"

# Check disk space
df -h
```

**Resolution**:
```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# If disk is full, clear old logs
sudo journalctl --vacuum-time=7d

# Restart application
pm2 restart opencommerce-api
```

---

## Performance Optimization

### Database Optimization

**Analyze Slow Queries**:
```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**Vacuum and Analyze**:
```bash
# Run weekly
sudo -u postgres psql opencommerce -c "VACUUM ANALYZE;"
```

**Index Optimization**:
```sql
-- Check missing indexes
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY abs(correlation) DESC;
```

### Redis Optimization

**Monitor Memory**:
```bash
redis-cli INFO memory
```

**Clear Old Keys**:
```bash
# Set TTL on session keys
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Application Performance

**PM2 Cluster Mode** (for multi-core):
```bash
pm2 delete opencommerce-api
pm2 start dist/main.js --name opencommerce-api -i max
pm2 save
```

**Enable Compression**:
```javascript
// Already enabled in main.ts via helmet
// Verify gzip is working:
curl -H "Accept-Encoding: gzip" https://pos.yourstore.com/health -I
```

---

## Data Management

### Data Retention

**Transaction Data**: Keep indefinitely (legal requirement)
**Age Verification Photos**: 365 days (automatic cleanup)
**Audit Logs**: 7 years (compliance requirement)
**Session Data**: 24 hours (Redis TTL)

### Data Export

**Export Transactions** (for accounting):
```bash
sudo -u postgres psql opencommerce -c "COPY (
  SELECT
    id,
    created_at,
    total_amount,
    channel,
    status
  FROM order_service.retail_transactions
  WHERE created_at::date = CURRENT_DATE
) TO '/tmp/transactions_today.csv' WITH CSV HEADER;"
```

**Export Inventory** (for audits):
```bash
sudo -u postgres psql opencommerce -c "COPY (
  SELECT
    p.barcode,
    p.description,
    i.quantity_on_hand,
    i.quantity_reserved
  FROM product_service.products p
  LEFT JOIN inventory_service.inventory i ON p.id = i.product_id
  WHERE i.store_id = 'STORE_001'
) TO '/tmp/inventory.csv' WITH CSV HEADER;"
```

### Data Cleanup

**Clear Old Sessions**:
```bash
redis-cli --scan --pattern "session:*" | xargs redis-cli DEL
```

**Archive Old Logs**:
```bash
# Archive logs older than 90 days
find /path/to/OpenCommerce/logs -name "*.log" -mtime +90 -exec gzip {} \;
mv /path/to/OpenCommerce/logs/*.gz /backups/logs/
```

---

## Compliance & Auditing

### PCI DSS Compliance

**Quarterly Tasks**:
- [ ] Review user access logs
- [ ] Verify encryption keys rotated
- [ ] Scan for vulnerabilities
- [ ] Review firewall rules
- [ ] Test backup restoration

**Annual Tasks**:
- [ ] Complete SAQ A questionnaire
- [ ] Security audit
- [ ] Update security policies
- [ ] Staff security training

### Age Verification Audits

**Retrieve Verification Records**:
```bash
sudo -u postgres psql opencommerce -c "
SELECT
  id,
  transaction_id,
  verified_at,
  driver_license_number,
  verified_by,
  id_photo_url
FROM compliance_service.age_verification_logs
WHERE verified_at >= NOW() - INTERVAL '30 days'
ORDER BY verified_at DESC;
"
```

**Generate Compliance Report**:
```bash
sudo -u postgres psql opencommerce -c "
SELECT
  DATE(verified_at) as date,
  COUNT(*) as verifications,
  COUNT(DISTINCT verified_by) as staff_count,
  COUNT(id_photo_url) as photos_stored
FROM compliance_service.age_verification_logs
WHERE verified_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(verified_at)
ORDER BY date DESC;
"
```

---

## Maintenance Windows

### Weekly Maintenance (Sunday 2 AM - 4 AM)

```bash
#!/bin/bash
# Weekly maintenance script

# 1. Database optimization
sudo -u postgres psql opencommerce -c "VACUUM ANALYZE;"

# 2. Update application
cd /path/to/OpenCommerce
git pull
npm install
npm run build

# 3. Restart services
pm2 restart all

# 4. Clear old logs
find logs/ -name "*.log" -mtime +90 -delete

# 5. Test health
sleep 10
curl https://pos.yourstore.com/health

# 6. Notify completion
echo "Maintenance completed" | mail -s "Weekly Maintenance" admin@yourstore.com
```

### Monthly Maintenance

- [ ] Review and update SSL certificates
- [ ] Security patches (OS, dependencies)
- [ ] Backup verification and test restore
- [ ] Performance review and optimization
- [ ] Capacity planning review

---

## Emergency Procedures

### Emergency Rollback

```bash
# 1. Stop current version
pm2 stop opencommerce-api

# 2. Checkout previous version
cd /path/to/OpenCommerce
git log --oneline -10  # Find last good commit
git checkout <commit-hash>

# 3. Rebuild and restart
npm install
npm run build
pm2 restart opencommerce-api

# 4. Verify
curl https://pos.yourstore.com/health
```

### Emergency Database Restore

```bash
# 1. Stop application
pm2 stop opencommerce-api

# 2. Restore from backup
gunzip < /backups/postgres/opencommerce_YYYYMMDD.sql.gz | \
  sudo -u postgres psql opencommerce

# 3. Restart application
pm2 restart opencommerce-api

# 4. Verify data integrity
sudo -u postgres psql opencommerce -c "SELECT COUNT(*) FROM order_service.retail_transactions;"
```

### Communication Template

**Incident Notification**:
```
Subject: [P{severity}] OpenCommerce POS Incident - {Brief Description}

INCIDENT DETAILS:
- Severity: P{0-3}
- Status: Investigating/Mitigating/Resolved
- Impact: {description}
- Start Time: {timestamp}
- Affected Systems: {list}

CURRENT STATUS:
{what's happening now}

NEXT STEPS:
{what we're doing}

ETA for Resolution: {estimate}

Updates will be posted every {interval}.
```

---

## Contacts

### Escalation Path

1. **On-Call Engineer**: (phone number)
2. **Engineering Manager**: (phone number)
3. **CTO**: (phone number)

### Vendor Support

- **Stripe Support**: https://support.stripe.com
- **Cloud Provider**: (support link)
- **Database Provider**: (support link)

---

## Useful Commands Cheat Sheet

```bash
# System Status
pm2 status
pm2 monit
pm2 logs --lines 100

# Database
sudo -u postgres psql opencommerce
\dt order_service.*
SELECT COUNT(*) FROM order_service.retail_transactions;

# Redis
redis-cli
KEYS *
DBSIZE

# Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo tail -f /var/log/nginx/error.log

# Backups
ls -lh /backups/postgres/
pg_dump opencommerce | gzip > backup.sql.gz

# SSL
sudo certbot certificates
sudo certbot renew

# Health Checks
curl https://pos.yourstore.com/health
curl https://pos.yourstore.com/api/sync/status
```

---

**Version**: 1.0
**Maintained By**: OpenCommerce Operations Team
**Last Updated**: November 15, 2025
**Next Review**: December 15, 2025
