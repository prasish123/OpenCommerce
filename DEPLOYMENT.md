# OpenCommerce Deployment Guide

Complete guide for deploying OpenCommerce POS to production environments.

**Last Updated**: November 15, 2025
**Version**: 1.0

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Cloud Deployment (Recommended)](#cloud-deployment-recommended)
4. [Local/On-Premise Deployment](#localon-premise-deployment)
5. [Database Setup](#database-setup)
6. [SSL/HTTPS Configuration](#sslhttps-configuration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Backup Strategy](#backup-strategy)
9. [Post-Deployment Checklist](#post-deployment-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- ✅ **Stripe Account** (for payments)
- ✅ **Cloud Provider Account** (Render.com, DigitalOcean, or AWS)
- ✅ **Domain Name** (for SSL/HTTPS)
- ⚠️ **DoorDash Developer Account** (optional, for delivery integration)
- ⚠️ **Uber Eats Developer Account** (optional, for delivery integration)

### Required Software
- **Node.js** 20.x or higher
- **PostgreSQL** 16+ with pgvector extension
- **Redis** 7+
- **Docker** (recommended) or PM2 for process management

### Hardware Requirements

**Minimum (Development/Testing)**:
- 2 CPU cores
- 4GB RAM
- 20GB storage

**Recommended (Production - Single Store)**:
- 4 CPU cores
- 8GB RAM
- 50GB SSD storage

**Multi-Store (5-10 stores)**:
- 8 CPU cores
- 16GB RAM
- 100GB SSD storage

---

## Environment Setup

### 1. Clone Repository & Install Dependencies

```bash
git clone https://github.com/your-org/OpenCommerce.git
cd OpenCommerce
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your production values:

```bash
# CRITICAL: Change these in production!
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-CHANGE-THIS
SESSION_SECRET=your-session-secret-CHANGE-THIS
PHOTO_ENCRYPTION_KEY=your-64-char-hex-key-for-photo-encryption

# Server Configuration
PORT=3000
UI_PORT=8080
HOST=0.0.0.0

# Database (use your cloud database URL)
DATABASE_URL=postgresql://user:password@your-db-host:5432/opencommerce

# Redis (use your cloud Redis URL)
REDIS_URL=redis://your-redis-host:6379

# Stripe Payment (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# Store Configuration
STORE_ID=STORE_001
STORE_NAME=Your Store Name
STORE_ADDRESS=123 Main St, City, State 12345
STORE_TAX_RATE=0.07
STORE_TIMEZONE=America/New_York

# Logging
LOG_LEVEL=info
LOG_FILE=logs/opencommerce.log

# Feature Flags
ENABLE_OLLAMA_SEARCH=false  # Disable in production unless you have Ollama
```

### 3. Generate Encryption Keys

**JWT Secret** (256-bit):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Photo Encryption Key** (256-bit):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add these to your `.env` file.

---

## Cloud Deployment (Recommended)

### Option A: Render.com (Easiest)

**Cost**: ~$7-20/month per store

1. **Create PostgreSQL Database**:
   - Go to https://dashboard.render.com
   - Click "New +" → "PostgreSQL"
   - Name: `opencommerce-db`
   - Plan: Starter ($7/mo) or Standard ($20/mo)
   - Copy the **Internal Database URL**

2. **Create Redis Instance**:
   - Click "New +" → "Redis"
   - Name: `opencommerce-redis`
   - Plan: Starter (FREE) or Standard ($10/mo)
   - Copy the **Internal Redis URL**

3. **Deploy Application**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `opencommerce-pos`
     - **Environment**: `Node`
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`
     - **Plan**: Starter ($7/mo) or Standard ($25/mo)

4. **Add Environment Variables**:
   - In Render dashboard, go to Environment
   - Add all variables from `.env` (use URLs from steps 1-2)

5. **Enable Auto-Deploy**:
   - Settings → Auto-Deploy: `main` branch

6. **Custom Domain** (for SSL):
   - Settings → Custom Domain
   - Add your domain (e.g., `pos.yourstore.com`)
   - Configure DNS CNAME to Render's URL
   - SSL is automatic via Let's Encrypt

### Option B: DigitalOcean App Platform

**Cost**: ~$12-24/month per store

1. **Create Managed PostgreSQL**:
   - Databases → Create → PostgreSQL
   - Plan: Basic ($12/mo)
   - Enable pgvector extension

2. **Create Managed Redis**:
   - Databases → Create → Redis
   - Plan: Basic ($15/mo)

3. **Create App**:
   - Apps → Create App
   - Connect GitHub repository
   - Configure environment variables
   - Deploy

4. **Add Domain & SSL**:
   - Settings → Domains
   - Add custom domain
   - SSL auto-configured

### Option C: Railway.app

**Cost**: Pay-as-you-go (~$5-15/month)

1. Create new project
2. Add PostgreSQL plugin
3. Add Redis plugin
4. Deploy from GitHub
5. Configure environment variables
6. Add custom domain

---

## Local/On-Premise Deployment

For Raspberry Pi or local server deployment.

### 1. Install Dependencies

**Ubuntu/Debian**:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /etc/apt/trusted.gpg.d/pgdg.asc &>/dev/null
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# Install Redis
sudo apt install -y redis-server

# Install PM2 (process manager)
sudo npm install -g pm2
```

### 2. Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE opencommerce;
CREATE USER opencommerce WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE opencommerce TO opencommerce;

# Enable pgvector extension
\c opencommerce
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

### 3. Run Migrations

```bash
cd /path/to/OpenCommerce
npm run migrate
```

### 4. Start with PM2

```bash
# Build application
npm run build

# Start with PM2
pm2 start dist/main.js --name opencommerce-api
pm2 save
pm2 startup  # Follow instructions to enable auto-start

# Check status
pm2 status
pm2 logs opencommerce-api
```

### 5. Reverse Proxy (Nginx)

**Install Nginx**:
```bash
sudo apt install -y nginx
```

**Configure** (`/etc/nginx/sites-available/opencommerce`):
```nginx
server {
    listen 80;
    server_name pos.yourstore.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Enable site**:
```bash
sudo ln -s /etc/nginx/sites-available/opencommerce /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## SSL/HTTPS Configuration

**CRITICAL**: Stripe Terminal requires HTTPS in production!

### Option 1: Certbot (Let's Encrypt) - FREE

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d pos.yourstore.com

# Auto-renewal is configured automatically
# Test renewal:
sudo certbot renew --dry-run
```

### Option 2: Cloudflare (FREE)

1. Add domain to Cloudflare
2. Set DNS to proxy through Cloudflare
3. SSL/TLS → Full (strict)
4. Automatic HTTPS enabled

---

## Monitoring & Logging

### 1. Application Logs

**PM2 Logs**:
```bash
pm2 logs opencommerce-api
pm2 logs opencommerce-api --lines 100
```

**Log Files**:
- Location: `logs/opencommerce.log`
- Rotation: Automatic (Winston handles this)

### 2. Uptime Monitoring

**UptimeRobot** (FREE):
1. Sign up at https://uptimerobot.com
2. Add monitor:
   - Type: HTTPS
   - URL: `https://pos.yourstore.com/health`
   - Interval: 5 minutes
3. Configure alerts (email, SMS)

### 3. Error Tracking

**Sentry** (FREE tier available):
1. Sign up at https://sentry.io
2. Create new project (Node.js)
3. Install SDK:
   ```bash
   npm install @sentry/node
   ```
4. Add to `src/main.ts`:
   ```typescript
   import * as Sentry from "@sentry/node";

   Sentry.init({
     dsn: "your-sentry-dsn",
     environment: config.env,
   });
   ```

### 4. Performance Monitoring

**Recommended Tools**:
- **PM2 Plus**: Built-in monitoring (pm2.io)
- **Grafana + Prometheus**: Advanced metrics
- **New Relic**: APM (paid)

---

## Backup Strategy

### 1. Database Backups

**Automated Daily Backups**:

Create backup script (`scripts/backup-db.sh`):
```bash
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups/postgres"
DB_NAME="opencommerce"

mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U opencommerce $DB_NAME | gzip > $BACKUP_DIR/opencommerce_$TIMESTAMP.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: opencommerce_$TIMESTAMP.sql.gz"
```

**Schedule with cron**:
```bash
crontab -e

# Add line:
0 2 * * * /path/to/scripts/backup-db.sh
```

### 2. Age Verification Photo Backups

**Automatic daily backups** (already implemented):
- Location: `data/age-verification-photos/`
- Retention: 365 days (automatic cleanup)
- Backup strategy: Include in file backup

### 3. File Backups

**Using rsync**:
```bash
#!/bin/bash
rsync -avz --delete \
  /path/to/OpenCommerce/data/ \
  user@backup-server:/backups/opencommerce-data/
```

### 4. Cloud Backup Services

**Recommended**:
- **Backblaze B2**: $5/TB/month
- **AWS S3 Glacier**: $4/TB/month
- **DigitalOcean Spaces**: $5/month (250GB)

**Backup .env file** (SECURELY):
```bash
# Encrypt before uploading
gpg -c .env
# Upload .env.gpg to secure cloud storage
```

---

## Post-Deployment Checklist

### Security

- [ ] Change all default passwords/secrets
- [ ] Enable HTTPS/SSL
- [ ] Configure firewall (allow only 80, 443, SSH)
- [ ] Set up fail2ban for SSH protection
- [ ] Review and restrict database access
- [ ] Enable Redis password authentication
- [ ] Set up automated security updates

### Monitoring

- [ ] Configure uptime monitoring (UptimeRobot)
- [ ] Set up error tracking (Sentry)
- [ ] Configure log rotation
- [ ] Test backup restoration
- [ ] Set up alerting (email/SMS)

### Testing

- [ ] Test payment processing (Stripe)
- [ ] Test age verification photo upload
- [ ] Test receipt printing (if hardware present)
- [ ] Test offline mode and sync
- [ ] Test manager overrides
- [ ] Load test API endpoints

### Operations

- [ ] Document access credentials (use password manager)
- [ ] Train staff on POS operations
- [ ] Create incident response plan
- [ ] Schedule regular maintenance windows
- [ ] Set up on-call rotation (if applicable)

---

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE datname='opencommerce';"

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Redis Connection Issues

```bash
# Check Redis status
sudo systemctl status redis

# Test connection
redis-cli ping

# Restart Redis
sudo systemctl restart redis
```

### Application Won't Start

```bash
# Check logs
pm2 logs opencommerce-api --lines 100

# Check if port is in use
sudo lsof -i :3000

# Restart application
pm2 restart opencommerce-api

# Full restart
pm2 delete opencommerce-api
npm run build
pm2 start dist/main.js --name opencommerce-api
```

### SSL Certificate Issues

```bash
# Check certificate validity
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Restart Nginx
sudo systemctl restart nginx
```

### High CPU/Memory Usage

```bash
# Check resource usage
pm2 monit

# Check system resources
htop

# Analyze slow queries
sudo -u postgres psql opencommerce -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

---

## Support & Resources

- **Documentation**: See `docs/` directory
- **GitHub Issues**: https://github.com/your-org/OpenCommerce/issues
- **Slack/Discord**: (Add your support channel)
- **Emergency Contact**: (Add on-call contact info)

---

## Deployment Checklist Summary

**Before Production**:
- [ ] All P0 critical gaps resolved ✅
- [ ] Environment variables configured
- [ ] Database migrated
- [ ] SSL/HTTPS enabled
- [ ] Backups configured
- [ ] Monitoring set up
- [ ] Security hardened
- [ ] Load tested
- [ ] Staff trained

**Go-Live**:
- [ ] Deploy to production
- [ ] Verify all integrations working
- [ ] Monitor for 24 hours
- [ ] Have rollback plan ready

---

**Version**: 1.0
**Maintained By**: OpenCommerce DevOps Team
**Last Updated**: November 15, 2025
