# OpenCommerce System Architecture

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Technology Stack](#technology-stack)
3. [System Components](#system-components)
4. [Database Architecture](#database-architecture)
5. [Security Architecture](#security-architecture)
6. [Deployment Architecture](#deployment-architecture)
7. [Scalability & Performance](#scalability--performance)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL INTEGRATIONS                            │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│   DoorDash   │  Uber Eats   │   Website    │   Elistar    │   Stripe    │
│   (Orders)   │  (Orders)    │  (Orders)    │ (Back Office)│ (Payments)  │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬──────┘
       │              │              │              │              │
       │ Webhook      │ Webhook      │ API          │ NAXML        │ API
       │              │              │              │              │
┌──────▼──────────────▼──────────────▼──────────────▼──────────────▼──────┐
│                        API GATEWAY / ROUTING LAYER                       │
│                       (Express.js - src/main.ts)                         │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────────┐
│                        AUTHENTICATION MIDDLEWARE                          │
│                    (JWT + PIN-based + RBAC)                              │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────────┐
│                          SERVICE LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Product    │  │  Order Agg   │  │   Payment    │                  │
│  │   Service    │  │   Service    │  │   Service    │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐                  │
│  │  Inventory   │  │ POS Terminal │  │   Receipt    │                  │
│  │   Service    │  │   Service    │  │   Service    │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐                  │
│  │   Loyalty    │  │ Elistar Sync │  │   Offline    │                  │
│  │   Service    │  │   Service    │  │   Service    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Customer   │  │     Tax      │  │  Analytics   │                  │
│  │   Service    │  │   Service    │  │   Service    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  Reporting   │  │ Notification │  │   Security   │                  │
│  │   Service    │  │   Service    │  │   Service    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────────┐
│                          EVENT BUS (EventEmitter2)                        │
│              Domain Events for Async Processing & Audit                  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────────┐
│                        DATA & CACHE LAYER                                 │
│  ┌──────────────────────────┐      ┌──────────────────────────┐         │
│  │   PostgreSQL 16          │      │      Redis 7             │         │
│  │   (pgvector extension)   │      │   (Cache + Sessions)     │         │
│  │   - 8 Service Schemas    │      │   - Session Store        │         │
│  │   - Event Sourcing       │      │   - Rate Limiting        │         │
│  │   - ARTS Compliance      │      │   - Pub/Sub              │         │
│  └──────────────────────────┘      └──────────────────────────┘         │
│  ┌──────────────────────────┐      ┌──────────────────────────┐         │
│  │   Ollama (AI)            │      │   IndexedDB (Offline)    │         │
│  │   deepseek-r1:1.5b       │      │   Client-side Storage    │         │
│  │   Semantic Search        │      │   SQLite in Browser      │         │
│  └──────────────────────────┘      └──────────────────────────┘         │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ POS Terminal │  │ Order Queue  │  │  Back Office │                   │
│  │    (React)   │  │   (React)    │  │   (React)    │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│            React 18 + TypeScript + Vite + TailwindCSS                     │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                       HARDWARE INTEGRATION                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │   Thermal    │  │   Barcode    │  │     Cash     │                   │
│  │   Printer    │  │   Scanner    │  │    Drawer    │                   │
│  │  (ESC/POS)   │  │  (USB HID)   │  │ (via Printer)│                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│  ┌──────────────┐                                                         │
│  │   Stripe     │                                                         │
│  │  Terminal    │                                                         │
│  │   Reader     │                                                         │
│  └──────────────┘                                                         │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3
- **Framework**: Express.js 4.21
- **Process Manager**: PM2 (production)

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State Management**:
  - Zustand (client state)
  - React Query / TanStack Query (server state)
- **Routing**: React Router

### Database
- **Primary Database**: PostgreSQL 16
  - Extensions: pgvector (AI embeddings)
  - Connection Pool: node-postgres (pg)
- **Cache**: Redis 7
  - Use Cases: Sessions, rate limiting, pub/sub
- **Offline Storage**: IndexedDB (idb library)

### AI/ML
- **LLM Server**: Ollama
- **Model**: deepseek-r1:1.5b
- **Use Case**: Semantic product search with 384-dim embeddings

### Payment Processing
- **Provider**: Stripe
- **Product**: Stripe Terminal
- **SDK**: stripe-node
- **Compliance**: P2PE (Point-to-Point Encryption)

### Third-Party Integrations
- **DoorDash**: Webhook + REST API
- **Uber Eats**: Webhook + REST API
- **Elistar**: NAXML (XML) import/export
- **Website**: REST API

### Hardware Integration
- **Receipt Printer**: escpos + escpos-usb
  - Supported: Epson TM-T20III, Star TSP143
- **Barcode Scanner**: node-hid (USB HID)
- **Cash Drawer**: Via printer kick-out pulse

### Development Tools
- **Validation**: Zod
- **Logging**: Winston
- **Testing**: Jest + ts-jest
- **Load Testing**: Artillery + K6
- **Linting**: ESLint + TypeScript ESLint
- **Formatting**: Prettier
- **Migrations**: node-pg-migrate
- **Container**: Docker + Docker Compose

---

## System Components

### 1. API Gateway / Routing Layer
**Location**: `src/main.ts`

**Responsibilities**:
- HTTP request routing
- CORS configuration
- Helmet security headers
- Body parsing (JSON/XML)
- Error handling middleware
- Health check endpoint

**Key Features**:
- RESTful API design
- Webhook endpoint verification (DoorDash, Uber Eats)
- Rate limiting (via Redis)
- Request logging

---

### 2. Authentication & Authorization

#### Authentication Middleware
**Location**: `src/middleware/auth-middleware.ts`

**Methods**:
- **PIN-based**: 4-digit PIN (hashed with bcrypt)
- **JWT Tokens**: Bearer token authentication
- **Session Management**: Redis-based sessions

**Features**:
- Auto-logout after 15 minutes inactivity
- Account lockout after 6 failed attempts
- Password history (prevent reuse)
- PCI DSS compliant

#### RBAC (Role-Based Access Control)
**Location**: `src/services/auth/`

**Roles**:
```
SUPER_ADMIN
  └─ Full system access
ADMIN
  ├─ Manage users
  ├─ Update products
  └─ All MANAGER permissions
MANAGER
  ├─ Price overrides
  ├─ Void transactions
  ├─ Refunds
  ├─ View reports
  └─ All CASHIER permissions
CASHIER
  ├─ Read products
  ├─ Process orders
  └─ Read inventory
```

---

### 3. Service Layer Architecture

Each service follows the **Service-Repository Pattern**:

```
┌─────────────────────────────────────────┐
│         Service Interface               │
│  (Business Logic & Orchestration)       │
└─────────────┬───────────────────────────┘
              │
              │ Domain Events
              ▼
┌─────────────────────────────────────────┐
│          Event Bus                      │
│  (Async Communication & Audit)          │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│        Repository Layer                 │
│  (Database Access & Transactions)       │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│      PostgreSQL Schema                  │
│  (Service-specific Tables)              │
└─────────────────────────────────────────┘
```

#### Key Services

**Product Service** (`src/services/product/`)
- Product catalog management
- Channel-specific pricing calculation
- Promotion engine (Mix & Match, BOGO, Combos)
- Full-text + semantic search
- Elistar sync integration

**Order Aggregation Service** (`src/services/order-aggregation/`)
- Unified order queue (all channels)
- Order status management
- Age verification tracking
- ARTS-compliant transaction logging

**Payment Service** (`src/services/payment/`)
- Stripe Terminal integration
- Cash payment processing
- Split tender support
- PCI DSS tokenization (no PAN storage)

**Inventory Service** (`src/services/inventory/`)
- Real-time stock tracking
- Reserved quantity management
- Inventory movement audit trail
- Reorder point tracking

**POS Terminal Service** (`src/services/pos-terminal/`)
- Shopping cart management
- Tax calculation
- Promotion auto-apply
- Transaction processing

**Elistar Sync Service** (`src/services/elistar-sync/`)
- NAXML parser (import)
- Product/price sync
- Promotion sync
- Transaction export

**Offline Service** (`src/services/offline/`)
- Connection monitoring
- Local IndexedDB cache
- Sync queue management
- Conflict resolution

**Security Service** (`src/services/security/`)
- Session management
- Encryption key management
- Audit logging (append-only)
- PCI compliance reporting

---

### 4. Event Bus Architecture

**Location**: `src/shared/event-bus.ts`
**Library**: EventEmitter2

**Purpose**:
- Decouple services
- Enable async processing
- Create audit trail
- Support event sourcing

**Key Events**:
```typescript
// Product Events
'product.created'
'product.updated'
'product.price_changed'

// Order Events
'order.created'
'order.status_changed'
'order.completed'
'order.cancelled'

// Payment Events
'payment.initiated'
'payment.completed'
'payment.failed'

// Inventory Events
'inventory.adjusted'
'inventory.low_stock'
'inventory.movement'

// Security Events
'user.login'
'user.logout'
'user.failed_login'
'transaction.voided'
'price.overridden'
```

---

## Database Architecture

### Schema Design: Service-Oriented

PostgreSQL database organized into **8 service-specific schemas**:

```
opencommerce_db
├── product_service
│   ├── products
│   ├── merchandise_codes
│   ├── promotions
│   ├── item_lists
│   ├── item_list_entries
│   ├── tax_strategies
│   └── product_events
│
├── order_service
│   ├── retail_transactions
│   ├── transaction_line_items
│   ├── transaction_promotions
│   ├── transaction_tenders
│   └── order_events
│
├── inventory_service
│   ├── inventory
│   └── inventory_movements
│
├── auth_service
│   ├── users
│   ├── sessions
│   ├── permissions
│   ├── role_permissions
│   └── user_activity_log
│
├── compliance_service
│   ├── audit_logs (append-only)
│   ├── payment_tokens
│   ├── user_sessions
│   ├── failed_login_attempts
│   ├── account_lockouts
│   ├── password_history
│   ├── encryption_keys
│   ├── data_access_log
│   ├── pci_compliance_checklist
│   ├── age_verification_logs
│   └── compliance_audit_trail
│
├── customer_service
│   ├── customers
│   └── loyalty_members
│
├── reporting_service
│   ├── sales_aggregates
│   └── analytics_events
│
└── payment_service
    ├── payment_transactions
    └── refunds
```

### Key Design Patterns

#### 1. Event Sourcing
All state changes are recorded as events:
```sql
CREATE TABLE product_service.product_events (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    user_id UUID,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

#### 2. ARTS Compliance
Retail transaction standard (Association for Retail Technology Standards):
```sql
CREATE TABLE order_service.retail_transactions (
    transaction_id UUID PRIMARY KEY,
    business_date DATE NOT NULL,
    workstation_id VARCHAR(50),
    operator_id UUID,
    sequence_number INTEGER,
    -- ARTS-compliant fields
);
```

#### 3. Channel-Specific Pricing
Dynamic pricing per sales channel:
```sql
CREATE TABLE product_service.products (
    id UUID PRIMARY KEY,
    base_price DECIMAL(10, 2) NOT NULL,
    channel_pricing JSONB DEFAULT '{
        "IN_STORE": 0.00,
        "DOORDASH": 0.30,
        "UBER_EATS": 0.25,
        "WEBSITE": 0.10
    }'::jsonb,
    -- Calculated at query time
);
```

#### 4. pgvector for AI Search
Semantic search with embeddings:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE product_service.products (
    id UUID PRIMARY KEY,
    name TEXT,
    description TEXT,
    embedding vector(384), -- 384-dim embeddings from Ollama
    search_vector tsvector -- Full-text search
);

CREATE INDEX ON products USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON products USING gin (search_vector);
```

---

## Security Architecture

### PCI DSS Compliance

#### Requirement 3: Protect Stored Cardholder Data
✅ **No PAN storage** - Use Stripe tokenization
✅ **Encrypted payment tokens** in `compliance_service.payment_tokens`
✅ **Encryption key rotation** tracked in `encryption_keys`

#### Requirement 8: Identify and Authenticate Access
✅ **Unique user IDs** for all employees
✅ **Multi-factor authentication** (PIN + terminal ID)
✅ **Account lockout** after 6 failed attempts
✅ **Password history** prevents reuse
✅ **Session timeout** after 15 minutes

#### Requirement 10: Track and Monitor Access
✅ **Append-only audit logs** (no UPDATE/DELETE)
✅ **Tamper-proof logging** with triggers
✅ **Failed login tracking**
✅ **Data access logging** for sensitive queries

### Security Layers

```
┌───────────────────────────────────────────────────────────┐
│  Layer 1: Network Security                                │
│  - Helmet.js security headers                             │
│  - CORS policy                                            │
│  - Rate limiting (100 req/min)                            │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│  Layer 2: Authentication                                  │
│  - JWT token validation                                   │
│  - PIN verification (bcrypt)                              │
│  - Session management (Redis)                             │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│  Layer 3: Authorization (RBAC)                            │
│  - Role-based permissions                                 │
│  - Resource-level access control                          │
│  - Manager override for sensitive ops                     │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│  Layer 4: Data Protection                                 │
│  - Payment tokenization (Stripe)                          │
│  - Encrypted storage (AES-256)                            │
│  - Secure key management                                  │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│  Layer 5: Audit & Compliance                              │
│  - Append-only audit logs                                 │
│  - PCI compliance checklist                               │
│  - Age verification tracking                              │
└───────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

### Single-Store Deployment

```
┌─────────────────────────────────────────────────────────┐
│              Store PC / Terminal                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Docker Compose Stack                     │  │
│  │                                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │  │
│  │  │   App    │  │ Postgres │  │  Redis   │      │  │
│  │  │Container │  │Container │  │Container │      │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘      │  │
│  │       │             │             │            │  │
│  │  ┌────▼─────────────▼─────────────▼─────┐      │  │
│  │  │     Docker Network (bridge)          │      │  │
│  │  └──────────────────────────────────────┘      │  │
│  │                                                  │  │
│  │  ┌──────────┐                                   │  │
│  │  │  Ollama  │  (Optional AI search)             │  │
│  │  │Container │                                   │  │
│  │  └──────────┘                                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  USB Connections:                                       │
│  ├─ Thermal Printer (ESC/POS)                          │
│  ├─ Barcode Scanner (HID)                              │
│  └─ Stripe Terminal Reader                             │
└─────────────────────────────────────────────────────────┘

Internet Connection:
├─ DoorDash webhook delivery
├─ Uber Eats webhook delivery
├─ Stripe payment processing
└─ Elistar back-office sync
```

### Multi-Store Deployment

```
┌───────────────────────────────────────────────────────────────────┐
│                          CLOUD LAYER                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         Central Aggregation Server (Optional)              │  │
│  │  ├─ Master database (PostgreSQL)                           │  │
│  │  ├─ Analytics dashboard                                    │  │
│  │  └─ Multi-store reporting                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
┌───────────────────▼─┐  ┌──────▼──────┐  ┌▼──────────────────┐
│  Store 1 (Ocala)    │  │ Store 2     │  │ Store 3           │
│  Docker Stack       │  │Docker Stack │  │ Docker Stack      │
│  - Local DB         │  │- Local DB   │  │ - Local DB        │
│  - Local Redis      │  │- Local Redis│  │ - Local Redis     │
│  - Offline capable  │  │- Offline cap│  │ - Offline capable │
│  - POS terminals    │  │- POS term   │  │ - POS terminals   │
└─────────────────────┘  └─────────────┘  └───────────────────┘
```

---

## Scalability & Performance

### Current Capacity
- **Transactions per second (TPS)**: 15 baseline, 100 peak
- **Database connections**: 20-pool size
- **Redis cache**: 2GB max memory
- **Response time**: P95 < 200ms, P99 < 500ms

### Scaling Strategy

#### Vertical Scaling (Phase 1 - Current)
- Increase CPU/RAM on store PC
- Optimize database queries
- Redis caching layer

#### Horizontal Scaling (Phase 2)
```
Load Balancer
    ├─ App Instance 1
    ├─ App Instance 2
    └─ App Instance 3
         ├─ Shared PostgreSQL (primary/replica)
         └─ Redis Cluster
```

#### Microservices Migration (Phase 3)
```
API Gateway
    ├─ Product Service (separate deployment)
    ├─ Order Service (separate deployment)
    ├─ Payment Service (separate deployment)
    └─ Inventory Service (separate deployment)
         ├─ Message Queue (Kafka/RabbitMQ)
         └─ Service Mesh (Istio/Linkerd)
```

### Performance Optimizations

1. **Database**:
   - Connection pooling (pg-pool)
   - Indexed queries (barcode, product_id, order_id)
   - pgvector IVFFlat index for fast similarity search
   - Materialized views for reporting

2. **Caching**:
   - Redis for product catalog (15-min TTL)
   - Session storage in Redis
   - Rate limit counters in Redis

3. **Frontend**:
   - Code splitting (Vite lazy loading)
   - React Query for server state caching
   - IndexedDB for offline data
   - Service Worker for offline-first

4. **API**:
   - Compression middleware (gzip)
   - ETags for conditional requests
   - Pagination for large datasets

---

**Architecture Version**: 1.0
**Last Updated**: 2025-11-14
**Designed For**: Omnichannel POS with Offline-First Support
