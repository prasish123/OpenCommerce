-- =============================================
-- Tax Service Tables
-- Advanced tax rules and jurisdiction-based calculation
-- =============================================

-- Tax rules
CREATE TYPE tax_type AS ENUM (
    'SALES_TAX',
    'EXCISE_TAX',
    'BOTTLE_DEPOSIT',
    'LOCAL_TAX',
    'ENVIRONMENTAL_FEE'
);

CREATE TYPE tax_calculation_method AS ENUM (
    'PERCENTAGE',
    'FIXED_AMOUNT',
    'TIERED'
);

CREATE TABLE IF NOT EXISTS tax_service.tax_rules (
    id UUID PRIMARY KEY,
    jurisdiction VARCHAR(100) NOT NULL, -- STATE, STATE-COUNTY, STATE-ZIPCODE
    tax_type tax_type NOT NULL,
    rate DECIMAL(10, 4) NOT NULL, -- 7.5 for 7.5% or 0.10 for $0.10
    calculation_method tax_calculation_method NOT NULL DEFAULT 'PERCENTAGE',
    product_category VARCHAR(50), -- ALCOHOL, BEER, WINE, SPIRITS, TOBACCO, GENERAL
    min_price DECIMAL(10, 2), -- For tiered pricing
    max_price DECIMAL(10, 2), -- For tiered pricing
    is_active BOOLEAN DEFAULT true,
    effective_date DATE NOT NULL,
    expiration_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_tax_rules_jurisdiction ON tax_service.tax_rules(jurisdiction);
CREATE INDEX idx_tax_rules_type ON tax_service.tax_rules(tax_type);
CREATE INDEX idx_tax_rules_category ON tax_service.tax_rules(product_category);
CREATE INDEX idx_tax_rules_active ON tax_service.tax_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_tax_rules_effective ON tax_service.tax_rules(effective_date, expiration_date);

-- Store locations (for jurisdiction lookup)
CREATE TABLE IF NOT EXISTS store_locations (
    id UUID PRIMARY KEY,
    store_id VARCHAR(50) UNIQUE NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    county VARCHAR(100),
    state VARCHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(200),
    timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_store_locations_store_id ON store_locations(store_id);
CREATE INDEX idx_store_locations_zip ON store_locations(zip_code);
CREATE INDEX idx_store_locations_state ON store_locations(state);

-- Tax calculation audit log
CREATE TABLE IF NOT EXISTS tax_service.calculation_log (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES order_service.retail_transactions(id),
    jurisdiction VARCHAR(100) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    total_tax DECIMAL(10, 2) NOT NULL,
    breakdown JSONB NOT NULL, -- Array of tax breakdown by type
    rules_applied JSONB NOT NULL, -- Array of tax rule IDs applied
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calculation_log_transaction ON tax_service.calculation_log(transaction_id);
CREATE INDEX idx_calculation_log_jurisdiction ON tax_service.calculation_log(jurisdiction);
CREATE INDEX idx_calculation_log_calculated_at ON tax_service.calculation_log(calculated_at DESC);

-- Insert default tax rules for California

-- California state sales tax (7.25% base)
INSERT INTO tax_service.tax_rules (id, jurisdiction, tax_type, rate, calculation_method, is_active, effective_date) VALUES
(gen_random_uuid(), 'CA', 'SALES_TAX', 7.25, 'PERCENTAGE', true, '2020-01-01'),
(gen_random_uuid(), 'CA', 'SALES_TAX', 1.00, 'PERCENTAGE', true, '2020-01-01') -- Additional 1% local tax
ON CONFLICT DO NOTHING;

-- Example: Los Angeles County additional tax (0.25%)
INSERT INTO tax_service.tax_rules (id, jurisdiction, tax_type, rate, calculation_method, is_active, effective_date) VALUES
(gen_random_uuid(), 'CA-LOS-ANGELES', 'LOCAL_TAX', 0.25, 'PERCENTAGE', true, '2020-01-01')
ON CONFLICT DO NOTHING;

-- Alcohol excise tax (example: $0.20 per liter for spirits)
INSERT INTO tax_service.tax_rules (id, jurisdiction, tax_type, rate, calculation_method, product_category, is_active, effective_date) VALUES
(gen_random_uuid(), 'CA', 'EXCISE_TAX', 3.30, 'PERCENTAGE', 'SPIRITS', true, '2020-01-01'),
(gen_random_uuid(), 'CA', 'EXCISE_TAX', 0.20, 'PERCENTAGE', 'WINE', true, '2020-01-01'),
(gen_random_uuid(), 'CA', 'EXCISE_TAX', 0.04, 'PERCENTAGE', 'BEER', true, '2020-01-01')
ON CONFLICT DO NOTHING;

-- Bottle deposit (CRV - California Redemption Value)
INSERT INTO tax_service.tax_rules (id, jurisdiction, tax_type, rate, calculation_method, product_category, is_active, effective_date) VALUES
(gen_random_uuid(), 'CA', 'BOTTLE_DEPOSIT', 0.05, 'FIXED_AMOUNT', 'BEER', true, '2020-01-01'),
(gen_random_uuid(), 'CA', 'BOTTLE_DEPOSIT', 0.10, 'FIXED_AMOUNT', 'WINE', true, '2020-01-01')
ON CONFLICT DO NOTHING;

-- Insert Liquor River store locations
INSERT INTO store_locations (id, store_id, store_name, address, city, county, state, zip_code, phone, email, timezone) VALUES
(gen_random_uuid(), 'STORE-001', 'Liquor River - Main', '123 Main St', 'Los Angeles', 'Los Angeles', 'CA', '90001', '(555) 123-4567', 'store1@liquorriver.com', 'America/Los_Angeles'),
(gen_random_uuid(), 'STORE-002', 'Liquor River - West', '456 West Ave', 'Los Angeles', 'Los Angeles', 'CA', '90002', '(555) 234-5678', 'store2@liquorriver.com', 'America/Los_Angeles')
ON CONFLICT (store_id) DO NOTHING;

-- Function to get effective tax rate for jurisdiction
CREATE OR REPLACE FUNCTION tax_service.get_effective_rate(
    p_jurisdiction VARCHAR(100),
    p_category VARCHAR(50) DEFAULT NULL
)
RETURNS DECIMAL(10, 4) AS $$
DECLARE
    total_rate DECIMAL(10, 4) := 0;
BEGIN
    SELECT COALESCE(SUM(rate), 0) INTO total_rate
    FROM tax_service.tax_rules
    WHERE jurisdiction = p_jurisdiction
      AND is_active = true
      AND calculation_method = 'PERCENTAGE'
      AND effective_date <= CURRENT_DATE
      AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
      AND (product_category IS NULL OR product_category = p_category OR p_category IS NULL);

    RETURN total_rate;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE tax_service.tax_rules IS 'Jurisdiction-based tax rules for advanced tax calculation';
COMMENT ON TABLE store_locations IS 'Store location information for jurisdiction lookup';
COMMENT ON TABLE tax_service.calculation_log IS 'Audit log of all tax calculations';
