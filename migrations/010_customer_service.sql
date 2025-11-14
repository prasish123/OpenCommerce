-- =============================================
-- Customer Service Tables
-- Customer profiles, preferences, history
-- =============================================

-- Customers table
CREATE TABLE IF NOT EXISTS customer_service.customers (
    id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    date_of_birth DATE,
    preferences JSONB, -- Email/SMS preferences, favorites, etc.
    tags VARCHAR(50)[], -- Segmentation tags (VIP, At-Risk, etc.)
    notes TEXT,
    last_purchase TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_customers_email ON customer_service.customers(email);
CREATE INDEX idx_customers_phone ON customer_service.customers(phone);
CREATE INDEX idx_customers_name ON customer_service.customers(first_name, last_name);
CREATE INDEX idx_customers_last_purchase ON customer_service.customers(last_purchase DESC);
CREATE INDEX idx_customers_tags ON customer_service.customers USING GIN(tags);

-- Add customer_id to transactions (if not exists)
ALTER TABLE order_service.retail_transactions
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customer_service.customers(id);

CREATE INDEX IF NOT EXISTS idx_transactions_customer ON order_service.retail_transactions(customer_id);

-- Customer addresses (multiple addresses per customer)
CREATE TABLE IF NOT EXISTS customer_service.addresses (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_service.customers(id) ON DELETE CASCADE,
    address_type VARCHAR(20) DEFAULT 'SHIPPING', -- SHIPPING, BILLING, etc.
    street_address TEXT NOT NULL,
    apartment VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    country VARCHAR(2) DEFAULT 'US',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_customer ON customer_service.addresses(customer_id);

-- Customer notes/interactions log
CREATE TABLE IF NOT EXISTS customer_service.customer_notes (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_service.customers(id) ON DELETE CASCADE,
    note_type VARCHAR(50), -- COMPLAINT, INQUIRY, FEEDBACK, etc.
    note TEXT NOT NULL,
    created_by UUID REFERENCES auth_service.users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_notes_customer ON customer_service.customer_notes(customer_id, created_at DESC);

-- Customer segments (for marketing)
CREATE TABLE IF NOT EXISTS customer_service.segments (
    id SERIAL PRIMARY KEY,
    segment_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    criteria JSONB NOT NULL, -- Query criteria for segment
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Customer segment membership (cached)
CREATE TABLE IF NOT EXISTS customer_service.segment_memberships (
    customer_id UUID NOT NULL REFERENCES customer_service.customers(id) ON DELETE CASCADE,
    segment_id INTEGER NOT NULL REFERENCES customer_service.segments(id) ON DELETE CASCADE,
    added_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (customer_id, segment_id)
);

CREATE INDEX idx_segment_memberships_segment ON customer_service.segment_memberships(segment_id);

-- Insert default segments
INSERT INTO customer_service.segments (segment_name, description, criteria) VALUES
('High Value', 'Customers with lifetime value > $1000', '{"lifetime_value": {"$gt": 1000}}'::jsonb),
('At Risk', 'Customers who haven''t purchased in 90+ days', '{"last_purchase": {"$lt": "90_days_ago"}}'::jsonb),
('New Customers', 'Customers who joined in last 30 days', '{"created_at": {"$gt": "30_days_ago"}}'::jsonb),
('VIP', 'Platinum loyalty members or high spenders', '{"tier": "PLATINUM"}'::jsonb)
ON CONFLICT (segment_name) DO NOTHING;

-- Trigger to update last_purchase on customer
CREATE OR REPLACE FUNCTION customer_service.update_last_purchase()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'COMPLETED' AND NEW.customer_id IS NOT NULL THEN
        UPDATE customer_service.customers
        SET last_purchase = NEW.created_at
        WHERE id = NEW.customer_id
          AND (last_purchase IS NULL OR last_purchase < NEW.created_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_last_purchase
    AFTER INSERT OR UPDATE OF status ON order_service.retail_transactions
    FOR EACH ROW
    EXECUTE FUNCTION customer_service.update_last_purchase();

COMMENT ON TABLE customer_service.customers IS 'Customer profiles and contact information';
COMMENT ON TABLE customer_service.addresses IS 'Multiple shipping/billing addresses per customer';
COMMENT ON TABLE customer_service.customer_notes IS 'Customer service interactions and notes';
COMMENT ON TABLE customer_service.segments IS 'Marketing segments for customer grouping';
