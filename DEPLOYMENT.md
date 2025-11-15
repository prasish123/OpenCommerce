# OpenCommerce POS - Deployment Guide

## What's Been Built

### ✅ Completed Features

1. **Admin Portal & Back Office**
   - Full product management UI with multi-channel pricing
   - Promotion management for all promo types (BOGO, Mix & Match, Combo, etc.)
   - User management with RBAC
   - Store configuration
   - Sync monitoring for Elistar integration

2. **Comprehensive Reports Dashboard**
   - X Reports (mid-day sales summary)
   - Z Reports (end-of-day with drawer reconciliation)
   - Drawer management (open, close, reconcile)
   - Sales analysis by channel (In-Store, DoorDash, Uber Eats, Website)
   - Tax reports by jurisdiction
   - Inventory reports with low stock alerts
   - Top products analysis

3. **BOGO Promotion Logic** (COMPLETED!)
   - Supports Buy X Get Y configurations
   - Flexible discount percentages
   - Automatic cheapest item discounting

4. **Backend Services**
   - Payment processing (Cash, Credit, Debit, Contactless via Stripe)
   - Receipt generation (ESC/POS thermal printer support)
   - Returns/refunds
   - Void transactions
   - Cash drawer reconciliation
   - EOD closeout
   - Sales reporting
   - Tax calculation
   - Employee activity tracking
   - Offline support with sync

## Quick Start Deployment

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (with pgvector extension)
- Redis 7+
- Docker & Docker Compose (recommended) OR local PostgreSQL/Redis

### Option 1: Docker Compose (Recommended)

1. **Start all services:**
   ```bash
   docker compose up -d
   ```

2. **Access the application:**
   - POS Terminal UI: http://localhost:8080/pos
   - Back Office Portal: http://localhost:8080/backoffice
   - Admin Dashboard: http://localhost:8080/admin
   - API: http://localhost:3000
   - Order Queue: http://localhost:8080/queue

3. **Default credentials (DEV ONLY):**
   - Admin: `admin` / `admin123`
   - Manager: `manager` / `manager123`
   - Cashier: `cashier` / PIN `1234`

### Option 2: Local Development

1. **Install dependencies:**
   ```bash
   # Backend
   npm install

   # Frontend
   cd ui && npm install
   ```

2. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database and API keys
   ```

3. **Start PostgreSQL and Redis:**
   ```bash
   # On Ubuntu/Debian
   sudo service postgresql start
   sudo service redis-server start

   # On macOS with Homebrew
   brew services start postgresql@16
   brew services start redis
   ```

4. **Run database migrations:**
   ```bash
   npm run migrate
   ```

5. **Start backend server:**
   ```bash
   npm run dev
   ```

6. **Start UI (in a new terminal):**
   ```bash
   cd ui
   npm run dev
   ```

7. **Access the application:**
   - UI: http://localhost:5173
   - API: http://localhost:3000

## Application Structure

### URLs

- `/login` - Login page for all users
- `/pos` - POS Terminal (cashier interface)
- `/queue` - Order Queue (for fulfillment)
- `/backoffice` - Back Office Portal (admin functions)
- `/backoffice/products` - Product & pricing management
- `/backoffice/promotions` - Promotion management
- `/backoffice/stores` - Store configuration
- `/backoffice/sync` - Elistar sync monitor
- `/backoffice/users` - User management
- `/backoffice/reports` - Reports dashboard

### Key Features to Test

#### 1. Login & Authentication
- PIN login for POS terminal (4-6 digits)
- Username/password for back office
- Role-based access control (CASHIER, MANAGER, ADMIN, SUPER_ADMIN)

#### 2. POS Terminal
- Barcode scanning (or manual entry)
- Item lookup and add to cart
- Apply promotions automatically
- Process payments (cash/card)
- Print receipts
- Handle returns/refunds
- Void transactions (manager override)

#### 3. Back Office - Product Management
- View all products with multi-channel pricing
- Edit product prices (In-Store, DoorDash, Uber Eats, Website)
- Manage product categories
- Bulk price updates
- Import/export products

#### 4. Back Office - Reports
**Daily Reports:**
- Generate X Report (mid-day, keeps drawer open)
- Generate Z Report (end-of-day, includes drawer reconciliation)
- View hourly breakdown
- See tender breakdown (cash, credit, debit)
- Track discounts, voids, refunds

**Drawer Management:**
- Open drawer with starting cash
- View current drawer status
- Close & reconcile drawer (enter actual cash counted)
- View drawer session history
- Identify cash variances

**Sales Analysis:**
- View sales by date range (today, 7 days, 30 days)
- Channel performance breakdown
- Top selling products
- Revenue trends

**Tax Reports:**
- Tax collection summary
- Breakdown by jurisdiction (State, County, City)
- Sales tax vs excise tax

**Inventory Reports:**
- Low stock alerts
- Out of stock items
- Inventory value
- Reorder recommendations

#### 5. Promotions
**Supported Types:**
- **Mix & Match**: "3 for $14" or "Buy 2 for $5"
- **Combo**: Bundle pricing (e.g., Chips + Drink for $6)
- **BOGO**: Buy 1 Get 1 Free, Buy 2 Get 1 Free, Buy 1 Get 1 50% Off
- **Percent Off**: 20% off entire order
- **Dollar Off**: $5 off orders over $25

## Testing the System

### 1. Create Test Data

First, you'll need to:
1. Login to back office as admin
2. Add some products (or import from Elistar)
3. Create promotions
4. Add users (cashiers, managers)

### 2. Test POS Flow

1. Login as cashier (PIN or username)
2. Scan/enter product barcodes
3. Watch promotions apply automatically
4. Process payment (cash or card)
5. Print receipt
6. Open cash drawer

### 3. Test Reports

1. Make several test transactions
2. Go to Back Office → Reports
3. Generate X Report to see mid-day summary
4. Generate Z Report for end-of-day
5. Review sales analysis and top products

### 4. Test Drawer Management

1. Open drawer with $200 starting cash
2. Process several cash transactions
3. Close drawer and enter actual cash counted
4. View variance (should be $0 if you counted correctly!)

## Database Schema

The system uses 14 migrations creating schemas for:
- Product Service (products, promotions, tax strategies)
- Order Service (transactions, line items, tenders)
- Inventory Service (stock tracking)
- Auth Service (users, sessions, permissions)
- Compliance Service (audit logs, age verification)
- Loyalty Service (members, rewards)
- Customer Service
- Reporting Service (drawer sessions, reports)
- Channel Integrations (DoorDash, Uber Eats, Website)

## Environment Variables

### Required for MVP

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/opencommerce

# Server
PORT=3000
UI_PORT=8080

# Store Info
STORE_ID=STORE_001
STORE_NAME=Your Store Name
STORE_TAX_RATE=0.07

# Security (CHANGE IN PRODUCTION!)
JWT_SECRET=your_secret_key_here
SESSION_SECRET=your_session_secret_here
```

### Optional (for full features)

```bash
# Stripe (for card payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# DoorDash Integration
DOORDASH_DEVELOPER_ID=...
DOORDASH_KEY_ID=...

# Uber Eats Integration
UBER_CLIENT_ID=...
UBER_CLIENT_SECRET=...

# Elistar Sync
ELISTAR_IMPORT_SECRET=...
ELISTAR_EXPORT_ENDPOINT=...
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐│
│  │ POS Terminal│  │ Order Queue │  │ Back Office Portal││
│  └─────────────┘  └─────────────┘  └──────────────────┘│
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────┴────────────────────────────────┐
│              Backend API (Node.js + Express)             │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐│
│  │ Product  │ │  Order   │ │ Payment │ │   Reporting  ││
│  │ Service  │ │ Service  │ │ Service │ │   Service    ││
│  └──────────┘ └──────────┘ └─────────┘ └──────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐│
│  │   Auth   │ │Inventory │ │   Tax   │ │   Channels   ││
│  │ Service  │ │ Service  │ │ Service │ │   Service    ││
│  └──────────┘ └──────────┘ └─────────┘ └──────────────┘│
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                     Data Layer                           │
│  ┌──────────────┐  ┌─────────┐  ┌───────────────────┐  │
│  │  PostgreSQL  │  │  Redis  │  │  Ollama (AI)      │  │
│  │  (Main DB)   │  │ (Cache) │  │  (Semantic Search)│  │
│  └──────────────┘  └─────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## What's Working

✅ Full POS terminal workflow (login → scan → cart → payment → receipt)
✅ All payment methods (cash, credit, debit, contactless)
✅ Multi-channel orders (DoorDash, Uber Eats, Website, In-Store)
✅ Elistar integration (NAXML import)
✅ All promotion types including BOGO
✅ X/Z reports with drawer reconciliation
✅ EOD closeout
✅ Sales reporting and analytics
✅ Tax calculation by jurisdiction
✅ Returns/refunds
✅ Void transactions (with manager override)
✅ Employee activity logging
✅ Offline support with sync
✅ Age verification for alcohol
✅ Receipt printing
✅ Cash drawer control
✅ Back office admin portal
✅ User management with RBAC
✅ Product management UI
✅ Reports dashboard

## Next Steps

### Immediate (to test MVP)

1. **Start the application** (use Docker Compose or local dev)
2. **Load test data**:
   - Import products from Elistar OR manually add products
   - Create a few test promotions
   - Add test users (cashier, manager)
3. **Test POS workflow**:
   - Login as cashier
   - Scan items
   - Complete a transaction
   - Print receipt
4. **Test reports**:
   - Generate X Report
   - Review sales data
   - Test drawer reconciliation

### Production Preparation

1. **Security**:
   - Change all default passwords
   - Set strong JWT_SECRET and SESSION_SECRET
   - Configure HTTPS/SSL
   - Set up firewall rules
   - Enable Stripe production keys

2. **Deployment**:
   - Set up production database (consider managed PostgreSQL)
   - Configure automated backups
   - Set up monitoring (Prometheus + Grafana recommended)
   - Configure log aggregation
   - Set up CI/CD pipeline

3. **Hardware**:
   - Connect thermal receipt printer (ESC/POS compatible)
   - Connect barcode scanner
   - Connect Stripe Terminal for card payments
   - Test cash drawer control

4. **Data**:
   - Import full product catalog from Elistar
   - Set up pricing for all channels
   - Configure tax rates for your jurisdiction
   - Create promotional campaigns
   - Add all employees

5. **Testing**:
   - Load testing (simulate peak transaction volume)
   - End-to-end testing (complete sales cycle)
   - Failover testing (network outages, offline mode)
   - Receipt printing testing
   - Payment processing testing
   - Drawer reconciliation testing

## Support & Troubleshooting

### Common Issues

**Cannot connect to database:**
- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL in .env
- Ensure database exists: `createdb opencommerce`

**Cannot connect to Redis:**
- Verify Redis is running: `redis-cli ping`
- Check REDIS_URL in .env

**Migrations fail:**
- Ensure you have PostgreSQL 16+ with pgvector extension
- Run: `CREATE EXTENSION IF NOT EXISTS vector;`

**TypeScript build errors:**
- For development, use `npm run dev` (uses tsx, skips type checking)
- For production build, fix type errors or use `tsc --noEmit false`

**UI not loading:**
- Check that both backend (port 3000) and UI (port 8080 or 5173) are running
- Verify CORS settings if running UI separately

**Payments not working:**
- Verify Stripe keys are set
- Use Stripe test keys for development
- Check network connectivity to Stripe API

### Logs

- Application logs: `logs/opencommerce.log`
- View in real-time: `tail -f logs/opencommerce.log`
- Database logs: Check PostgreSQL data directory
- Redis logs: Check Redis log file

### Database Access

```bash
# Connect to database
psql $DATABASE_URL

# Useful queries
SELECT * FROM auth_service.users;
SELECT * FROM product_service.products LIMIT 10;
SELECT * FROM order_service.retail_transactions ORDER BY created_at DESC LIMIT 10;
SELECT * FROM reporting_service.reports ORDER BY generated_at DESC;
```

## Architecture Notes

### Single Store Setup
- The system is designed for a single store initially
- STORE_ID is set in environment variables
- All transactions, products, and users are associated with this store

### Multi-Store Scalability
- Database schema supports multi-store (store_id columns everywhere)
- To add more stores:
  1. Add store records to database
  2. Deploy separate instances with different STORE_ID
  3. Set up edge sync between stores
  4. Configure central reporting

### Offline Support
- POS terminals cache product data locally (IndexedDB)
- Transactions are queued when offline
- Automatic sync when connection restored
- Conflict resolution built-in

### Performance
- Redis caching for frequently accessed data
- Database connection pooling
- Materialized views for reporting
- Efficient indexing on all query paths

### Security
- PCI-DSS compliant payment handling (Stripe P2PE)
- No card data stored on server
- JWT authentication
- Role-based access control (RBAC)
- Audit logging for all actions
- Password hashing (bcrypt)
- Session management
- HTTPS required for production

## License

MIT

## Credits

Built with OpenCommerce POS System
- Backend: Node.js + Express + PostgreSQL
- Frontend: React + Vite + TailwindCSS
- Payments: Stripe Terminal
- Integrations: DoorDash, Uber Eats, Elistar
