# OpenCommerce POS - Omnichannel Point of Sale System

**AI-Native, Event-Driven, Multi-Channel POS with Elistar Integration**

## 🎯 Features

- **Omnichannel**: DoorDash, Uber Eats, Website, and In-Store - all in one screen
- **Elistar Integration**: Bidirectional sync (import items/prices, export transactions)
- **Channel-Specific Pricing**: Automatic markup per channel (DoorDash +30%, etc.)
- **Promo Engine**: Mix & Match, Combo Deals, BOGO, Percent/Dollar Off
- **Event-Driven**: Built for scale with event sourcing
- **Offline-First**: Works without internet, syncs when online
- **ARTS/Conexxus Compliant**: Industry-standard transaction logging
- **Age Verification**: Alcohol delivery compliance tracking
- **Hardware Integration**: Thermal printers, barcode scanners, Stripe Terminal

## 📋 Prerequisites

- **Docker Desktop** (Windows) or Docker (Linux)
- **Node.js 20+** (for development)
- **PostgreSQL 16** (via Docker)
- **Redis** (via Docker)

## 🚀 Quick Start

### 1. Clone and Setup

\`\`\`bash
git clone https://github.com/your-org/OpenCommerce.git
cd OpenCommerce

# Copy environment file
cp .env.example .env

# Edit .env with your settings (Stripe keys, store info, etc.)
nano .env
\`\`\`

### 2. Start with Docker Compose

\`\`\`bash
# Start all services (PostgreSQL, Redis, Ollama, App)
docker-compose up -d

# View logs
docker-compose logs -f app

# Check status
docker-compose ps
\`\`\`

### 3. Access the System

- **POS Terminal**: http://localhost:8080
- **API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

### 4. Default Login

- **Username**: `admin`
- **PIN**: `1234` (⚠️ **CHANGE THIS IMMEDIATELY**)

## 📦 Installation (Development)

\`\`\`bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start in development mode
npm run dev
\`\`\`

## 🗄️ Database Setup

The system uses PostgreSQL with separate schemas per service (microservices-ready):

\`\`\`bash
# Migrations run automatically on first start
# Or run manually:
docker-compose exec postgres psql -U opencommerce -d opencommerce -f /docker-entrypoint-initdb.d/001_create_schemas.sql
\`\`\`

## 🔌 Elistar Integration

### Import Items/Prices from Elistar

Elistar sends NAXML files to your API endpoint:

\`\`\`bash
POST http://your-server:3000/api/elistar/import
Content-Type: application/xml
Authorization: Bearer <ELISTAR_IMPORT_SECRET>

<NAXML-MaintenanceRequest>
  ...
</NAXML-MaintenanceRequest>
\`\`\`

The system automatically:
1. Parses all 5 NAXML file types (Items, Departments, Promos, Combos, Item Lists)
2. Updates products and prices
3. Calculates channel-specific pricing
4. Syncs menus to DoorDash/Uber Eats/Website

### Export Transactions to Elistar

Transactions are automatically queued and exported:

\`\`\`bash
# Manual export (for testing)
curl -X POST http://localhost:3000/api/elistar/export \
  -H "Authorization: Bearer <SECRET>" \
  -d '{"startDate":"2025-11-01","endDate":"2025-11-14"}'
\`\`\`

## 🛒 Order Flow

### 1. Orders Come From All Channels

- **DoorDash**: Webhook → Order aggregation
- **Uber Eats**: Webhook → Order aggregation
- **Website**: API call → Order aggregation
- **In-Store**: POS terminal → Order aggregation

### 2. Unified Order Queue

All orders appear on **one screen** regardless of channel:

\`\`\`
🚗 DoorDash #D4782 - $67.45 - Contains Alcohol ⚠️
🌐 Website #W1234 - $34.20 - Ready for Pickup
🏪 In-Store - Customer at Register 1
\`\`\`

### 3. Fulfillment Workflow

1. Order received → **Auto-accept** (if in stock)
2. Cashier prepares order
3. Age verification (if alcohol)
4. Mark ready → Notify customer/driver
5. Complete order → Sync to Elistar

## 💳 Payment Integration

### Stripe Terminal (Recommended)

\`\`\`env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
\`\`\`

Supports:
- EMV Chip Cards
- NFC/Contactless (Apple Pay, Google Pay)
- Magnetic Stripe
- P2PE (Point-to-Point Encryption) - PCI compliant

## 🖨️ Hardware Setup

### Receipt Printer (ESC/POS)

Tested with:
- Epson TM-T20III
- Star TSP143
- Any ESC/POS compatible thermal printer

\`\`\`env
PRINTER_VENDOR_ID=0x04b8
PRINTER_PRODUCT_ID=0x0e15
\`\`\`

### Barcode Scanner

Any USB HID barcode scanner works (plug & play).

### Cash Drawer

Connect to printer (kicks via ESC/POS command).

## 📊 Reporting

### Sales by Channel

\`\`\`sql
SELECT
  channel,
  COUNT(*) as orders,
  SUM(total_amount) as revenue
FROM order_service.retail_transactions
WHERE business_date = CURRENT_DATE
  AND status = 'COMPLETED'
GROUP BY channel;
\`\`\`

### Compliance Logs (Alcohol Delivery)

\`\`\`sql
SELECT *
FROM compliance_service.age_verification_logs
WHERE verified_at >= CURRENT_DATE
ORDER BY verified_at DESC;
\`\`\`

## 🔒 Security

### PCI Compliance

- **P2PE devices only** - No card data touches the server
- Stripe handles all payment processing
- No PAN storage

### Role-Based Access Control (RBAC)

- **Cashier**: Scan items, process payments
- **Manager**: Override prices, void transactions, reports
- **Admin**: User management, price changes, system config
- **Super Admin**: Full system access

### Change Default PIN

\`\`\`sql
-- Run this immediately after installation
UPDATE auth_service.users
SET pin_hash = '$2b$10$YOUR_NEW_HASH'
WHERE username = 'admin';
\`\`\`

## 🌍 Deployment (Production)

### Option 1: Single Server (1-2 stores)

\`\`\`bash
# On Windows PC at store
1. Install Docker Desktop
2. Clone repository
3. Configure .env
4. Run: docker-compose up -d
5. Access at http://localhost:8080
\`\`\`

### Option 2: Multi-Store (3+ stores)

\`\`\`
Store 1 (Edge) ──┐
Store 2 (Edge) ──┼──→ Cloud (AWS/GCP)
Store 3 (Edge) ──┘     - Central DB
                       - Reporting
                       - Elistar Integration
\`\`\`

Each store runs locally with Docker.
Cloud aggregates data for reporting.

## 📈 Scaling to Microservices

The system is **designed for growth**:

\`\`\`
Phase 1 (Now):     Modular Monolith (single deployment)
Phase 2 (Month 4): Extract payment-service (separate container)
Phase 3 (Month 6): Extract product-service, order-service
Phase 4 (Month 12): Full microservices with Kafka
\`\`\`

**No rewrite needed** - services communicate via:
- Defined interfaces (TypeScript types)
- Event bus (EventEmitter now, Kafka later)
- Separate database schemas (easy to split)

## 🛠️ Troubleshooting

### Database Connection Failed

\`\`\`bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
\`\`\`

### Printer Not Detected

\`\`\`bash
# Linux: Check USB devices
lsusb

# Find vendor/product IDs and update .env
PRINTER_VENDOR_ID=0x04b8
PRINTER_PRODUCT_ID=0x0e15
\`\`\`

### Orders Not Syncing from DoorDash

1. Check webhook URL is configured in DoorDash Developer Portal
2. Verify webhook secret in .env
3. Check logs: `docker-compose logs app | grep doordash`

## 📝 API Endpoints

### Elistar Sync

- `POST /api/elistar/import` - Import NAXML file
- `POST /api/elistar/export` - Export transactions

### Products

- `GET /api/products/:barcode` - Get product by barcode
- `GET /api/products/search?q=query` - Search products
- `GET /api/products/menu/:channel` - Get menu for channel

### Orders

- `POST /api/orders` - Create order (from website)
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id/status` - Update order status

### Webhooks

- `POST /webhooks/doordash/orders` - DoorDash webhook
- `POST /webhooks/uber/orders` - Uber Eats webhook

## 🧪 Testing

\`\`\`bash
# Run tests
npm test

# Test NAXML import
curl -X POST http://localhost:3000/api/elistar/import \
  -H "Content-Type: application/xml" \
  -H "Authorization: Bearer <secret>" \
  --data-binary @sample-elistar.xml
\`\`\`

## 📞 Support

- **Documentation**: https://docs.opencommerce.com
- **Issues**: https://github.com/your-org/OpenCommerce/issues
- **Email**: support@opencommerce.com

## 📄 License

MIT License - See LICENSE file

---

**Built with ❤️ for retail success**

*Future-proof architecture. Production-ready today. Scales to 10,000 stores.*
