-- =============================================
-- Website Connector Tables
-- Track website orders and sync status
-- =============================================

-- Website configuration
CREATE TABLE IF NOT EXISTS website_connector.configurations (
    id UUID PRIMARY KEY,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('CUSTOM', 'SHOPIFY', 'WOOCOMMERCE', 'BIGCOMMERCE')),
    api_url VARCHAR(500) NOT NULL,
    api_key_encrypted BYTEA, -- Encrypted API key
    api_secret_encrypted BYTEA, -- Encrypted API secret
    shop_name VARCHAR(200), -- For Shopify
    store_hash VARCHAR(200), -- For BigCommerce
    webhook_secret_encrypted BYTEA,
    is_active BOOLEAN DEFAULT true,
    last_sync TIMESTAMP,
    sync_interval_minutes INT DEFAULT 5,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_website_config_platform ON website_connector.configurations(platform);
CREATE INDEX idx_website_config_active ON website_connector.configurations(is_active) WHERE is_active = true;

-- Website orders (cached from platform)
CREATE TABLE IF NOT EXISTS website_connector.website_orders (
    id UUID PRIMARY KEY,
    external_order_id VARCHAR(200) UNIQUE NOT NULL,
    platform VARCHAR(50) NOT NULL,
    customer_email VARCHAR(200),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    shipping_address JSONB,
    order_data JSONB NOT NULL, -- Full order data from platform
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) NOT NULL,
    shipping DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    payment_status VARCHAR(20) CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED')),
    fulfillment_status VARCHAR(20) CHECK (fulfillment_status IN ('UNFULFILLED', 'PARTIAL', 'FULFILLED', 'CANCELLED')),
    order_date TIMESTAMP NOT NULL,
    imported_to_pos BOOLEAN DEFAULT false,
    pos_transaction_id UUID REFERENCES order_service.retail_transactions(id),
    imported_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_website_orders_external_id ON website_connector.website_orders(external_order_id);
CREATE INDEX idx_website_orders_platform ON website_connector.website_orders(platform);
CREATE INDEX idx_website_orders_customer_email ON website_connector.website_orders(customer_email);
CREATE INDEX idx_website_orders_order_date ON website_connector.website_orders(order_date DESC);
CREATE INDEX idx_website_orders_not_imported ON website_connector.website_orders(imported_to_pos) WHERE imported_to_pos = false;
CREATE INDEX idx_website_orders_fulfillment ON website_connector.website_orders(fulfillment_status);

-- Sync log (track all sync operations)
CREATE TABLE IF NOT EXISTS website_connector.sync_log (
    id UUID PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('ORDERS', 'INVENTORY', 'PRODUCTS', 'CUSTOMERS')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('STARTED', 'SUCCESS', 'FAILED')),
    records_processed INT DEFAULT 0,
    records_imported INT DEFAULT 0,
    records_failed INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INT
);

CREATE INDEX idx_sync_log_platform ON website_connector.sync_log(platform);
CREATE INDEX idx_sync_log_sync_type ON website_connector.sync_log(sync_type);
CREATE INDEX idx_sync_log_status ON website_connector.sync_log(status);
CREATE INDEX idx_sync_log_started_at ON website_connector.sync_log(started_at DESC);

-- Inventory sync tracking
CREATE TABLE IF NOT EXISTS website_connector.inventory_sync (
    id UUID PRIMARY KEY,
    product_id UUID REFERENCES product_service.products(id),
    external_product_id VARCHAR(200), -- SKU or product ID on platform
    platform VARCHAR(50) NOT NULL,
    last_synced_quantity INT,
    last_sync_timestamp TIMESTAMP,
    sync_status VARCHAR(20) CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    UNIQUE(product_id, platform)
);

CREATE INDEX idx_inventory_sync_product ON website_connector.inventory_sync(product_id);
CREATE INDEX idx_inventory_sync_platform ON website_connector.inventory_sync(platform);
CREATE INDEX idx_inventory_sync_status ON website_connector.inventory_sync(sync_status);
CREATE INDEX idx_inventory_sync_failed ON website_connector.inventory_sync(sync_status) WHERE sync_status = 'FAILED';

-- Webhook events (incoming webhooks from platform)
CREATE TABLE IF NOT EXISTS website_connector.webhook_events (
    id UUID PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- order/create, order/update, product/update, etc.
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,
    error_message TEXT,
    received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_platform ON website_connector.webhook_events(platform);
CREATE INDEX idx_webhook_events_type ON website_connector.webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON website_connector.webhook_events(processed) WHERE processed = false;
CREATE INDEX idx_webhook_events_received ON website_connector.webhook_events(received_at DESC);

-- Add external_order_id to transactions if not exists (for website orders)
ALTER TABLE order_service.retail_transactions
ADD COLUMN IF NOT EXISTS external_order_id VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_transactions_external_order ON order_service.retail_transactions(external_order_id);

-- Function to mark order as imported
CREATE OR REPLACE FUNCTION website_connector.mark_order_imported(
    p_external_order_id VARCHAR(200),
    p_transaction_id UUID
)
RETURNS void AS $$
BEGIN
    UPDATE website_connector.website_orders
    SET imported_to_pos = true,
        pos_transaction_id = p_transaction_id,
        imported_at = NOW(),
        updated_at = NOW()
    WHERE external_order_id = p_external_order_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get unimported orders
CREATE OR REPLACE FUNCTION website_connector.get_unimported_orders(
    p_platform VARCHAR(50) DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    external_order_id VARCHAR(200),
    platform VARCHAR(50),
    customer_email VARCHAR(200),
    total DECIMAL(10, 2),
    order_date TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wo.id,
        wo.external_order_id,
        wo.platform,
        wo.customer_email,
        wo.total,
        wo.order_date
    FROM website_connector.website_orders wo
    WHERE wo.imported_to_pos = false
      AND wo.payment_status = 'PAID'
      AND (p_platform IS NULL OR wo.platform = p_platform)
    ORDER BY wo.order_date ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE website_connector.configurations IS 'Website platform API configurations';
COMMENT ON TABLE website_connector.website_orders IS 'Cached orders from website/e-commerce platform';
COMMENT ON TABLE website_connector.sync_log IS 'Sync operation audit log';
COMMENT ON TABLE website_connector.inventory_sync IS 'Track inventory sync status per product';
COMMENT ON TABLE website_connector.webhook_events IS 'Incoming webhook events from platform';
