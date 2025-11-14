-- =============================================
-- Reporting Service Tables
-- X/Z reports, drawer sessions, report storage
-- =============================================

-- Drawer sessions (cash drawer tracking)
CREATE TABLE IF NOT EXISTS reporting_service.drawer_sessions (
    id UUID PRIMARY KEY,
    terminal_id VARCHAR(50) NOT NULL,
    business_date DATE NOT NULL,
    opened_at TIMESTAMP NOT NULL,
    opened_by UUID NOT NULL REFERENCES auth_service.users(id),
    closed_at TIMESTAMP,
    closed_by UUID REFERENCES auth_service.users(id),
    starting_cash DECIMAL(10, 2) NOT NULL,
    actual_cash DECIMAL(10, 2),
    variance DECIMAL(10, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RECONCILED', 'VARIANCE')),
    notes TEXT,

    -- One drawer session per terminal per business date
    UNIQUE(terminal_id, business_date)
);

CREATE INDEX idx_drawer_sessions_terminal ON reporting_service.drawer_sessions(terminal_id);
CREATE INDEX idx_drawer_sessions_business_date ON reporting_service.drawer_sessions(business_date DESC);
CREATE INDEX idx_drawer_sessions_status ON reporting_service.drawer_sessions(status);
CREATE INDEX idx_drawer_sessions_opened_by ON reporting_service.drawer_sessions(opened_by);

-- Reports storage (X/Z reports, EOD reports, etc.)
CREATE TABLE IF NOT EXISTS reporting_service.reports (
    id UUID PRIMARY KEY,
    report_type VARCHAR(50) NOT NULL, -- X_REPORT, Z_REPORT, EOD_REPORT, etc.
    business_date DATE NOT NULL,
    store_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50), -- NULL for store-wide reports
    report_data JSONB NOT NULL,
    generated_at TIMESTAMP NOT NULL,
    generated_by UUID REFERENCES auth_service.users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_business_date ON reporting_service.reports(business_date DESC);
CREATE INDEX idx_reports_type ON reporting_service.reports(report_type);
CREATE INDEX idx_reports_store ON reporting_service.reports(store_id);
CREATE INDEX idx_reports_terminal ON reporting_service.reports(terminal_id);
CREATE INDEX idx_reports_generated_at ON reporting_service.reports(generated_at DESC);

-- Sales by hour (aggregated for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS reporting_service.hourly_sales AS
SELECT
    business_date,
    store_id,
    EXTRACT(HOUR FROM created_at) as hour,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_sales,
    SUM(tax_amount) as total_tax,
    AVG(total_amount) as avg_transaction
FROM order_service.retail_transactions
WHERE status = 'COMPLETED'
GROUP BY business_date, store_id, EXTRACT(HOUR FROM created_at);

CREATE UNIQUE INDEX idx_hourly_sales_unique ON reporting_service.hourly_sales(business_date, store_id, hour);
CREATE INDEX idx_hourly_sales_date ON reporting_service.hourly_sales(business_date DESC);

-- Sales by channel (aggregated for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS reporting_service.channel_sales AS
SELECT
    business_date,
    store_id,
    channel,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_sales,
    SUM(tax_amount) as total_tax,
    AVG(total_amount) as avg_transaction
FROM order_service.retail_transactions
WHERE status = 'COMPLETED'
GROUP BY business_date, store_id, channel;

CREATE UNIQUE INDEX idx_channel_sales_unique ON reporting_service.channel_sales(business_date, store_id, channel);
CREATE INDEX idx_channel_sales_date ON reporting_service.channel_sales(business_date DESC);

-- Top products by day (aggregated for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS reporting_service.top_products_daily AS
SELECT
    t.business_date,
    li.product_id,
    p.barcode,
    p.description,
    SUM(li.quantity) as total_quantity,
    SUM(li.extended_price) as total_revenue,
    COUNT(DISTINCT t.id) as transaction_count
FROM order_service.transaction_line_items li
JOIN order_service.retail_transactions t ON li.transaction_id = t.id
JOIN product_service.products p ON li.product_id = p.id
WHERE t.status = 'COMPLETED'
GROUP BY t.business_date, li.product_id, p.barcode, p.description;

CREATE INDEX idx_top_products_daily_date ON reporting_service.top_products_daily(business_date DESC);
CREATE INDEX idx_top_products_daily_revenue ON reporting_service.top_products_daily(total_revenue DESC);
CREATE INDEX idx_top_products_daily_quantity ON reporting_service.top_products_daily(total_quantity DESC);

-- Functions to refresh materialized views
CREATE OR REPLACE FUNCTION reporting_service.refresh_hourly_sales()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY reporting_service.hourly_sales;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reporting_service.refresh_channel_sales()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY reporting_service.channel_sales;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reporting_service.refresh_top_products()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY reporting_service.top_products_daily;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh all reporting views (call once per hour or EOD)
CREATE OR REPLACE FUNCTION reporting_service.refresh_all_views()
RETURNS void AS $$
BEGIN
    PERFORM reporting_service.refresh_hourly_sales();
    PERFORM reporting_service.refresh_channel_sales();
    PERFORM reporting_service.refresh_top_products();
END;
$$ LANGUAGE plpgsql;

-- Scheduled reports configuration
CREATE TABLE IF NOT EXISTS reporting_service.scheduled_reports (
    id UUID PRIMARY KEY,
    report_type VARCHAR(50) NOT NULL,
    schedule_cron VARCHAR(100) NOT NULL, -- Cron expression
    store_id VARCHAR(50),
    recipients JSONB, -- Array of email addresses
    is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_reports_next_run ON reporting_service.scheduled_reports(next_run) WHERE is_active = true;

-- Report templates
CREATE TABLE IF NOT EXISTS reporting_service.report_templates (
    id UUID PRIMARY KEY,
    template_name VARCHAR(100) UNIQUE NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    template_config JSONB NOT NULL, -- Columns, filters, formatting, etc.
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

COMMENT ON TABLE reporting_service.drawer_sessions IS 'Cash drawer tracking for reconciliation';
COMMENT ON TABLE reporting_service.reports IS 'Generated reports storage (X/Z/EOD)';
COMMENT ON MATERIALIZED VIEW reporting_service.hourly_sales IS 'Hourly sales aggregation for performance';
COMMENT ON MATERIALIZED VIEW reporting_service.channel_sales IS 'Channel sales aggregation for performance';
COMMENT ON MATERIALIZED VIEW reporting_service.top_products_daily IS 'Top selling products by day';
