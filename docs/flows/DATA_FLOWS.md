# OpenCommerce End-to-End Data Flows

## Table of Contents
1. [Product Data Flow](#product-data-flow)
2. [Order Data Flow](#order-data-flow)
3. [Payment Data Flow](#payment-data-flow)
4. [Inventory Data Flow](#inventory-data-flow)
5. [Analytics Data Flow](#analytics-data-flow)
6. [Audit & Compliance Data Flow](#audit--compliance-data-flow)

---

## 1. Product Data Flow

### Source: Elistar Back Office → OpenCommerce → Sales Channels

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ELISTAR BACK OFFICE                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Product Master Data                                          │  │
│  │  - Item Code: 012345678901                                    │  │
│  │  - Description: "Corona Extra 6-Pack"                         │  │
│  │  - Base Price: $12.99                                         │  │
│  │  - Merchandise Code: "BEER"                                   │  │
│  │  - Age Requirement: 21                                        │  │
│  │  - Tax Strategy: "TAXABLE"                                    │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 │ NAXML Export
                                 │ (XML over HTTPS)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OPENCOMMERCE API                                 │
│  POST /api/elistar/import                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  NAXML Parser                                                 │  │
│  │  - Parse <Items>                                              │  │
│  │  - Parse <MerchandiseCodes>                                   │  │
│  │  - Parse <Promotions>                                         │  │
│  │  - Parse <ItemLists>                                          │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PRODUCT SERVICE                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Channel Price Calculator                                     │  │
│  │  Base Price: $12.99                                           │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │  IN_STORE:   $12.99 × (1 + 0.00) = $12.99             │  │  │
│  │  │  DOORDASH:   $12.99 × (1 + 0.30) = $16.89             │  │  │
│  │  │  UBER_EATS:  $12.99 × (1 + 0.25) = $16.24             │  │  │
│  │  │  WEBSITE:    $12.99 × (1 + 0.10) = $14.29             │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                              │
│  Schema: product_service                                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  products table                                               │  │
│  │  ├─ id: uuid (primary key)                                    │  │
│  │  ├─ barcode: "012345678901"                                   │  │
│  │  ├─ name: "Corona Extra 6-Pack"                               │  │
│  │  ├─ base_price: 12.99 (numeric)                               │  │
│  │  ├─ channel_pricing: {                                        │  │
│  │  │    "IN_STORE": 0.00,                                       │  │
│  │  │    "DOORDASH": 0.30,                                       │  │
│  │  │    "UBER_EATS": 0.25,                                      │  │
│  │  │    "WEBSITE": 0.10                                         │  │
│  │  │  } (jsonb)                                                 │  │
│  │  ├─ merchandise_code: "BEER"                                  │  │
│  │  ├─ age_verification_required: true                           │  │
│  │  ├─ minimum_age: 21                                           │  │
│  │  ├─ taxable: true                                             │  │
│  │  ├─ embedding: vector(384) ← AI embedding                     │  │
│  │  ├─ search_vector: tsvector ← Full-text search               │  │
│  │  └─ elistar_last_sync: timestamp                              │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AI EMBEDDING GENERATION                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Ollama Service (deepseek-r1:1.5b)                            │  │
│  │  Input: "Corona Extra 6-Pack Premium Mexican beer"           │  │
│  │  Output: [0.123, -0.456, 0.789, ...] (384 dimensions)        │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 │ Store embedding
                                 │ UPDATE products SET embedding = ...
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    REDIS CACHE                                      │
│  Key: product:012345678901:IN_STORE                                 │
│  Value: {                                                           │
│    "id": "uuid",                                                    │
│    "name": "Corona Extra 6-Pack",                                   │
│    "price": 12.99,                                                  │
│    "inStock": true,                                                 │
│    "taxable": true                                                  │
│  }                                                                  │
│  TTL: 15 minutes                                                    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│               CHANNEL MENU SYNC (Parallel)                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  DoorDash    │  │  Uber Eats   │  │   Website    │            │
│  │  Menu API    │  │  Menu API    │  │  Catalog API │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                 │                     │
│         │ Push Product    │ Push Product    │ Push Product       │
│         │ (Price: $16.89) │ (Price: $16.24) │ (Price: $14.29)    │
│         ▼                 ▼                 ▼                     │
│  [DoorDash Store]  [Uber Eats Store]  [Website Store]             │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Transformations:

**Elistar → OpenCommerce**
```xml
<!-- NAXML Input -->
<Item>
  <ItemCode>012345678901</ItemCode>
  <Description>Corona Extra 6-Pack</Description>
  <RegularPrice>12.99</RegularPrice>
  <MerchandiseCode>BEER</MerchandiseCode>
  <Age>21</Age>
</Item>
```
↓
```typescript
// Internal Product Model
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  barcode: "012345678901",
  name: "Corona Extra 6-Pack",
  description: "Premium Mexican beer",
  basePrice: 12.99,
  channelPricing: {
    IN_STORE: 0.00,
    DOORDASH: 0.30,
    UBER_EATS: 0.25,
    WEBSITE: 0.10
  },
  merchandiseCode: "BEER",
  ageVerificationRequired: true,
  minimumAge: 21,
  taxable: true,
  embedding: [...], // 384-dim vector
  searchVector: "corona:1 extra:2 beer:3 mexican:4"
}
```

**OpenCommerce → DoorDash**
```json
{
  "external_id": "012345678901",
  "name": "Corona Extra 6-Pack",
  "description": "Premium Mexican beer",
  "price": 1689,  // $16.89 in cents
  "category": "Beer",
  "is_available": true,
  "age_restriction": 21
}
```

---

## 2. Order Data Flow

### Multi-Channel Order Aggregation

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│   DoorDash     │  │   Uber Eats    │  │    Website     │
│   Customer     │  │   Customer     │  │   Customer     │
│   App          │  │   App          │  │   (Custom)     │
└───────┬────────┘  └───────┬────────┘  └───────┬────────┘
        │                   │                   │
        │ Place Order       │ Place Order       │ Place Order
        ▼                   ▼                   ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  DoorDash      │  │  Uber Eats     │  │  Website       │
│  Platform      │  │  Platform      │  │  Backend       │
└───────┬────────┘  └───────┬────────┘  └───────┬────────┘
        │                   │                   │
        │ Webhook           │ Webhook           │ API Call
        ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│              OPENCOMMERCE WEBHOOKS / API                 │
│  POST /webhooks/doordash/orders                          │
│  POST /webhooks/uber/orders                              │
│  POST /api/orders                                        │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│           ORDER AGGREGATION SERVICE                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Transform to Unified Order Format                 │  │
│  │                                                     │  │
│  │  DoorDash Order → UnifiedOrder                     │  │
│  │  {                                                 │  │
│  │    channel: "DOORDASH",                            │  │
│  │    externalId: "dd-ord-789",                       │  │
│  │    customerName: "John Doe",                       │  │
│  │    deliveryAddress: {...},                         │  │
│  │    items: [                                        │  │
│  │      {                                             │  │
│  │        externalId: "012345678901",                 │  │
│  │        quantity: 2,                                │  │
│  │        price: 16.89                                │  │
│  │      }                                             │  │
│  │    ],                                              │  │
│  │    total: 46.13                                    │  │
│  │  }                                                 │  │
│  └─────────────────────────┬──────────────────────────┘  │
└────────────────────────────┼─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│              INVENTORY CHECK                             │
│  For each item in order:                                 │
│  - Query inventory.available_quantity                    │
│  - Reserve stock (available → reserved)                  │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│              POSTGRESQL - order_service                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  retail_transactions                               │  │
│  │  ├─ transaction_id: uuid                           │  │
│  │  ├─ order_number: "DD-2024-001"                    │  │
│  │  ├─ channel: "DOORDASH"                            │  │
│  │  ├─ status: "NEW"                                  │  │
│  │  ├─ customer_name: "John Doe"                      │  │
│  │  ├─ customer_phone: "+1-555-0123"                  │  │
│  │  ├─ delivery_address: jsonb                        │  │
│  │  ├─ subtotal: 33.78                                │  │
│  │  ├─ tax: 2.36                                      │  │
│  │  ├─ delivery_fee: 4.99                             │  │
│  │  ├─ tip: 5.00                                      │  │
│  │  ├─ total: 46.13                                   │  │
│  │  ├─ external_order_id: "dd-ord-789"                │  │
│  │  ├─ created_at: timestamp                          │  │
│  │  └─ estimated_pickup_time: timestamp               │  │
│  └─────────────────────────┬──────────────────────────┘  │
│  ┌─────────────────────────▼──────────────────────────┐  │
│  │  transaction_line_items                            │  │
│  │  ├─ line_item_id: uuid                             │  │
│  │  ├─ transaction_id: uuid (FK)                      │  │
│  │  ├─ product_id: uuid                               │  │
│  │  ├─ barcode: "012345678901"                        │  │
│  │  ├─ description: "Corona Extra 6-Pack"             │  │
│  │  ├─ quantity: 2                                    │  │
│  │  ├─ unit_price: 16.89                              │  │
│  │  ├─ line_total: 33.78                              │  │
│  │  ├─ age_verification_required: true                │  │
│  │  └─ sequence_number: 1                             │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│              EVENT BUS                                   │
│  Event: 'order.created'                                  │
│  Payload: {                                              │
│    orderId: "uuid",                                      │
│    channel: "DOORDASH",                                  │
│    total: 46.13,                                         │
│    hasAlcohol: true                                      │
│  }                                                       │
└────────────────────────────┬─────────────────────────────┘
                             │
                    ┌────────┼────────┐
                    │                 │
                    ▼                 ▼
┌───────────────────────┐  ┌──────────────────────────┐
│  NOTIFICATION SERVICE │  │  ORDER QUEUE UI          │
│  - Send push to staff │  │  - Real-time update      │
│  - SMS alert          │  │  - Show new order badge  │
│  - Sound notification │  │  - Age verification flag │
└───────────────────────┘  └──────────────────────────┘
```

### Order Status Lifecycle

```
NEW
 │
 │ (Staff accepts order)
 ▼
ACCEPTED
 │
 │ (Staff starts preparing)
 ▼
PREPARING
 │
 │ (Order ready for pickup)
 ▼
READY
 │
 │ (Dasher/Customer picks up)
 │ (Age verification if alcohol)
 ▼
PICKED_UP
 │
 │ (Delivered to customer)
 ▼
COMPLETED
```

Each status change:
1. Updates `retail_transactions.status`
2. Inserts row to `order_events` (event sourcing)
3. Emits event to Event Bus
4. Triggers notifications
5. Updates UI in real-time

---

## 3. Payment Data Flow

### Card Payment (Stripe Terminal)

```
┌─────────────────────────────────────────────────────────┐
│              CUSTOMER                                   │
│              Taps/Inserts Card                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│         STRIPE TERMINAL READER                          │
│         (Verifone P400 / BBPOS WisePad 3)               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Read Card Data (EMV Chip / NFC)                  │  │
│  │  - Card Number (PAN)                              │  │
│  │  - Expiry Date                                    │  │
│  │  - CVV (if chip)                                  │  │
│  └────────────────────┬──────────────────────────────┘  │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │  P2PE Encryption                                  │  │
│  │  Encrypt card data in hardware                    │  │
│  │  (AES-256, end-to-end encryption)                 │  │
│  └────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │
                          │ Encrypted data
                          │ (PAN never touches merchant server)
                          ▼
┌─────────────────────────────────────────────────────────┐
│              STRIPE PAYMENT GATEWAY                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Decrypt Card Data (in secure Stripe environment)│  │
│  │  Process Authorization                            │  │
│  │  Contact Card Network (Visa/MC/Amex)             │  │
│  └────────────────────┬──────────────────────────────┘  │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │  Generate Payment Token                           │  │
│  │  Token: tok_visa_4242424242424242                 │  │
│  │  Last4: 4242                                      │  │
│  │  Brand: visa                                      │  │
│  └────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │
                          │ Payment result + token
                          ▼
┌─────────────────────────────────────────────────────────┐
│         OPENCOMMERCE PAYMENT SERVICE                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Receive Payment Response                         │  │
│  │  {                                                │  │
│  │    status: "succeeded",                           │  │
│  │    paymentIntentId: "pi_xyz789",                  │  │
│  │    amount: 4462,  // $44.62 in cents             │  │
│  │    card: {                                        │  │
│  │      brand: "visa",                               │  │
│  │      last4: "4242",                               │  │
│  │      funding: "credit"                            │  │
│  │    },                                             │  │
│  │    chargeId: "ch_abc123"                          │  │
│  │  }                                                │  │
│  └────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│         POSTGRESQL - compliance_service                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  payment_tokens table                             │  │
│  │  ├─ token_id: uuid                                │  │
│  │  ├─ transaction_id: uuid (FK)                     │  │
│  │  ├─ stripe_payment_intent_id: "pi_xyz789"         │  │
│  │  ├─ stripe_charge_id: "ch_abc123"                 │  │
│  │  ├─ card_brand: "visa"                            │  │
│  │  ├─ card_last4: "4242"                            │  │
│  │  ├─ card_funding: "credit"                        │  │
│  │  ├─ amount: 44.62                                 │  │
│  │  ├─ currency: "usd"                               │  │
│  │  ├─ payment_method: "CARD_PRESENT"                │  │
│  │  ├─ created_at: timestamp                         │  │
│  │  └─ encrypted_token: encrypted(tok_visa_...)      │  │
│  │  NOTE: NO PAN STORED (PCI DSS Compliant)         │  │
│  └────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│         POSTGRESQL - order_service                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  transaction_tenders table                        │  │
│  │  ├─ tender_id: uuid                               │  │
│  │  ├─ transaction_id: uuid (FK)                     │  │
│  │  ├─ tender_type: "CARD"                           │  │
│  │  ├─ amount: 44.62                                 │  │
│  │  ├─ card_brand: "visa"                            │  │
│  │  ├─ card_last4: "4242"                            │  │
│  │  ├─ authorization_code: "123456"                  │  │
│  │  └─ payment_token_id: uuid (FK to payment_tokens)│  │
│  └────────────────────┬──────────────────────────────┘  │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │  retail_transactions                              │  │
│  │  UPDATE status = 'COMPLETED'                      │  │
│  │  UPDATE payment_status = 'PAID'                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Cash Payment Flow

```
Cashier Input: $50.00 cash tendered
Order Total: $44.62
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│         PAYMENT SERVICE - Cash Calculator               │
│  Change Due: $50.00 - $44.62 = $5.38                    │
│                                                         │
│  Change Breakdown:                                      │
│  ├─ $5 bills: 1 × $5.00 = $5.00                        │
│  ├─ $1 bills: 0 × $1.00 = $0.00                        │
│  ├─ Quarters: 1 × $0.25 = $0.25                        │
│  ├─ Dimes:    1 × $0.10 = $0.10                        │
│  ├─ Nickels:  0 × $0.05 = $0.00                        │
│  └─ Pennies:  3 × $0.01 = $0.03                        │
│                                                         │
│  Total: $5.38 ✓                                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│         POSTGRESQL - transaction_tenders                │
│  INSERT INTO transaction_tenders (                      │
│    tender_type = 'CASH',                                │
│    amount = 44.62,                                      │
│    tendered = 50.00,                                    │
│    change = 5.38,                                       │
│    change_breakdown = {                                 │
│      "fives": 1, "quarters": 1,                         │
│      "dimes": 1, "pennies": 3                           │
│    }                                                    │
│  )                                                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│         RECEIPT SERVICE                                 │
│  Trigger: Open cash drawer via ESC/POS command          │
│  Command: ESC p m t1 t2 (pulse cash drawer)             │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Inventory Data Flow

### Real-Time Inventory Tracking

```
┌─────────────────────────────────────────────────────────┐
│              INVENTORY LIFECYCLE                        │
│                                                         │
│  Initial Stock: 50 units                                │
│  Available: 50                                          │
│  Reserved: 0                                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ DoorDash order created (2 units)
                     ▼
┌─────────────────────────────────────────────────────────┐
│         INVENTORY SERVICE - Reserve Stock               │
│  UPDATE inventory                                       │
│  SET available_quantity = 50 - 2 = 48                   │
│      reserved_quantity = 0 + 2 = 2                      │
│  WHERE product_id = 'prod-123'                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         POSTGRESQL - inventory_service                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  inventory table                                  │  │
│  │  ├─ product_id: uuid                              │  │
│  │  ├─ store_id: "STORE_001"                         │  │
│  │  ├─ on_hand_quantity: 50                          │  │
│  │  ├─ available_quantity: 48 (was 50)               │  │
│  │  ├─ reserved_quantity: 2 (was 0)                  │  │
│  │  ├─ reorder_point: 10                             │  │
│  │  ├─ reorder_quantity: 24                          │  │
│  │  └─ last_updated: timestamp                       │  │
│  └────────────────────┬──────────────────────────────┘  │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │  inventory_movements (audit trail)                │  │
│  │  ├─ movement_id: uuid                             │  │
│  │  ├─ product_id: uuid                              │  │
│  │  ├─ movement_type: "RESERVATION"                  │  │
│  │  ├─ quantity: 2                                   │  │
│  │  ├─ reference_id: "ord-12345" (order ID)          │  │
│  │  ├─ user_id: null (automated)                     │  │
│  │  ├─ reason: "Order reserved"                      │  │
│  │  └─ created_at: timestamp                         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                     │
                     │ Order picked up (complete transaction)
                     ▼
┌─────────────────────────────────────────────────────────┐
│         INVENTORY SERVICE - Complete Sale               │
│  UPDATE inventory                                       │
│  SET on_hand_quantity = 50 - 2 = 48                     │
│      available_quantity = 48 (unchanged)                │
│      reserved_quantity = 2 - 2 = 0                      │
│  WHERE product_id = 'prod-123'                          │
│                                                         │
│  INSERT INTO inventory_movements (                      │
│    movement_type = 'SALE',                              │
│    quantity = -2,                                       │
│    reference_id = 'txn-12345'                           │
│  )                                                      │
└─────────────────────────────────────────────────────────┘
                     │
                     │ Check reorder point
                     ▼
┌─────────────────────────────────────────────────────────┐
│         INVENTORY SERVICE - Low Stock Alert             │
│  IF available_quantity (48) > reorder_point (10)        │
│    → No action needed                                   │
│                                                         │
│  ELSE:                                                  │
│    → Emit 'inventory.low_stock' event                   │
│    → Send notification to manager                       │
│    → Create purchase order (optional)                   │
└─────────────────────────────────────────────────────────┘
```

### Inventory Movement Types

```
SALE          : -quantity (sold to customer)
RECEIVE       : +quantity (new stock received)
ADJUST        : ±quantity (manual adjustment, cycle count)
RETURN        : +quantity (customer return)
RESERVATION   : move from available → reserved
RELEASE       : move from reserved → available (order cancelled)
DAMAGE        : -quantity (damaged goods write-off)
THEFT         : -quantity (shrinkage)
TRANSFER_IN   : +quantity (inter-store transfer)
TRANSFER_OUT  : -quantity (inter-store transfer)
```

---

## 5. Analytics Data Flow

### Real-Time Analytics Pipeline

```
┌─────────────────────────────────────────────────────────┐
│              TRANSACTIONAL EVENTS                       │
│  - order.created                                        │
│  - order.completed                                      │
│  - payment.completed                                    │
│  - product.viewed                                       │
│  - user.login                                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              EVENT BUS (EventEmitter2)                  │
│  Emit events to multiple subscribers                    │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  ANALYTICS       │    │  REPORTING SERVICE   │
│  SERVICE         │    │                      │
└────────┬─────────┘    └──────────┬───────────┘
         │                         │
         │                         │
         ▼                         ▼
┌─────────────────────────────────────────────────────────┐
│         POSTGRESQL - reporting_service                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  sales_aggregates (hourly rollups)                │  │
│  │  ├─ hour: timestamp                               │  │
│  │  ├─ store_id: varchar                             │  │
│  │  ├─ channel: enum (IN_STORE, DOORDASH, etc.)      │  │
│  │  ├─ total_orders: integer                         │  │
│  │  ├─ total_revenue: numeric                        │  │
│  │  ├─ total_items_sold: integer                     │  │
│  │  ├─ avg_order_value: numeric                      │  │
│  │  └─ top_products: jsonb                           │  │
│  └────────────────────┬──────────────────────────────┘  │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │  analytics_events (raw events)                    │  │
│  │  ├─ event_id: uuid                                │  │
│  │  ├─ event_type: varchar                           │  │
│  │  ├─ event_data: jsonb                             │  │
│  │  ├─ user_id: uuid                                 │  │
│  │  ├─ session_id: uuid                              │  │
│  │  ├─ timestamp: timestamp                          │  │
│  │  └─ metadata: jsonb                               │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                     │
                     │ Scheduled aggregation (every hour)
                     ▼
┌─────────────────────────────────────────────────────────┐
│         REPORTING JOB (node-cron)                       │
│  Run every hour: 0 * * * *                              │
│                                                         │
│  1. Query transactions from last hour                   │
│  2. Group by channel, store, product                    │
│  3. Calculate aggregates:                               │
│     - Total revenue                                     │
│     - Order count                                       │
│     - Average order value                               │
│     - Items per transaction                             │
│     - Top 10 products                                   │
│  4. INSERT into sales_aggregates                        │
└─────────────────────────────────────────────────────────┘
```

### Example Analytics Query

```sql
-- Daily sales by channel
SELECT
  DATE(created_at) AS business_date,
  channel,
  COUNT(*) AS total_orders,
  SUM(total) AS total_revenue,
  AVG(total) AS avg_order_value
FROM order_service.retail_transactions
WHERE
  created_at >= CURRENT_DATE - INTERVAL '7 days'
  AND status = 'COMPLETED'
GROUP BY business_date, channel
ORDER BY business_date DESC, channel;

-- Result:
-- business_date | channel    | total_orders | total_revenue | avg_order_value
-- 2025-11-14    | IN_STORE   | 145          | 6,523.45      | 45.02
-- 2025-11-14    | DOORDASH   | 28           | 1,892.67      | 67.60
-- 2025-11-14    | UBER_EATS  | 15           | 987.23        | 65.82
-- 2025-11-14    | WEBSITE    | 8            | 456.78        | 57.10
```

---

## 6. Audit & Compliance Data Flow

### Append-Only Audit Logs (PCI DSS Requirement 10)

```
┌─────────────────────────────────────────────────────────┐
│              SECURITY EVENTS                            │
│  - User login/logout                                    │
│  - Failed login attempts                                │
│  - Price override                                       │
│  - Transaction void                                     │
│  - Payment processing                                   │
│  - Data access (customer records)                       │
│  - Configuration changes                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         AUDIT LOGGER (Security Service)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Capture Event Details                            │  │
│  │  {                                                │  │
│  │    event_type: "PRICE_OVERRIDE",                  │  │
│  │    user_id: "mgr-123",                            │  │
│  │    resource_type: "TRANSACTION",                  │  │
│  │    resource_id: "cart-abc123",                    │  │
│  │    action: "UPDATE_PRICE",                        │  │
│  │    old_value: 12.99,                              │  │
│  │    new_value: 9.99,                               │  │
│  │    reason: "Customer loyalty discount",           │  │
│  │    ip_address: "192.168.1.100",                   │  │
│  │    terminal_id: "POS-001",                        │  │
│  │    timestamp: "2025-11-14T10:15:23Z"              │  │
│  │  }                                                │  │
│  └────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│         POSTGRESQL - compliance_service                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  audit_logs table (APPEND-ONLY)                   │  │
│  │  ├─ audit_id: uuid (primary key)                  │  │
│  │  ├─ event_type: varchar                           │  │
│  │  ├─ user_id: uuid                                 │  │
│  │  ├─ username: varchar (denormalized for reports)  │  │
│  │  ├─ resource_type: varchar                        │  │
│  │  ├─ resource_id: varchar                          │  │
│  │  ├─ action: varchar                               │  │
│  │  ├─ old_value: jsonb                              │  │
│  │  ├─ new_value: jsonb                              │  │
│  │  ├─ reason: text                                  │  │
│  │  ├─ ip_address: inet                              │  │
│  │  ├─ terminal_id: varchar                          │  │
│  │  ├─ timestamp: timestamp                          │  │
│  │  └─ metadata: jsonb                               │  │
│  │                                                   │  │
│  │  CONSTRAINTS:                                     │  │
│  │  - NO UPDATE allowed (trigger prevents)           │  │
│  │  - NO DELETE allowed (trigger prevents)           │  │
│  │  - INSERT only (append-only)                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Automated compliance checks
                          ▼
┌─────────────────────────────────────────────────────────┐
│         COMPLIANCE MONITORING                           │
│  Daily Jobs:                                            │
│  1. Failed Login Report                                 │
│     - Count failed attempts per user                    │
│     - Alert if > 3 failures in 1 hour                   │
│                                                         │
│  2. Price Override Report                               │
│     - List all price overrides                          │
│     - Group by manager                                  │
│     - Flag unusual patterns                             │
│                                                         │
│  3. Access Log Review                                   │
│     - Customer data access                              │
│     - After-hours access                                │
│     - Anomaly detection                                 │
│                                                         │
│  4. PCI Compliance Checklist                            │
│     - Session timeout enforcement                       │
│     - Password expiry                                   │
│     - Encryption key rotation                           │
└─────────────────────────────────────────────────────────┘
```

### Tamper-Proof Audit Trail

```sql
-- Database trigger to prevent audit log modification
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit logs cannot be modified (UPDATE not allowed)';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs cannot be deleted (DELETE not allowed)';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_immutable
BEFORE UPDATE OR DELETE ON compliance_service.audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

---

## Summary

### Data Flow Characteristics

| Flow Type | Frequency | Latency | Volume | Persistence |
|-----------|-----------|---------|--------|-------------|
| **Product Data** | Hourly sync | < 5s | 100-500 products | PostgreSQL + Redis cache |
| **Order Data** | Real-time | < 1s | 10-100/day per channel | PostgreSQL + Event Bus |
| **Payment Data** | Per transaction | < 2s | 50-200/day | PostgreSQL (encrypted) |
| **Inventory Data** | Real-time | < 500ms | Per order/sale | PostgreSQL |
| **Analytics Data** | Batch (hourly) | N/A | Aggregated | PostgreSQL + Materialized Views |
| **Audit Data** | Real-time | < 100ms | All events | PostgreSQL (append-only) |

### Key Design Principles

1. **Event-Driven**: All state changes emit events for async processing
2. **Append-Only Audits**: Compliance logs are immutable
3. **Offline-First**: IndexedDB cache for local-first operation
4. **Channel Pricing**: Dynamic pricing calculated per sales channel
5. **PCI Compliance**: No PAN storage, tokenization only
6. **Real-Time Updates**: WebSocket/SSE for UI updates
7. **Unified Order Format**: All channels transformed to internal model

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Coverage**: End-to-end data flows for all major subsystems
