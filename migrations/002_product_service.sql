-- Migration 002: Product Service Tables
-- ARTS-compliant product catalog with channel-specific pricing

SET search_path TO product_service;

-- Products (Item Master from NAXML)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barcode VARCHAR(50) UNIQUE NOT NULL,
    barcode_type VARCHAR(20) NOT NULL, -- UPC-A, PLU, EAN-13
    description VARCHAR(200) NOT NULL,
    base_price DECIMAL(10,2) NOT NULL, -- From Elistar
    inventory_value_price DECIMAL(10,2),
    merchandise_code VARCHAR(10) NOT NULL, -- Department
    payment_systems_product_code VARCHAR(10),
    tax_strategy_id INTEGER DEFAULT 1,
    active BOOLEAN DEFAULT true,
    selling_units INTEGER DEFAULT 1,

    -- Channel-specific pricing (calculated from base_price + markup)
    price_in_store DECIMAL(10,2) NOT NULL,
    price_doordash DECIMAL(10,2) NOT NULL,
    price_uber_eats DECIMAL(10,2) NOT NULL,
    price_website DECIMAL(10,2) NOT NULL,

    -- Compliance
    requires_age_verification BOOLEAN DEFAULT false,
    minimum_age INTEGER,

    -- AI/Search
    embedding vector(384), -- For semantic search
    search_vector tsvector, -- For full-text search

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_to_doordash_at TIMESTAMP,
    synced_to_uber_at TIMESTAMP,
    synced_to_website_at TIMESTAMP,

    -- Elistar tracking
    elistar_external_id VARCHAR(100),
    last_elistar_sync TIMESTAMP
);

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_merchandise_code ON products(merchandise_code);
CREATE INDEX idx_products_active ON products(active) WHERE active = true;
CREATE INDEX idx_products_search_vector ON products USING GIN(search_vector);
CREATE INDEX idx_products_embedding ON products USING ivfflat(embedding vector_cosine_ops);

-- Trigger to update search_vector
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(NEW.barcode, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_vector_update
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_product_search_vector();

-- Merchandise Codes (Departments from NAXML)
CREATE TABLE merchandise_codes (
    code VARCHAR(10) PRIMARY KEY,
    description VARCHAR(200) NOT NULL,
    active BOOLEAN DEFAULT true,
    payment_systems_product_code VARCHAR(10),
    tax_strategy_id INTEGER DEFAULT 0,
    minimum_customer_age INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Promotions (from NAXML MixMatch, Combo)
CREATE TABLE promotions (
    id VARCHAR(50) PRIMARY KEY, -- PromotionID from NAXML
    promotion_type VARCHAR(50) NOT NULL, -- MIX_MATCH, COMBO, BOGO, PERCENT_OFF
    description VARCHAR(200),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',

    -- Schedule (which days active)
    active_sunday BOOLEAN DEFAULT true,
    active_monday BOOLEAN DEFAULT true,
    active_tuesday BOOLEAN DEFAULT true,
    active_wednesday BOOLEAN DEFAULT true,
    active_thursday BOOLEAN DEFAULT true,
    active_friday BOOLEAN DEFAULT true,
    active_saturday BOOLEAN DEFAULT true,

    -- Promotion rules (JSONB for flexibility)
    rules JSONB NOT NULL,

    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_promotions_active ON promotions(active, start_date, end_date);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);

-- Item Lists (from NAXML - groups of items eligible for promos)
CREATE TABLE item_lists (
    id VARCHAR(50) PRIMARY KEY, -- ItemListID from NAXML
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item List Entries (which products are in which lists)
CREATE TABLE item_list_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_list_id VARCHAR(50) REFERENCES item_lists(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(item_list_id, product_id)
);

CREATE INDEX idx_item_list_entries_list ON item_list_entries(item_list_id);
CREATE INDEX idx_item_list_entries_product ON item_list_entries(product_id);

-- Tax Strategies
CREATE TABLE tax_strategies (
    id INTEGER PRIMARY KEY,
    description VARCHAR(100) NOT NULL,
    tax_rate DECIMAL(5,4) NOT NULL, -- e.g., 0.0700 for 7%
    jurisdiction VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tax strategies
INSERT INTO tax_strategies (id, description, tax_rate, jurisdiction) VALUES
(0, 'Tax Exempt', 0.0000, 'Ocala, FL'),
(1, 'Standard Sales Tax', 0.0700, 'Ocala, FL'), -- 7% (6% FL + 1% Marion County)
(2, 'Special Tax Rate', 0.0000, 'Ocala, FL');

-- Product Events (Event Sourcing)
CREATE TABLE product_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL, -- PRODUCT_CREATED, PRICE_CHANGED, etc.
    aggregate_id UUID NOT NULL, -- product_id
    event_data JSONB NOT NULL,
    sequence_number BIGSERIAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

CREATE INDEX idx_product_events_aggregate ON product_events(aggregate_id, sequence_number);
CREATE INDEX idx_product_events_type ON product_events(event_type);
