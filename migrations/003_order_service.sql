-- Migration 003: Order Service Tables
-- ARTS-compliant order management for all channels

SET search_path TO order_service;

-- Order Channel enum
CREATE TYPE order_channel AS ENUM ('IN_STORE', 'DOORDASH', 'UBER_EATS', 'WEBSITE');
CREATE TYPE order_status AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED', 'CANCELLED');
CREATE TYPE tender_type AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'GIFT_CARD', 'DIGITAL_WALLET', 'SPLIT');

-- Retail Transactions (ARTS standard)
CREATE TABLE retail_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number BIGSERIAL UNIQUE, -- Sequential number
    external_order_id VARCHAR(100), -- DoorDash ID, Uber ID, etc.

    -- Channel
    channel order_channel NOT NULL,
    status order_status NOT NULL DEFAULT 'NEW',

    -- Store & Terminal
    store_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50),
    business_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Staff
    cashier_id VARCHAR(50),

    -- Customer
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(200),

    -- Delivery (if applicable)
    delivery_address TEXT,
    delivery_instructions TEXT,
    scheduled_time TIMESTAMP,
    driver_name VARCHAR(200),
    driver_phone VARCHAR(20),

    -- Money
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(10,2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    service_fee DECIMAL(10,2) DEFAULT 0,
    tip_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

    -- Compliance
    contains_alcohol BOOLEAN DEFAULT false,
    age_verified BOOLEAN DEFAULT false,
    verified_by VARCHAR(100),
    verified_at TIMESTAMP,

    -- Timestamps
    ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    preparing_at TIMESTAMP,
    ready_at TIMESTAMP,
    picked_up_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- Sync
    synced_to_elistar BOOLEAN DEFAULT false,
    synced_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_channel ON retail_transactions(channel);
CREATE INDEX idx_transactions_status ON retail_transactions(status);
CREATE INDEX idx_transactions_store ON retail_transactions(store_id, business_date);
CREATE INDEX idx_transactions_external_id ON retail_transactions(external_order_id);
CREATE INDEX idx_transactions_ordered_at ON retail_transactions(ordered_at DESC);
CREATE INDEX idx_transactions_contains_alcohol ON retail_transactions(contains_alcohol) WHERE contains_alcohol = true;

-- Transaction Line Items (ARTS standard)
CREATE TABLE transaction_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES retail_transactions(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,

    -- Product
    product_id UUID, -- Reference to product_service.products
    barcode VARCHAR(50),
    description VARCHAR(200) NOT NULL,

    -- Quantity & Pricing
    quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    extended_price DECIMAL(10,2) NOT NULL,

    -- Tax
    tax_amount DECIMAL(10,2) DEFAULT 0,
    tax_group_id VARCHAR(50),

    -- Modifiers (for food items: extra cheese, no onions, etc.)
    modifiers JSONB,
    notes TEXT,

    -- Compliance
    requires_age_verification BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(transaction_id, sequence_number)
);

CREATE INDEX idx_line_items_transaction ON transaction_line_items(transaction_id);
CREATE INDEX idx_line_items_product ON transaction_line_items(product_id);

-- Transaction Promotions Applied
CREATE TABLE transaction_promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES retail_transactions(id) ON DELETE CASCADE,
    promotion_id VARCHAR(50),
    promotion_code VARCHAR(50),
    promotion_type VARCHAR(50),
    discount_amount DECIMAL(10,2) NOT NULL,
    affected_line_items JSONB, -- Array of line_item_ids
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transaction_promotions_transaction ON transaction_promotions(transaction_id);

-- Transaction Tenders (ARTS standard - payments)
CREATE TABLE transaction_tenders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES retail_transactions(id) ON DELETE CASCADE,
    tender_type tender_type NOT NULL,
    tender_amount DECIMAL(10,2) NOT NULL,

    -- Card payments
    card_type VARCHAR(20), -- VISA, MASTERCARD, AMEX, DISCOVER
    last_four VARCHAR(4),
    approval_code VARCHAR(50),
    stripe_payment_intent_id VARCHAR(100),
    stripe_charge_id VARCHAR(100),

    -- P2PE encrypted data (never store plain card numbers!)
    emv_encrypted_data TEXT,

    -- Cash
    amount_tendered DECIMAL(10,2),
    change_due DECIMAL(10,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenders_transaction ON transaction_tenders(transaction_id);
CREATE INDEX idx_tenders_type ON transaction_tenders(tender_type);

-- Order Events (Event Sourcing)
CREATE TABLE order_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL, -- transaction_id
    event_data JSONB NOT NULL,
    sequence_number BIGSERIAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

CREATE INDEX idx_order_events_aggregate ON order_events(aggregate_id, sequence_number);
CREATE INDEX idx_order_events_type ON order_events(event_type);
CREATE INDEX idx_order_events_created ON order_events(created_at DESC);
