# OpenCommerce - Product Requirements Document (PRD)

## Document Information
- **Product Name**: OpenCommerce Omnichannel POS System
- **Version**: 1.0
- **Date**: November 14, 2025
- **Status**: Active Development
- **Owner**: Product Team
- **Stakeholders**: Store Owners, Cashiers, Managers, IT Team

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Goals & Objectives](#goals--objectives)
4. [User Personas](#user-personas)
5. [Functional Requirements](#functional-requirements)
6. [Non-Functional Requirements](#non-functional-requirements)
7. [User Stories](#user-stories)
8. [Success Metrics](#success-metrics)
9. [Technical Constraints](#technical-constraints)
10. [Future Roadmap](#future-roadmap)

---

## Executive Summary

**OpenCommerce** is an omnichannel point-of-sale system designed for retail businesses (specifically liquor stores) that need to manage orders from multiple sales channels (in-store, DoorDash, Uber Eats, website) in a unified interface while maintaining integration with Elistar back-office systems.

### Key Features
- **Unified Order Queue**: Single view for all channels
- **Offline-First Operation**: Continue working without internet
- **PCI DSS Compliant**: Secure payment processing
- **Elistar Integration**: Seamless back-office sync
- **Age Verification**: Regulatory compliance for alcohol sales
- **Real-Time Inventory**: Accurate stock tracking across channels
- **Smart Pricing**: Channel-specific markup automation

### Target Market
- Small to medium-sized retail stores (1-50 locations)
- Liquor stores, convenience stores, specialty retail
- Businesses using Elistar back-office software
- Stores with delivery partnerships (DoorDash, Uber Eats)

---

## Problem Statement

### Current Pain Points

#### 1. **Fragmented Order Management**
**Problem**: Store staff must monitor multiple tablets/apps for different delivery services (DoorDash app, Uber Eats app, in-store POS, website admin panel).

**Impact**:
- Missed orders (overlooked notifications)
- Slow response times
- Customer complaints
- Lost revenue

**Solution**: Unified order queue showing all channels in one interface.

---

#### 2. **Manual Price Management**
**Problem**: DoorDash charges 30% commission, Uber Eats 25%, requiring different prices per channel. Manual price updates are error-prone and time-consuming.

**Impact**:
- Pricing errors leading to lost margin
- Hours spent updating prices across platforms
- Inconsistent pricing

**Solution**: Automatic channel-specific markup calculation and sync.

---

#### 3. **Inventory Accuracy**
**Problem**: Inventory tracked separately in POS and delivery platforms, leading to overselling and stockouts.

**Impact**:
- Selling items that are out of stock
- Customer disappointment
- Cancelled orders
- Negative reviews

**Solution**: Real-time inventory sync across all channels with reservation system.

---

#### 4. **Age Verification Compliance**
**Problem**: Alcohol delivery requires ID verification, but no standardized process or audit trail.

**Impact**:
- Regulatory fines
- License suspension risk
- Manual record-keeping
- Audit failures

**Solution**: Built-in age verification with photo capture and audit trail.

---

#### 5. **Offline Dependency**
**Problem**: Internet outages halt all sales when POS requires constant connectivity.

**Impact**:
- Lost sales during outages
- Customer frustration
- Business downtime

**Solution**: Offline-first architecture with local data sync.

---

#### 6. **Complex Promotion Management**
**Problem**: Setting up promotions (Mix & Match, BOGO) requires manual configuration across multiple systems.

**Impact**:
- Limited promotional capabilities
- Marketing restrictions
- Manual discount application
- Errors in promotion calculations

**Solution**: Centralized promotion engine with auto-apply.

---

## Goals & Objectives

### Business Goals

#### Primary Goals
1. **Increase Revenue**: Optimize multi-channel sales with unified management
   - Target: 25% increase in online order volume within 6 months
   - Enable more channels without additional staff

2. **Reduce Operational Costs**: Automate pricing, inventory, and order management
   - Target: Save 10 hours/week in manual tasks
   - Reduce pricing errors to < 1%

3. **Improve Customer Experience**: Faster order processing and accurate inventory
   - Target: < 2 minute average order acceptance time
   - Target: < 5% stockout rate

4. **Ensure Compliance**: Meet PCI DSS and alcohol regulations
   - Target: Pass all compliance audits
   - 100% age verification for alcohol orders

#### Secondary Goals
5. **Enable Scalability**: Support multi-store expansion
   - Architecture ready for 100+ stores
   - Centralized reporting and management

6. **Data-Driven Decisions**: Analytics for sales trends and optimization
   - Real-time sales dashboards
   - Channel performance comparison

---

### User Goals

#### Store Staff (Cashiers)
- Process in-store transactions quickly (< 60 seconds average)
- View all orders in one place
- Clear instructions for order fulfillment
- Easy age verification workflow

#### Store Managers
- Monitor real-time sales performance
- Override prices when needed (with authorization)
- Manage inventory levels
- Generate end-of-day reports

#### Store Owners
- View multi-store analytics
- Configure pricing strategies
- Ensure compliance
- Optimize profitability per channel

#### IT Administrators
- Easy deployment and maintenance
- Reliable offline operation
- Comprehensive audit logs
- Integration with existing systems (Elistar)

---

## User Personas

### Persona 1: Sarah - Cashier

**Demographics**:
- Age: 24
- Experience: 6 months in retail
- Tech Savvy: Moderate

**Goals**:
- Check out customers quickly
- Avoid mistakes (wrong prices, incorrect change)
- Prepare delivery orders efficiently

**Pain Points**:
- Juggling multiple tablets for different delivery apps
- Forgetting to check age for alcohol
- Confusion when prices don't match

**How OpenCommerce Helps**:
- Single interface for all orders
- Automatic age verification prompts
- Clear pricing with channel indicators

---

### Persona 2: Mike - Store Manager

**Demographics**:
- Age: 35
- Experience: 8 years in retail management
- Tech Savvy: High

**Goals**:
- Maximize sales across all channels
- Maintain accurate inventory
- Ensure staff compliance
- Generate reports for owner

**Pain Points**:
- No visibility into online orders
- Manual inventory counts
- Time-consuming price updates
- Difficult to track staff performance

**How OpenCommerce Helps**:
- Real-time order queue dashboard
- Automated inventory tracking
- Channel-specific pricing automation
- Built-in analytics and reports

---

### Persona 3: David - Store Owner (Multi-Location)

**Demographics**:
- Age: 52
- Experience: 20 years business owner
- Tech Savvy: Low-to-Moderate
- Stores: 3 locations

**Goals**:
- Increase profitability
- Expand to more delivery channels
- Maintain compliance (avoid fines)
- Understand which channels are most profitable

**Pain Points**:
- Can't compare performance across stores
- Worried about compliance violations
- Doesn't know if delivery commissions are worth it
- Expensive enterprise POS solutions

**How OpenCommerce Helps**:
- Multi-store dashboard
- Compliance audit trails
- Channel profitability analytics
- Affordable deployment (Docker on existing PCs)

---

## Functional Requirements

### FR-1: User Authentication & Authorization

#### FR-1.1: PIN-Based Login
**Priority**: P0 (Must Have)

**Description**: Cashiers and managers log in using a 4-digit PIN for quick access at terminals.

**Acceptance Criteria**:
- User enters 4-digit PIN
- System validates PIN within 500ms
- Failed login attempts logged
- Account lockout after 6 failed attempts
- Auto-logout after 15 minutes of inactivity

**Security Requirements**:
- PIN stored as bcrypt hash
- Minimum PIN complexity (no sequential digits like 1234)
- Session token expires after timeout

---

#### FR-1.2: Role-Based Access Control
**Priority**: P0 (Must Have)

**Description**: Different roles have different permissions.

**Roles**:
| Role | Permissions |
|------|-------------|
| CASHIER | Process sales, view orders, check inventory |
| MANAGER | All cashier permissions + price override, void transactions, refunds, reports |
| ADMIN | All manager permissions + user management, product management, system config |
| SUPER_ADMIN | Full system access, multi-store management |

**Acceptance Criteria**:
- Permissions enforced at API level
- Sensitive actions require manager override
- All permission checks logged

---

### FR-2: Point-of-Sale (POS) Terminal

#### FR-2.1: Barcode Scanning
**Priority**: P0 (Must Have)

**Description**: Scan product barcodes to add items to cart.

**Acceptance Criteria**:
- Support USB HID barcode scanners
- Auto-focus on barcode input field
- Product lookup within 200ms
- Display product details (name, price, stock)
- Show error if product not found
- Support manual barcode entry

**Technical Details**:
- API: GET /api/products/{barcode}
- Cache frequently scanned items in Redis

---

#### FR-2.2: Shopping Cart Management
**Priority**: P0 (Must Have)

**Description**: Add, remove, and modify items in cart.

**Acceptance Criteria**:
- Add item by barcode
- Update item quantity (increment/decrement)
- Remove item from cart
- Display running subtotal, tax, total
- Auto-calculate tax based on store configuration
- Auto-apply eligible promotions
- Support multiple payment methods (card, cash, split tender)

**Technical Details**:
- API: POST /api/cart, POST /api/cart/{id}/items
- Cart state persisted in database
- Real-time total recalculation

---

#### FR-2.3: Tax Calculation
**Priority**: P0 (Must Have)

**Description**: Automatically calculate sales tax.

**Acceptance Criteria**:
- Tax rate configurable per store
- Apply tax to taxable items only
- Display tax breakdown on receipt
- Support tax-exempt transactions (with manager override)

**Formula**: `tax = subtotal × tax_rate`

---

#### FR-2.4: Promotion Engine
**Priority**: P1 (Should Have)

**Description**: Automatically apply eligible promotions.

**Supported Promotion Types**:
1. **Mix & Match**: "Buy 3 for $X" (e.g., 3 beers for $30)
2. **BOGO**: Buy One Get One (50% off, free, etc.)
3. **Combo Deals**: Bundle pricing (e.g., burger + fries + drink = $12)
4. **Percent Off**: X% off specific items/categories
5. **Dollar Off**: $X off purchase
6. **Price Each**: Override price when buying specific quantity

**Acceptance Criteria**:
- Promotions auto-apply when cart conditions met
- Display promotion description in cart
- Show savings amount
- Support day-of-week scheduling
- Support date range activation
- Promotions stackable unless configured otherwise

**Technical Details**:
- Promotion rules stored in database
- Evaluated on every cart change
- Priority ordering for conflicting promotions

---

### FR-3: Payment Processing

#### FR-3.1: Card Payments (Stripe Terminal)
**Priority**: P0 (Must Have)

**Description**: Process card payments via Stripe Terminal reader.

**Acceptance Criteria**:
- Support EMV chip cards
- Support NFC/contactless (Apple Pay, Google Pay, tap-to-pay)
- Support magnetic stripe (fallback)
- Display payment status on terminal screen
- Print receipt after successful payment
- Handle declined payments gracefully
- Support refunds (with manager approval)

**Security Requirements**:
- P2PE (Point-to-Point Encryption) - card data encrypted in reader
- No PAN (Primary Account Number) storage
- Store only: token, last4, brand, timestamp
- PCI DSS Level 1 compliance

**Technical Details**:
- API: POST /api/payment/card
- Integration: Stripe Terminal SDK
- Supported readers: Verifone P400, BBPOS WisePad 3

---

#### FR-3.2: Cash Payments
**Priority**: P0 (Must Have)

**Description**: Process cash payments with change calculation.

**Acceptance Criteria**:
- Cashier enters amount tendered
- System calculates change due
- Display change breakdown (bills and coins)
- Open cash drawer automatically
- Support even-cash rounding (optional)

**Example**:
```
Total: $44.62
Tendered: $50.00
Change: $5.38

Breakdown:
- $5 bills: 1
- Quarters: 1
- Dimes: 1
- Pennies: 3
```

---

#### FR-3.3: Split Tender
**Priority**: P1 (Should Have)

**Description**: Support multiple payment methods for single transaction.

**Acceptance Criteria**:
- Customer pays partial amount with card
- Remaining balance paid with cash
- Both payments logged separately
- Single receipt showing both tenders

**Example**:
- Total: $100
- Card: $70
- Cash: $30

---

### FR-4: Omnichannel Order Management

#### FR-4.1: Unified Order Queue
**Priority**: P0 (Must Have)

**Description**: Display orders from all channels in single interface.

**Acceptance Criteria**:
- Show orders from: IN_STORE, DOORDASH, UBER_EATS, WEBSITE
- Real-time updates when new orders arrive
- Filter by status (NEW, ACCEPTED, PREPARING, READY, PICKED_UP)
- Filter by channel
- Sort by creation time (oldest first by default)
- Display channel icon for quick identification
- Highlight orders with alcohol (age verification required)
- Show estimated pickup time
- Display customer contact info

**Technical Details**:
- API: GET /api/orders/today
- WebSocket or Server-Sent Events for real-time updates
- Polling fallback (5-second interval)

---

#### FR-4.2: Order Status Management
**Priority**: P0 (Must Have)

**Description**: Update order status as it progresses.

**Status Flow**:
```
NEW → ACCEPTED → PREPARING → READY → PICKED_UP → COMPLETED
  ↓       ↓          ↓          ↓
CANCELLED ────────────────────────
```

**Acceptance Criteria**:
- Staff can update status with single click
- Status changes logged with timestamp and user ID
- Notification sent to customer/dasher on key status changes
- Cannot skip statuses (must follow flow)
- Cancelled orders require reason (dropdown + optional notes)

---

#### FR-4.3: Age Verification for Alcohol
**Priority**: P0 (Must Have)

**Description**: Verify customer age for alcohol orders.

**Acceptance Criteria**:
- System flags orders containing alcohol
- Cannot mark PICKED_UP without age verification
- Support verification methods:
  1. **Manual ID Check**: Staff enters customer age
  2. **ID Scanner**: Scan driver's license barcode
  3. **Photo Upload**: Take photo of ID (stored securely)
- Log verification details:
  - Verification method
  - Customer age (or DOB)
  - ID type (driver's license, passport, etc.)
  - ID state/country
  - Verifier user ID
  - Timestamp
  - Photo (optional)
- Fail verification if age < 21
- Audit trail for compliance (append-only logs)

**Compliance Requirements**:
- Logs retained for 3 years
- No modification of verification records
- Export capability for regulatory audits

---

### FR-5: Inventory Management

#### FR-5.1: Real-Time Inventory Tracking
**Priority**: P0 (Must Have)

**Description**: Track inventory across all channels in real-time.

**Acceptance Criteria**:
- Display available quantity for each product
- Reserve inventory when online order created
- Deduct inventory when sale completed
- Release reservation if order cancelled
- Show low-stock warnings
- Support inventory adjustments (with reason)

**Inventory States**:
- **On Hand**: Total physical inventory
- **Available**: On hand - reserved
- **Reserved**: Held for pending orders

**Formula**: `available = on_hand - reserved`

---

#### FR-5.2: Inventory Movements Audit Trail
**Priority**: P1 (Should Have)

**Description**: Log all inventory changes for audit and reconciliation.

**Movement Types**:
- SALE: Sold to customer
- RECEIVE: New stock received
- ADJUST: Manual adjustment (cycle count, correction)
- RETURN: Customer return
- RESERVATION: Reserved for order
- RELEASE: Reservation cancelled
- DAMAGE: Damaged goods write-off
- THEFT: Shrinkage

**Acceptance Criteria**:
- Every inventory change creates movement record
- Log: product, quantity, type, user, reason, reference (order/PO ID), timestamp
- Cannot delete movement records
- Generate inventory movement report

---

#### FR-5.3: Low Stock Alerts
**Priority**: P1 (Should Have)

**Description**: Notify managers when inventory falls below reorder point.

**Acceptance Criteria**:
- Configurable reorder point per product
- Alert when available quantity < reorder point
- Display alert in back-office dashboard
- Optional email/SMS notification
- Suggested reorder quantity
- Generate purchase order (optional)

---

### FR-6: Elistar Back-Office Integration

#### FR-6.1: Product Import (NAXML)
**Priority**: P0 (Must Have)

**Description**: Import products, prices, and promotions from Elistar.

**Acceptance Criteria**:
- Support NAXML XML format
- Parse: Items, Merchandise Codes, Promotions, Item Lists, Combos
- Calculate channel-specific pricing automatically
- Update existing products (upsert)
- Log sync timestamp
- Display sync status in back-office

**Channel Pricing Markup**:
- DoorDash: Base price × 1.30 (+30%)
- Uber Eats: Base price × 1.25 (+25%)
- Website: Base price × 1.10 (+10%)
- In-Store: Base price (no markup)

**Technical Details**:
- API: POST /api/elistar/import
- XML parser: fast-xml-parser
- Batch processing for large imports

---

#### FR-6.2: Transaction Export
**Priority**: P0 (Must Have)

**Description**: Export transaction journal back to Elistar for accounting.

**Acceptance Criteria**:
- Export completed transactions
- Generate NAXML format
- Include: transaction ID, items, quantities, prices, tenders, taxes
- Support date range filter
- Export on-demand or scheduled (daily EOD)

**Technical Details**:
- API: POST /api/elistar/export
- ARTS-compliant transaction format

---

### FR-7: Channel Integration

#### FR-7.1: DoorDash Integration
**Priority**: P0 (Must Have)

**Description**: Receive and manage DoorDash orders.

**Acceptance Criteria**:
- Receive webhook notifications for new orders
- Verify webhook signature (HMAC-SHA256)
- Parse DoorDash order format
- Send order acceptance/rejection
- Update order status to DoorDash
- Sync menu (products) to DoorDash

**Webhook Events**:
- order.created
- order.cancelled
- dasher.assigned

---

#### FR-7.2: Uber Eats Integration
**Priority**: P0 (Must Have)

**Description**: Receive and manage Uber Eats orders.

**Acceptance Criteria**:
- Receive webhook notifications for new orders
- Verify webhook signature
- Parse Uber Eats order format (prices in cents)
- Send order acceptance with estimated ready time
- Update order status
- Sync menu to Uber Eats

**Webhook Events**:
- orders.notification (ORDER_CREATED, ORDER_CANCELLED)

---

#### FR-7.3: Website Integration
**Priority**: P1 (Should Have)

**Description**: API for custom e-commerce website.

**Acceptance Criteria**:
- API endpoint for order creation
- Real-time inventory availability
- Product catalog API
- Order status updates
- Pickup/delivery option selection

---

### FR-8: Receipt Printing

#### FR-8.1: Thermal Receipt Printing
**Priority**: P0 (Must Have)

**Description**: Print receipts on ESC/POS thermal printers.

**Acceptance Criteria**:
- Support Epson TM-T20III, Star TSP143 printers
- USB connection via node-hid
- Print receipt with:
  - Store name, address, phone
  - Transaction date/time
  - Cashier name
  - Items with quantities and prices
  - Subtotal, tax, total
  - Payment method (card last4 or "Cash")
  - Change due (if cash)
  - Promotions applied
  - Transaction number
  - Return policy footer
- Auto-cut paper
- Open cash drawer (cash transactions)

**Technical Details**:
- Library: escpos, escpos-usb
- ESC/POS command language

---

### FR-9: Offline Mode

#### FR-9.1: Offline Operation
**Priority**: P0 (Must Have)

**Description**: Continue POS operations without internet.

**Acceptance Criteria**:
- Detect connection loss
- Display offline indicator in UI
- Cache product catalog in IndexedDB
- Process transactions offline
- Queue transactions for sync
- Auto-sync when connection restored
- Conflict resolution (last-write-wins, server-wins, manual)

**Cached Data**:
- Products (name, price, barcode, tax flag)
- Promotions
- User credentials (PIN hashes)
- Tax configuration

**Sync Priority**:
1. Completed transactions
2. Inventory adjustments
3. User activity logs

---

### FR-10: Back-Office Management

#### FR-10.1: Product Management
**Priority**: P0 (Must Have)

**Description**: Admin interface to manage products.

**Acceptance Criteria**:
- Add new products
- Edit product details (name, price, barcode, tax, age verification)
- Set channel-specific pricing
- Assign merchandise codes
- Enable/disable products
- Bulk import via CSV
- Search and filter products

---

#### FR-10.2: Promotion Management
**Priority**: P1 (Should Have)

**Description**: Create and manage promotions.

**Acceptance Criteria**:
- Create Mix & Match deals
- Create BOGO promotions
- Create combo deals
- Set activation dates
- Set day-of-week restrictions
- Priority ordering
- Enable/disable promotions
- Preview promotion impact

---

#### FR-10.3: User Management
**Priority**: P0 (Must Have)

**Description**: Manage employee accounts.

**Acceptance Criteria**:
- Create user accounts
- Set role (Cashier, Manager, Admin)
- Set/reset PIN
- Assign to store/terminal
- Enable/disable accounts
- View user activity logs
- Track performance metrics (sales per cashier)

---

#### FR-10.4: Store Configuration
**Priority**: P0 (Must Have)

**Description**: Configure store settings.

**Acceptance Criteria**:
- Store name, address, phone
- Tax rate configuration
- Timezone setting
- Channel markup percentages
- Hardware configuration (printer, scanner IDs)
- Feature flags (enable/disable channels)
- Receipt customization (logo, footer text)

---

### FR-11: Reporting & Analytics

#### FR-11.1: Sales Reports
**Priority**: P1 (Should Have)

**Description**: Generate sales reports.

**Report Types**:
1. **Daily Sales Summary**:
   - Total revenue
   - Transaction count
   - Average order value
   - Sales by channel
   - Sales by hour

2. **Product Performance**:
   - Top 10 selling products
   - Low performers
   - Sales by category

3. **Channel Comparison**:
   - Revenue per channel
   - Order volume per channel
   - Profitability (after commission)

4. **Cashier Performance**:
   - Sales per cashier
   - Transactions per hour
   - Average transaction value

**Acceptance Criteria**:
- Export to PDF, CSV, Excel
- Date range selection
- Multi-store comparison (if applicable)
- Visual charts and graphs

---

#### FR-11.2: Compliance Reports
**Priority**: P0 (Must Have)

**Description**: Generate compliance audit reports.

**Report Types**:
1. **Age Verification Log**: All alcohol verifications
2. **Audit Trail**: User actions, overrides, voids
3. **PCI Compliance Checklist**: Security controls status
4. **Failed Login Attempts**: Security monitoring

**Acceptance Criteria**:
- Filterable by date range, user, action type
- Export to PDF (for auditors)
- Append-only (no modification)
- Retention: 3 years minimum

---

## Non-Functional Requirements

### NFR-1: Performance

| Metric | Requirement |
|--------|-------------|
| **Product Lookup** | < 200ms (99th percentile) |
| **Cart Operations** | < 500ms |
| **Payment Processing** | < 2s (card), < 1s (cash) |
| **Order Queue Load** | < 1s |
| **API Response Time** | < 200ms (P95), < 500ms (P99) |
| **Database Query** | < 100ms (simple), < 500ms (complex) |
| **Offline Mode Detection** | < 5s |

---

### NFR-2: Scalability

| Aspect | Requirement |
|--------|-------------|
| **Concurrent Users** | Support 50 simultaneous POS terminals per store |
| **Transactions per Second** | 15 TPS baseline, 100 TPS peak |
| **Database Size** | Support 1M+ products, 10M+ transactions |
| **Multi-Store** | Support 100+ stores in single deployment |
| **Order Volume** | Handle 1,000 orders/day per store |

---

### NFR-3: Availability

| Aspect | Requirement |
|--------|-------------|
| **Uptime** | 99.9% (excluding planned maintenance) |
| **Offline Capability** | Full POS functionality without internet |
| **Recovery Time** | < 5 minutes for system restart |
| **Data Backup** | Daily automated backups with 30-day retention |
| **Disaster Recovery** | RPO < 1 hour, RTO < 4 hours |

---

### NFR-4: Security

| Requirement | Implementation |
|-------------|----------------|
| **PCI DSS Compliance** | Level 1 compliance (Stripe Terminal P2PE) |
| **Data Encryption** | TLS 1.3 in transit, AES-256 at rest |
| **Authentication** | Bcrypt password hashing (cost factor 12) |
| **Session Management** | 15-minute timeout, Redis-backed sessions |
| **Audit Logging** | Append-only, tamper-proof logs |
| **Access Control** | Role-based (RBAC) with principle of least privilege |
| **Vulnerability Scanning** | Monthly automated scans |
| **Penetration Testing** | Annual third-party pen test |

---

### NFR-5: Usability

| Aspect | Requirement |
|--------|-------------|
| **Training Time** | < 2 hours for cashier proficiency |
| **Error Rate** | < 1% transaction errors |
| **Mobile Responsive** | Support tablets (iOS/Android) for order queue |
| **Accessibility** | WCAG 2.1 Level AA compliance |
| **Language Support** | English (initial), Spanish (future) |

---

### NFR-6: Maintainability

| Aspect | Requirement |
|--------|-------------|
| **Code Coverage** | > 70% unit test coverage |
| **Documentation** | API docs, architecture docs, user manual |
| **Logging** | Structured JSON logs (Winston) |
| **Monitoring** | Health checks, error tracking (Sentry) |
| **Deployment** | Docker Compose, zero-downtime updates |
| **Database Migrations** | Versioned, reversible migrations |

---

## User Stories

### Epic 1: POS Terminal

**US-1.1**: As a **cashier**, I want to scan a product barcode so that I can quickly add items to the cart.
- **Acceptance**: Barcode scans add item within 1 second, displays product name and price

**US-1.2**: As a **cashier**, I want to see the running total as I scan items so that the customer knows the total.
- **Acceptance**: Total updates in real-time, displayed prominently

**US-1.3**: As a **cashier**, I want promotions to apply automatically so that I don't have to remember complex deals.
- **Acceptance**: Cart shows applied promotions with savings amount

**US-1.4**: As a **cashier**, I want to process card payments quickly so that customers aren't waiting.
- **Acceptance**: Card payment completes within 2 seconds after card tap

**US-1.5**: As a **cashier**, I want change calculations shown clearly so that I give correct change.
- **Acceptance**: Display shows exact bills/coins to give

---

### Epic 2: Order Management

**US-2.1**: As a **store staff**, I want to see all delivery orders in one place so that I don't miss any orders.
- **Acceptance**: Unified queue shows DoorDash, Uber Eats, website orders

**US-2.2**: As a **store staff**, I want to be alerted to new orders so that I can accept them quickly.
- **Acceptance**: Sound notification + visual badge for new orders

**US-2.3**: As a **store staff**, I want to filter orders by status so that I can focus on orders that need attention.
- **Acceptance**: Filter buttons (NEW, PREPARING, READY) update queue instantly

**US-2.4**: As a **store staff**, I want to verify customer age for alcohol so that we stay compliant.
- **Acceptance**: System prevents order completion without age verification, logs all verifications

---

### Epic 3: Management

**US-3.1**: As a **manager**, I want to override prices when needed so that I can provide customer service.
- **Acceptance**: Price override requires manager PIN, logs override with reason

**US-3.2**: As a **manager**, I want to see sales reports by channel so that I know which are most profitable.
- **Acceptance**: Report shows revenue and margin per channel

**US-3.3**: As a **manager**, I want to adjust inventory when doing cycle counts so that inventory stays accurate.
- **Acceptance**: Adjustment requires reason, creates audit log

**US-3.4**: As a **manager**, I want to void transactions with justification so that mistakes can be corrected.
- **Acceptance**: Void requires manager PIN + reason dropdown

---

### Epic 4: Back-Office

**US-4.1**: As an **admin**, I want to import products from Elistar so that pricing stays in sync.
- **Acceptance**: NAXML import creates/updates products, calculates channel pricing

**US-4.2**: As an **admin**, I want to create promotions with date ranges so that I can run limited-time deals.
- **Acceptance**: Promotion activates/deactivates automatically on configured dates

**US-4.3**: As an **admin**, I want to manage user accounts so that only authorized staff can use the system.
- **Acceptance**: Create user with role, set PIN, enable/disable account

---

## Success Metrics

### Primary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Order Processing Time** | < 2 minutes (acceptance) | Time from order creation to ACCEPTED status |
| **Transaction Speed** | < 60 seconds | Time from first scan to receipt printed |
| **Inventory Accuracy** | > 95% | Cycle count variance |
| **Stockout Rate** | < 5% | Orders cancelled due to out-of-stock |
| **System Uptime** | > 99.9% | Availability monitoring |
| **Offline Resilience** | 100% functionality | POS works without internet |
| **Compliance Adherence** | 100% | Age verification for all alcohol sales |
| **Staff Adoption** | > 90% usage | Percentage of staff using system daily |

---

### Secondary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Online Order Volume** | +25% in 6 months | Compare to pre-deployment |
| **Pricing Errors** | < 1% | Incorrect channel pricing incidents |
| **Customer Complaints** | < 2% orders | Order errors reported |
| **Staff Training Time** | < 2 hours | Time to proficiency |
| **Report Generation** | < 30 seconds | Time to generate daily sales report |

---

## Technical Constraints

### Infrastructure
- **Deployment**: Docker on Linux (Ubuntu 20.04+)
- **Minimum Hardware**:
  - CPU: 4 cores
  - RAM: 8GB
  - Storage: 100GB SSD
  - Network: 10 Mbps internet (for online features)

### Software Stack
- **Backend**: Node.js 20+, TypeScript 5.3
- **Frontend**: React 18, Vite
- **Database**: PostgreSQL 16 (with pgvector extension)
- **Cache**: Redis 7
- **AI**: Ollama (optional, for semantic search)

### Integrations
- **Payment**: Stripe Terminal API (no alternative)
- **Back-Office**: Elistar NAXML format (fixed schema)
- **Delivery Platforms**: DoorDash API v2, Uber Eats API v1
- **Printers**: ESC/POS compatible thermal printers (USB)

### Compliance
- **PCI DSS**: Must maintain Level 1 compliance
- **Alcohol Regulations**: State-specific age verification requirements
- **Data Retention**: 3 years for audit logs, 7 years for financial records

---

## Future Roadmap

### Phase 2 (3-6 months)
- **Loyalty Program**: Points earning and redemption
- **Customer Facing Display**: Show prices to customer during checkout
- **Multi-Language Support**: Spanish language option
- **Advanced Analytics**: Predictive inventory, demand forecasting
- **Employee Scheduling**: Shift management integration

### Phase 3 (6-12 months)
- **Mobile App**: iOS/Android app for managers
- **E-Signature**: Digital signature capture for card payments
- **Gift Cards**: Issue and redeem gift cards
- **Electronic Shelf Labels**: Price sync to ESL displays
- **Self-Checkout Kiosks**: Customer-operated terminals

### Phase 4 (12+ months)
- **Franchise Management**: Multi-franchise central management
- **AI-Powered Insights**: Sales forecasting, optimal pricing
- **Blockchain Audit Trail**: Immutable compliance logs
- **Voice Ordering**: Voice assistant for hands-free operation
- **Computer Vision**: Automatic product recognition (no barcodes)

---

## Appendix

### Glossary
- **ARTS**: Association for Retail Technology Standards
- **BOGO**: Buy One Get One
- **EOD**: End of Day
- **NAXML**: National Association Convenience Stores XML format
- **P2PE**: Point-to-Point Encryption
- **PAN**: Primary Account Number (credit card number)
- **PCI DSS**: Payment Card Industry Data Security Standard
- **POS**: Point of Sale
- **RBAC**: Role-Based Access Control
- **TPS**: Transactions Per Second
- **UPC**: Universal Product Code (barcode)

### References
- PCI DSS v4.0 Requirements
- Elistar NAXML Specification v2.1
- DoorDash Drive API Documentation
- Uber Eats Delivery API Documentation
- Stripe Terminal SDK Documentation

---

**Document Version**: 1.0
**Last Updated**: November 14, 2025
**Next Review**: February 14, 2026
**Approval**: [Pending]
