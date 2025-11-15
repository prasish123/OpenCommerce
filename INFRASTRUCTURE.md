# OpenCommerce Cloud Infrastructure Guide

Complete cloud infrastructure setup and configuration guide.

**Last Updated**: November 15, 2025
**Version**: 1.0

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Infrastructure as Code](#infrastructure-as-code)
3. [SSL/TLS Configuration](#ssltls-configuration)
4. [Monitoring Setup](#monitoring-setup)
5. [Backup Automation](#backup-automation)
6. [Security Hardening](#security-hardening)
7. [Cost Optimization](#cost-optimization)

---

## Architecture Overview

### Cloud-First Architecture (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                      Internet / Users                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                ┌────────▼────────┐
                │   Cloudflare    │  ← SSL/TLS, DDoS Protection
                │   (Optional)    │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │  Load Balancer  │  ← HTTPS Termination
                └────────┬────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
   │ App     │     │ App     │     │ App     │  ← Node.js POS App
   │Instance │     │Instance │     │Instance │     (Auto-scaling)
   └────┬────┘     └────┬────┘     └────┬────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────────┐  ┌───▼──────┐   ┌────▼──────┐
   │ PostgreSQL  │  │  Redis   │   │  S3/Blob  │  ← Managed Services
   │  (Primary)  │  │  Cache   │   │  Storage  │
   └─────────────┘  └──────────┘   └───────────┘
         │
   ┌─────▼──────┐
   │PostgreSQL  │  ← Read Replica (Optional)
   │ (Replica)  │
   └────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Monitoring & Logging Stack                                  │
│  - Sentry (Error Tracking)                                   │
│  - UptimeRobot (Uptime Monitoring)                          │
│  - CloudWatch/Datadog (Metrics)                             │
│  - Backups (S3/Glacier)                                      │
└──────────────────────────────────────────────────────────────┘
```

### Multi-Store Architecture

```
Store 1 (Ocala)         Store 2 (Tampa)        Store 3 (Orlando)
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  POS Client  │       │  POS Client  │       │  POS Client  │
│  (Browser)   │       │  (Browser)   │       │  (Browser)   │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                       │
       └──────────────────────┼───────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Central Cloud API │
                    │  Load Balanced     │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Central Database  │
                    │  (Multi-tenant)    │
                    └────────────────────┘
```

---

## Infrastructure as Code

### Docker Compose (Production)

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: opencommerce-postgres
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: opencommerce
      POSTGRES_MAX_CONNECTIONS: 200
      POSTGRES_SHARED_BUFFERS: 256MB
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - opencommerce-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: opencommerce-redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - opencommerce-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  app:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: opencommerce-app
    restart: always
    ports:
      - "3000:3000"
      - "8080:8080"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/opencommerce
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      PORT: 3000
      UI_PORT: 8080
      # Add all other env vars from .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - opencommerce-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  nginx:
    image: nginx:alpine
    container_name: opencommerce-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - /var/log/nginx:/var/log/nginx
    depends_on:
      - app
    networks:
      - opencommerce-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Optional: Backup service
  backup:
    image: postgres:16
    container_name: opencommerce-backup
    restart: always
    environment:
      PGHOST: postgres
      PGUSER: ${DB_USER}
      PGPASSWORD: ${DB_PASSWORD}
      PGDATABASE: opencommerce
      BACKUP_SCHEDULE: "0 2 * * *"  # 2 AM daily
      BACKUP_RETENTION_DAYS: 30
    volumes:
      - ./backups:/backups
      - ./scripts/backup.sh:/backup.sh:ro
    entrypoint: /bin/sh
    command: -c "crond -f"
    depends_on:
      - postgres
    networks:
      - opencommerce-network

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local

networks:
  opencommerce-network:
    driver: bridge
```

### Production Dockerfile

Create `Dockerfile.prod`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Create directories for data
RUN mkdir -p /app/data /app/logs && \
    chown -R nodejs:nodejs /app/data /app/logs

USER nodejs

EXPOSE 3000 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/main.js"]
```

### Nginx Configuration

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream opencommerce_api {
        least_conn;
        server app:3000 max_fails=3 fail_timeout=30s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

    server {
        listen 80;
        server_name _;

        # Redirect HTTP to HTTPS
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name pos.yourstore.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security Headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;

        # Client body size limit (for photo uploads)
        client_max_body_size 10M;

        # Logging
        access_log /var/log/nginx/access.log combined;
        error_log /var/log/nginx/error.log warn;

        # API endpoints
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://opencommerce_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Auth endpoints (stricter rate limit)
        location /api/auth/ {
            limit_req zone=auth_limit burst=5 nodelay;

            proxy_pass http://opencommerce_api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check (no rate limit)
        location /health {
            proxy_pass http://opencommerce_api;
            access_log off;
        }

        # Static files (if any)
        location /static/ {
            alias /app/static/;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

---

## SSL/TLS Configuration

### Let's Encrypt with Certbot

**Install Certbot**:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

**Obtain Certificate**:
```bash
sudo certbot --nginx -d pos.yourstore.com -d www.pos.yourstore.com
```

**Auto-Renewal** (already configured):
```bash
# Test renewal
sudo certbot renew --dry-run

# Check timer
sudo systemctl status certbot.timer
```

### Cloudflare SSL (Easier)

1. Add domain to Cloudflare
2. Set nameservers
3. SSL/TLS → Full (strict)
4. Edge Certificates → Always Use HTTPS: ON
5. Download Origin Certificate
6. Install on server

**Cloudflare Origin Certificate**:
```bash
# Save to /etc/nginx/ssl/
/etc/nginx/ssl/cloudflare-origin.pem
/etc/nginx/ssl/cloudflare-origin-key.pem

# Update nginx.conf
ssl_certificate /etc/nginx/ssl/cloudflare-origin.pem;
ssl_certificate_key /etc/nginx/ssl/cloudflare-origin-key.pem;
```

---

## Monitoring Setup

### 1. Sentry Error Tracking

**Install**:
```bash
npm install @sentry/node @sentry/profiling-node
```

**Configure** (`src/main.ts`):
```typescript
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: config.env,
  integrations: [
    new ProfilingIntegration(),
  ],
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
});

// Add to error handlers
app.use(Sentry.Handlers.errorHandler());
```

### 2. UptimeRobot

**Setup**:
1. Go to https://uptimerobot.com
2. Add Monitor:
   - Type: HTTPS
   - URL: `https://pos.yourstore.com/health`
   - Interval: 5 minutes
3. Alert Contacts:
   - Email: your-email@domain.com
   - SMS: (optional, paid)

**Health Check Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T12:00:00Z",
  "database": "connected",
  "redis": "connected",
  "uptime": 12345
}
```

### 3. Prometheus + Grafana (Advanced)

**Prometheus Config** (`prometheus.yml`):
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'opencommerce'
    static_configs:
      - targets: ['localhost:3000']
```

**Add Metrics Endpoint** (`src/main.ts`):
```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 4. Logging Aggregation

**CloudWatch Logs** (AWS):
```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

# Configure
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
```

**DataDog** (Alternative):
```bash
# Install DataDog agent
DD_API_KEY=<YOUR_API_KEY> DD_SITE="datadoghq.com" bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"

# Configure logs
sudo tee /etc/datadog-agent/conf.d/opencommerce.d/conf.yaml << EOF
logs:
  - type: file
    path: /path/to/OpenCommerce/logs/*.log
    service: opencommerce
    source: nodejs
EOF

sudo systemctl restart datadog-agent
```

---

## Backup Automation

### Automated Database Backups

**Backup Script** (`scripts/backup-automated.sh`):
```bash
#!/bin/bash

set -e

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups/postgres"
S3_BUCKET="s3://your-backup-bucket/opencommerce"
RETENTION_DAYS=30

# Local backup
mkdir -p $BACKUP_DIR
pg_dump -U opencommerce opencommerce | gzip > $BACKUP_DIR/opencommerce_$TIMESTAMP.sql.gz

# Upload to S3
aws s3 cp $BACKUP_DIR/opencommerce_$TIMESTAMP.sql.gz $S3_BUCKET/

# Cleanup old local backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Cleanup old S3 backups
aws s3 ls $S3_BUCKET/ | while read -r line; do
  createDate=$(echo $line | awk {'print $1" "$2'})
  createDate=$(date -d "$createDate" +%s)
  olderThan=$(date -d "$RETENTION_DAYS days ago" +%s)
  if [[ $createDate -lt $olderThan ]]; then
    fileName=$(echo $line | awk {'print $4'})
    aws s3 rm $S3_BUCKET/$fileName
  fi
done

# Log completion
echo "$(date): Backup completed - opencommerce_$TIMESTAMP.sql.gz" >> /var/log/opencommerce-backup.log
```

**Cron Job**:
```bash
crontab -e

# Daily at 2 AM
0 2 * * * /path/to/scripts/backup-automated.sh

# Verify backups weekly
0 3 * * 0 /path/to/scripts/verify-backup.sh
```

### Backup Verification Script

```bash
#!/bin/bash

LATEST_BACKUP=$(ls -t /backups/postgres/*.sql.gz | head -1)

# Create test database
createdb opencommerce_test

# Restore to test database
gunzip < $LATEST_BACKUP | psql opencommerce_test

# Run basic queries
psql opencommerce_test -c "SELECT COUNT(*) FROM order_service.retail_transactions;" > /dev/null
if [ $? -eq 0 ]; then
  echo "$(date): Backup verification successful" >> /var/log/opencommerce-backup.log
else
  echo "$(date): BACKUP VERIFICATION FAILED!" >> /var/log/opencommerce-backup.log
  # Send alert
  echo "Backup verification failed for $LATEST_BACKUP" | mail -s "CRITICAL: Backup Verification Failed" admin@yourstore.com
fi

# Cleanup
dropdb opencommerce_test
```

---

## Security Hardening

### 1. Firewall Configuration

**UFW (Ubuntu)**:
```bash
# Enable UFW
sudo ufw enable

# Allow SSH (change port if using non-standard)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other inbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Check status
sudo ufw status verbose
```

### 2. Fail2Ban (Brute Force Protection)

```bash
# Install
sudo apt install -y fail2ban

# Configure
sudo tee /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
EOF

sudo systemctl restart fail2ban
```

### 3. Database Security

```sql
-- Restrict database connections
ALTER DATABASE opencommerce SET log_statement = 'all';
ALTER DATABASE opencommerce SET log_duration = on;

-- Create read-only user for reporting
CREATE USER opencommerce_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE opencommerce TO opencommerce_readonly;
GRANT USAGE ON SCHEMA order_service TO opencommerce_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA order_service TO opencommerce_readonly;
```

### 4. Environment Variable Encryption

```bash
# Use AWS Secrets Manager, HashiCorp Vault, or encrypted .env

# Example: Encrypt .env
gpg --symmetric --cipher-algo AES256 .env

# Decrypt when needed
gpg --decrypt .env.gpg > .env
```

---

## Cost Optimization

### Estimated Monthly Costs

**Single Store (Render.com)**:
- PostgreSQL Starter: $7/mo
- Redis FREE tier: $0/mo
- App Instance Starter: $7/mo
- **Total: ~$14/month**

**Single Store (DigitalOcean)**:
- Droplet (2 vCPU, 4GB): $24/mo
- Managed PostgreSQL: $15/mo
- Managed Redis: $15/mo
- **Total: ~$54/month**

**Multi-Store (5 stores)**:
- Database (larger): $50/mo
- App Instances (auto-scale): $50-100/mo
- Redis: $15/mo
- **Total: ~$115-165/month**

### Cost Reduction Strategies

1. **Use Read Replicas** for reporting (avoid impacting production)
2. **Enable Database Connection Pooling** (reduce connection overhead)
3. **Use CDN** for static assets (Cloudflare FREE tier)
4. **Reserved Instances** (AWS) for predictable workloads
5. **Auto-scaling** based on traffic patterns
6. **Spot Instances** for development/testing

---

**Version**: 1.0
**Maintained By**: OpenCommerce Infrastructure Team
**Last Updated**: November 15, 2025
