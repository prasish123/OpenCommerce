# OpenCommerce Sequence Diagrams

## Table of Contents
1. [In-Store POS Transaction Flow](#in-store-pos-transaction-flow)
2. [DoorDash Order Flow](#doordash-order-flow)
3. [Uber Eats Order Flow](#uber-eats-order-flow)
4. [Elistar Product Sync Flow](#elistar-product-sync-flow)
5. [Age Verification Flow](#age-verification-flow)
6. [Manager Override Flow](#manager-override-flow)
7. [Offline Sync Flow](#offline-sync-flow)
8. [Payment Processing Flow](#payment-processing-flow)

---

## 1. In-Store POS Transaction Flow

### Scenario: Customer purchases items at POS terminal

```mermaid
sequenceDiagram
    participant C as Cashier
    participant UI as POS Terminal UI
    participant API as Backend API
    participant Cart as Cart Service
    participant Prod as Product Service
    participant Inv as Inventory Service
    participant Promo as Promo Engine
    participant Pay as Payment Service
    participant Stripe as Stripe Terminal
    participant Receipt as Receipt Service
    participant Printer as Thermal Printer
    participant DB as PostgreSQL

    C->>UI: Scan barcode / Enter product
    UI->>API: GET /api/products/{barcode}
    API->>Prod: Get product details
    Prod->>DB: Query product with channel pricing
    DB-->>Prod: Product data + promotions
    Prod->>Inv: Check available quantity
    Inv->>DB: Query inventory
    DB-->>Inv: Stock level: 48 units
    Inv-->>Prod: In stock
    Prod-->>API: Product details
    API-->>UI: Product info (price, tax, stock)

    UI->>API: POST /api/cart/{cartId}/items
    Note over API,Cart: Add item to cart
    API->>Cart: Add item (barcode, quantity)
    Cart->>Promo: Calculate applicable promotions
    Promo->>DB: Query active promotions
    DB-->>Promo: Promotion rules
    Promo-->>Cart: Applied promotions
    Cart->>DB: Update cart state
    Cart-->>API: Updated cart totals
    API-->>UI: Cart summary (subtotal, tax, total)

    UI->>C: Display cart ($44.62 total)

    C->>UI: Select payment method (Card/Cash)

    alt Card Payment
        UI->>API: POST /api/payment/card
        API->>Pay: Process card payment
        Pay->>Stripe: Create payment intent
        Stripe-->>Pay: Intent created
        Pay->>Stripe: Collect payment (terminal reader)
        Note over Stripe: Customer taps/inserts card
        Stripe-->>Pay: Payment succeeded
        Pay->>DB: Store payment token (no PAN)
        Pay-->>API: Payment success
        API-->>UI: Payment confirmed
    else Cash Payment
        C->>UI: Enter cash tendered ($50.00)
        UI->>API: POST /api/payment/cash
        API->>Pay: Process cash payment
        Pay->>Pay: Calculate change ($5.38)
        Pay->>DB: Record cash transaction
        Pay-->>API: Change breakdown
        API-->>UI: Change due ($5.38)
        UI->>C: Display change breakdown
    end

    API->>Cart: Finalize transaction
    Cart->>DB: Create retail_transaction record
    Cart->>Inv: Deduct inventory
    Inv->>DB: Update inventory (48 → 45)
    Inv->>DB: Create inventory_movement record

    Cart-->>API: Transaction ID
    API-->>UI: Transaction completed

    UI->>API: POST /api/receipt/print
    API->>Receipt: Generate receipt
    Receipt->>DB: Query transaction details
    DB-->>Receipt: Transaction data
    Receipt->>Printer: Send ESC/POS commands
    Printer-->>Receipt: Receipt printed
    Receipt->>Printer: Open cash drawer (if cash)
    Receipt-->>API: Print success
    API-->>UI: Receipt printed

    UI->>C: Transaction complete!
```

### Key Points:
- **Inventory Check**: Real-time stock verification before adding to cart
- **Promotion Auto-Apply**: Promo engine runs on cart changes
- **PCI Compliance**: No card data stored, only Stripe tokens
- **ARTS Compliance**: Transaction logged per retail standards
- **Event Sourcing**: All changes create audit events

---

## 2. DoorDash Order Flow

### Scenario: Customer orders via DoorDash app

```mermaid
sequenceDiagram
    participant DD as DoorDash Platform
    participant WH as Webhook Endpoint
    participant API as Backend API
    participant Order as Order Aggregation Service
    participant Prod as Product Service
    participant Inv as Inventory Service
    participant UI as Order Queue UI
    participant Staff as Store Staff
    participant DB as PostgreSQL
    participant Event as Event Bus

    Note over DD: Customer places order on DoorDash
    DD->>WH: POST /webhooks/doordash/orders
    Note over WH: Headers: X-DoorDash-Signature, X-DoorDash-Timestamp
    WH->>WH: Verify signature (HMAC-SHA256)
    alt Invalid Signature
        WH-->>DD: 401 Unauthorized
    else Valid Signature
        WH->>API: Forward order payload
        API->>Order: Transform DoorDash → UnifiedOrder
        Order->>Prod: Validate products exist
        Prod->>DB: Query products by external_id
        DB-->>Prod: Product details
        Prod-->>Order: Products valid

        Order->>Inv: Check inventory for all items
        Inv->>DB: Query available quantity
        DB-->>Inv: Stock levels
        alt Insufficient Stock
            Inv-->>Order: Out of stock
            Order-->>API: Reject order
            API-->>WH: Reject response
            WH-->>DD: Order rejected (reason: out_of_stock)
        else Stock Available
            Inv->>DB: Reserve inventory
            DB-->>Inv: Inventory reserved
            Inv-->>Order: Reservation confirmed

            Order->>DB: Create retail_transaction (status: NEW)
            Order->>DB: Create transaction_line_items
            Order->>Event: Emit 'order.created' event
            Event->>Event: Trigger notifications

            Order-->>API: Order created (ID: ord-12345)
            API-->>WH: Accept order (estimated ready: 30 min)
            WH-->>DD: 200 OK (order accepted)

            Note over DD: DoorDash assigns Dasher

            Order->>UI: Push order to queue (WebSocket/SSE)
            UI->>Staff: 🔔 New DoorDash order!
            Staff->>UI: View order details
            UI->>Staff: ⚠️ Contains alcohol - age verification required

            Staff->>UI: Update status → ACCEPTED
            UI->>API: PATCH /api/orders/{id}/status
            API->>Order: Update order status
            Order->>DB: Update status + add status_history
            Order->>Event: Emit 'order.status_changed'
            Event->>DD: Send status update webhook (optional)
            Order-->>API: Status updated
            API-->>UI: Success

            Staff->>UI: Update status → PREPARING
            Note over Staff: Staff prepares order items

            Staff->>UI: Update status → READY
            UI->>API: PATCH /api/orders/{id}/status
            API->>Order: Update to READY
            Order->>DB: Update status
            Order->>Event: Emit 'order.ready'
            Event->>DD: Notify Dasher order is ready

            Note over DD: Dasher arrives at store
            Staff->>UI: Verify Dasher identity
            Staff->>UI: Age verification for alcohol
            UI->>API: POST /api/orders/{id}/verify-age
            API->>Order: Record age verification
            Order->>DB: Insert age_verification_log
            Order-->>API: Verification recorded
            API-->>UI: Success

            Staff->>UI: Update status → PICKED_UP
            UI->>API: PATCH /api/orders/{id}/status
            API->>Order: Update to PICKED_UP
            Order->>DB: Update status
            Order->>Event: Emit 'order.picked_up'

            Note over DD: Dasher delivers to customer
            DD->>WH: POST /webhooks/doordash/orders (event: DELIVERED)
            WH->>API: Order delivered notification
            API->>Order: Update to COMPLETED
            Order->>DB: Update status + completed_at timestamp
            Order->>Inv: Release reserved inventory (if any)
            Order->>Event: Emit 'order.completed'
        end
    end
```

### Key Points:
- **Signature Verification**: HMAC-SHA256 prevents webhook spoofing
- **Inventory Reservation**: Stock held when order accepted
- **Unified Order Format**: DoorDash order transformed to internal format
- **Real-time Updates**: WebSocket pushes to Order Queue UI
- **Age Verification**: Required for alcohol orders
- **Event-Driven**: All status changes emit events for audit

---

## 3. Uber Eats Order Flow

### Scenario: Customer orders via Uber Eats app

```mermaid
sequenceDiagram
    participant UE as Uber Eats Platform
    participant WH as Webhook Endpoint
    participant API as Backend API
    participant Order as Order Aggregation Service
    participant Inv as Inventory Service
    participant UI as Order Queue UI
    participant Staff as Store Staff
    participant DB as PostgreSQL

    Note over UE: Customer places order
    UE->>WH: POST /webhooks/uber/orders
    Note over WH: Headers: X-Uber-Signature, X-Uber-Timestamp
    WH->>WH: Verify signature
    WH->>API: Forward order (event: ORDER_CREATED)
    API->>Order: Transform Uber → UnifiedOrder

    Order->>Order: Parse cart items (prices in cents)
    Order->>Inv: Check inventory availability
    Inv->>DB: Query stock

    alt Stock Available
        Order->>DB: Create order (status: NEW)
        Order-->>API: Order ID
        API-->>WH: Accept (estimated_ready_time_in_seconds: 1800)
        WH-->>UE: 200 OK

        Order->>UI: Push to queue
        UI->>Staff: 🔔 New Uber Eats order

        Staff->>UI: Accept order
        UI->>API: PATCH /api/orders/{id}/status (ACCEPTED)
        API->>Order: Update status
        Order->>UE: Send acceptance webhook (optional)

        Note over Staff: Prepare order

        Staff->>UI: Mark READY
        Staff->>UI: Verify age (if alcohol)

        Note over UE: Courier picks up
        Staff->>UI: Mark PICKED_UP

        Note over UE: Delivered to customer
        UE->>WH: Delivery notification
        WH->>API: Update to COMPLETED
        API->>Order: Complete order
        Order->>DB: Update status
    else Out of Stock
        Order-->>API: Reject order
        API-->>WH: Reject (reason: unavailable)
        WH-->>UE: Order rejected
    end
```

### Key Differences from DoorDash:
- **Price Format**: Uber uses cents (e.g., 1624 = $16.24)
- **Event Types**: ORDER_CREATED, ORDER_ACCEPTED, ORDER_CANCELLED
- **Response Format**: estimated_ready_time_in_seconds vs. ISO timestamp

---

## 4. Elistar Product Sync Flow

### Scenario: Import products/promotions from Elistar back-office

```mermaid
sequenceDiagram
    participant BO as Elistar Back Office
    participant Sync as Elistar Sync Service
    participant API as Backend API
    participant Parser as NAXML Parser
    participant Prod as Product Service
    participant Promo as Promo Engine
    participant Inv as Inventory Service
    participant DB as PostgreSQL
    participant Event as Event Bus

    BO->>BO: Generate NAXML export file
    BO->>API: POST /api/elistar/import
    Note over API: Headers: X-Elistar-Secret, Content-Type: application/xml

    API->>API: Verify secret
    API->>Sync: Process NAXML file
    Sync->>Parser: Parse XML

    Parser->>Parser: Parse <Items>
    Parser->>Parser: Parse <MerchandiseCodes>
    Parser->>Parser: Parse <Promotions>
    Parser->>Parser: Parse <ItemLists>
    Parser->>Parser: Parse <Combos>

    Parser-->>Sync: Parsed data structures

    loop For each product
        Sync->>Prod: Upsert product
        Prod->>Prod: Calculate channel prices
        Note over Prod: Base price × (1 + markup)<br/>DoorDash: +30%, Uber: +25%, Web: +10%

        Prod->>DB: Check if product exists
        alt Product Exists
            Prod->>DB: UPDATE product (price, description)
            Prod->>Event: Emit 'product.updated'
        else New Product
            Prod->>DB: INSERT product
            Prod->>Event: Emit 'product.created'
        end

        Prod->>DB: Store sync metadata (last_synced_at)
    end

    loop For each merchandise code
        Sync->>Prod: Upsert merchandise code
        Prod->>DB: Upsert merchandise_codes table
        Note over DB: Used for tax & age verification
    end

    loop For each promotion
        Sync->>Promo: Create/update promotion
        Promo->>Promo: Parse promotion rules
        Note over Promo: Mix & Match, BOGO, Combo deals
        Promo->>DB: Upsert promotions table
        Promo->>DB: Link items via item_list_entries
    end

    Sync->>DB: Update sync status
    Sync->>DB: Record sync timestamp
    Sync-->>API: Sync complete (150 products, 12 promos)
    API-->>BO: 200 OK (summary)

    Note over API: Trigger menu sync to channels
    API->>API: POST /api/channels/doordash/sync-menu
    API->>API: POST /api/channels/uber/sync-menu
```

### Export Flow (Transactions to Elistar)

```mermaid
sequenceDiagram
    participant BO as Elistar Back Office
    participant API as Backend API
    participant Export as Elistar Export Service
    participant DB as PostgreSQL

    BO->>API: POST /api/elistar/export
    Note over API: Request body: { startDate, endDate, storeId }

    API->>Export: Generate transaction journal
    Export->>DB: Query retail_transactions
    Note over DB: Filter by date range & store
    DB-->>Export: Transaction records

    Export->>DB: Query transaction_line_items
    DB-->>Export: Line items

    Export->>DB: Query transaction_tenders (payments)
    DB-->>Export: Payment details

    Export->>Export: Build NAXML structure
    Export->>Export: Format XML with ARTS fields

    Export-->>API: NAXML document
    API-->>BO: XML response (transaction journal)

    BO->>BO: Import into back-office system
    BO->>BO: Update accounting records
```

---

## 5. Age Verification Flow

### Scenario: Delivering alcohol order requiring age verification

```mermaid
sequenceDiagram
    participant Staff as Store Staff
    participant UI as Order Queue UI
    participant API as Backend API
    participant Order as Order Service
    participant Camera as Device Camera
    participant ID as ID Scanner (Optional)
    participant DB as PostgreSQL
    participant Audit as Compliance Service

    Staff->>UI: View order (contains alcohol)
    UI->>Staff: ⚠️ Age verification required

    Note over Staff: Order ready, customer/dasher arrives

    Staff->>UI: Click "Verify Age"
    UI->>Staff: Show verification options

    alt Manual ID Check
        Staff->>Staff: Check physical ID
        Staff->>UI: Select "Manual ID Check"
        UI->>Staff: Enter customer age
        Staff->>UI: Input: 28 years old
        Staff->>UI: Confirm verification
    else ID Scanner
        Staff->>ID: Scan driver's license barcode
        ID-->>UI: Parsed data (DOB, name, ID#, state)
        UI->>UI: Calculate age from DOB
        UI->>Staff: Age: 28 - Verification OK
    else Photo Upload
        Staff->>Camera: Take photo of ID
        Camera-->>UI: Photo data (base64)
        UI->>UI: Display photo
        Staff->>UI: Enter age from ID
        Staff->>UI: Confirm verification
    end

    UI->>API: POST /api/orders/{id}/verify-age
    Note over API: Payload: {<br/>  method: "ID_SCAN",<br/>  customerAge: 28,<br/>  idType: "DRIVERS_LICENSE",<br/>  idState: "FL",<br/>  photoUrl: "..."<br/>}

    API->>Order: Record age verification
    Order->>Audit: Log age verification event
    Audit->>DB: INSERT age_verification_logs
    Note over DB: Append-only for compliance
    Audit->>DB: INSERT compliance_audit_trail

    alt Age ≥ 21
        Order->>DB: Mark order.age_verified = true
        Order-->>API: Verification successful
        API-->>UI: ✅ Age verified
        UI->>Staff: OK to release order
    else Age < 21
        Order-->>API: Verification failed (underage)
        API-->>UI: ❌ Customer is underage
        UI->>Staff: CANNOT release order
        Staff->>UI: Cancel order
        UI->>API: PATCH /api/orders/{id}/status (CANCELLED)
        API->>Order: Cancel order (reason: AGE_VERIFICATION_FAILED)
        Order->>Audit: Log cancellation
    end
```

### Compliance Requirements:
- **Audit Trail**: All verification attempts logged (append-only)
- **Photo Storage**: Optional, encrypted storage of ID photos
- **Regulatory Reporting**: Age verification logs exportable for audits
- **Failure Handling**: Orders must be cancelled if verification fails

---

## 6. Manager Override Flow

### Scenario: Price override requiring manager approval

```mermaid
sequenceDiagram
    participant Cashier
    participant UI as POS Terminal
    participant API as Backend API
    participant Auth as Auth Service
    participant Cart as Cart Service
    participant Audit as Audit Service
    participant DB as PostgreSQL

    Cashier->>UI: Add item to cart
    UI->>Cashier: Item price: $12.99
    Cashier->>UI: Customer requests discount
    Cashier->>UI: Click "Price Override"

    UI->>Cashier: ⚠️ Manager approval required
    UI->>Cashier: Show manager PIN prompt

    Note over Cashier: Calls manager over
    Cashier->>UI: Manager enters PIN: 5678

    UI->>API: POST /api/auth/verify-manager
    Note over API: Payload: { pin: "5678", terminalId: "POS-001" }

    API->>Auth: Verify manager PIN
    Auth->>DB: Query users WHERE pin_hash = bcrypt(5678)
    DB-->>Auth: User found (role: MANAGER)

    Auth->>Auth: Check permissions
    Note over Auth: Required: 'price_override' permission

    alt Valid Manager
        Auth->>DB: Query role_permissions
        DB-->>Auth: Permission granted
        Auth->>DB: Log user_activity (action: MANAGER_OVERRIDE_PRICE)
        Auth-->>API: Manager verified (user: mgr-123)
        API-->>UI: ✅ Manager authorized

        UI->>Cashier: Enter new price
        Cashier->>UI: New price: $9.99
        Cashier->>UI: Enter reason: "Customer loyalty discount"

        UI->>API: POST /api/cart/{cartId}/items/{barcode}/override
        Note over API: Payload: {<br/>  newPrice: 9.99,<br/>  reason: "Customer loyalty discount",<br/>  managerId: "mgr-123"<br/>}

        API->>Cart: Apply price override
        Cart->>DB: Update cart item price
        Cart->>Audit: Log price override event
        Audit->>DB: INSERT audit_logs (IMMUTABLE)
        Note over DB: Fields: old_price, new_price,<br/>manager_id, reason, timestamp

        Cart->>Cart: Recalculate cart totals
        Cart-->>API: Updated cart
        API-->>UI: Price updated ($12.99 → $9.99)
        UI->>Cashier: ✅ Override applied

    else Invalid PIN
        Auth-->>API: Invalid PIN
        API->>Auth: Log failed manager override attempt
        Auth->>DB: INSERT failed_login_attempts
        API-->>UI: ❌ Invalid manager PIN
        UI->>Cashier: Override denied
    else Insufficient Permissions
        Auth-->>API: User lacks 'price_override' permission
        API-->>UI: ❌ Insufficient permissions
        UI->>Cashier: This user cannot override prices
    end
```

### Other Manager Override Scenarios:
- **Void Transaction**: Requires manager PIN + reason
- **Refund**: Manager approval for returns > $50
- **Cash Drawer Open**: Manager override to open drawer mid-shift
- **Discount Apply**: Manager-only promotions

---

## 7. Offline Sync Flow

### Scenario: POS terminal loses internet, then reconnects

```mermaid
sequenceDiagram
    participant UI as POS Terminal UI
    participant Monitor as Connection Monitor
    participant Offline as Offline Service
    participant IDB as IndexedDB (Local)
    participant API as Backend API
    participant DB as PostgreSQL
    participant Sync as Sync Service

    Note over Monitor: Continuous connectivity check
    Monitor->>API: Ping /health every 5 seconds
    API-->>Monitor: 200 OK (online)

    Note over Monitor: Internet connection lost
    Monitor->>API: Ping /health
    Note over API: Request timeout
    Monitor->>Monitor: No response (offline)
    Monitor->>Offline: Emit 'connection.lost' event

    Offline->>UI: 🔴 OFFLINE MODE
    UI->>UI: Show offline indicator

    Note over UI: Cashier continues working
    UI->>Offline: Create transaction (offline)
    Offline->>IDB: Queue transaction for sync
    Note over IDB: {<br/>  id: "txn-offline-1",<br/>  timestamp: "...",<br/>  cart: {...},<br/>  payment: {...},<br/>  synced: false<br/>}
    IDB-->>Offline: Queued
    Offline-->>UI: Transaction saved locally

    UI->>Offline: Create transaction 2 (offline)
    Offline->>IDB: Queue transaction

    Note over Monitor: Internet restored
    Monitor->>API: Ping /health
    API-->>Monitor: 200 OK
    Monitor->>Offline: Emit 'connection.restored' event

    Offline->>UI: 🟢 ONLINE - Syncing...

    Offline->>IDB: Get unsynced transactions
    IDB-->>Offline: [txn-offline-1, txn-offline-2]

    loop For each unsynced transaction
        Offline->>API: POST /api/sync/transaction
        Note over API: Payload: offline transaction data

        API->>Sync: Validate transaction
        Sync->>Sync: Check for conflicts
        Note over Sync: Conflict resolution strategy:<br/>- LAST_WRITE_WINS<br/>- SERVER_WINS<br/>- MANUAL

        alt No Conflicts
            Sync->>DB: INSERT retail_transaction
            Sync->>DB: Update inventory
            Sync-->>API: Sync successful (server ID: txn-12345)
            API-->>Offline: Transaction synced

            Offline->>IDB: Mark transaction as synced
            Offline->>IDB: Store server ID mapping
            Note over IDB: txn-offline-1 → txn-12345

        else Conflict Detected
            Note over Sync: e.g., Product price changed on server
            Sync-->>API: Conflict detected
            API-->>Offline: Conflict (details: {...})

            alt Strategy: LAST_WRITE_WINS
                Offline->>Sync: Force sync (use local data)
                Sync->>DB: INSERT with local values
            else Strategy: SERVER_WINS
                Offline->>IDB: Discard local transaction
                Offline->>UI: ⚠️ Transaction discarded (conflict)
            else Strategy: MANUAL
                Offline->>UI: 🛑 Manual resolution needed
                UI->>UI: Show conflict resolution UI
                UI->>Offline: User decision (keep local/use server)
            end
        end
    end

    Offline->>UI: ✅ Sync complete
    UI->>UI: Hide offline indicator
```

### Offline Capabilities:
- **Full POS Functionality**: Create transactions, process payments
- **Local Cache**: Products, prices, promotions cached in IndexedDB
- **Sync Queue**: All changes queued for upload when online
- **Conflict Resolution**: Configurable strategies
- **Data Consistency**: Server is source of truth

---

## 8. Payment Processing Flow (Stripe Terminal)

### Scenario: Card payment at POS terminal

```mermaid
sequenceDiagram
    participant Cashier
    participant UI as POS Terminal
    participant API as Backend API
    participant Pay as Payment Service
    participant Stripe as Stripe API
    participant Reader as Stripe Terminal Reader
    participant Customer
    participant DB as PostgreSQL
    participant Compliance as Compliance Service

    Cashier->>UI: Complete cart checkout
    UI->>Cashier: Total: $44.62
    Cashier->>UI: Select "Card Payment"

    UI->>API: POST /api/payment/card
    Note over API: Payload: {<br/>  cartId: "cart-123",<br/>  amount: 4462,  # cents<br/>  terminalId: "tmr_abc123"<br/>}

    API->>Pay: Initiate card payment
    Pay->>Stripe: POST /v1/payment_intents
    Note over Stripe: {<br/>  amount: 4462,<br/>  currency: "usd",<br/>  payment_method_types: ["card_present"],<br/>  capture_method: "automatic"<br/>}

    Stripe-->>Pay: Payment Intent (pi_xyz789)

    Pay->>Stripe: POST /v1/terminal/readers/{id}/process_payment_intent
    Note over Stripe: {<br/>  payment_intent: "pi_xyz789"<br/>}

    Stripe->>Reader: Activate reader
    Reader->>Reader: Display "Insert/Tap Card"
    Reader->>Cashier: 💳 Ready for payment

    Cashier->>Customer: Prompt to pay
    Customer->>Reader: Insert/tap card

    Reader->>Reader: Read card (EMV chip/NFC)
    Reader->>Stripe: Encrypted card data (P2PE)
    Note over Stripe: Card data encrypted end-to-end<br/>Never touches merchant server

    Stripe->>Stripe: Process payment
    Stripe->>Stripe: Authorize transaction

    alt Payment Successful
        Stripe-->>Pay: Payment succeeded
        Note over Pay: {<br/>  status: "succeeded",<br/>  card: { brand: "visa", last4: "4242" },<br/>  amount: 4462<br/>}

        Pay->>DB: Store payment record
        Note over DB: compliance_service.payment_tokens
        Pay->>Compliance: Log payment event
        Compliance->>DB: INSERT audit_logs
        Note over DB: No PAN stored (PCI DSS compliant)

        Pay-->>API: Payment success
        API->>API: Complete order
        API->>DB: Update order status (COMPLETED)
        API-->>UI: ✅ Payment successful

        UI->>Customer: Show receipt on screen
        Reader->>Customer: 🎉 Payment approved

        UI->>API: POST /api/receipt/print
        API->>API: Print receipt

    else Payment Declined
        Stripe-->>Pay: Payment failed (reason: insufficient_funds)
        Pay->>Compliance: Log failed payment
        Pay-->>API: Payment declined
        API-->>UI: ❌ Payment declined
        UI->>Cashier: Try another payment method

    else Terminal Error
        Reader-->>Stripe: Reader error (timeout/connection lost)
        Stripe-->>Pay: Error
        Pay-->>API: Terminal error
        API-->>UI: ⚠️ Terminal not responding
        UI->>Cashier: Retry or use cash payment
    end
```

### Key Security Features:
- **P2PE (Point-to-Point Encryption)**: Card data encrypted at reader
- **No PAN Storage**: Only tokenized data stored (last4 + token)
- **PCI DSS Scope Reduction**: Terminal handles card data
- **Audit Trail**: All payment attempts logged (compliance)
- **Idempotency**: Duplicate payment prevention via idempotency keys

---

## Summary

These sequence diagrams cover the **8 critical flows** in OpenCommerce:

1. ✅ **In-Store POS Transaction** - Full cart → payment → receipt flow
2. ✅ **DoorDash Order** - Webhook → queue → age verification → pickup
3. ✅ **Uber Eats Order** - Similar to DoorDash with platform differences
4. ✅ **Elistar Sync** - Product/promotion import + transaction export
5. ✅ **Age Verification** - Compliance for alcohol delivery
6. ✅ **Manager Override** - Authorization for sensitive operations
7. ✅ **Offline Sync** - Offline-first operation + conflict resolution
8. ✅ **Payment Processing** - Stripe Terminal integration (P2PE)

Each diagram shows:
- **Actors**: Users, services, external systems
- **Data Flow**: Request/response patterns
- **Error Handling**: Alternative paths (alt/else)
- **Compliance**: Audit logging, PCI DSS, age verification
- **Event-Driven**: Event bus emissions for async processing

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Format**: Mermaid sequence diagrams (GitHub/Markdown compatible)
