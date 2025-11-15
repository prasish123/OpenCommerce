-- OpenCommerce POS Database Schema
-- Creates all required schemas and tables for testing

-- ==========================================
-- CREATE SCHEMAS
-- ==========================================

CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS product_service;
CREATE SCHEMA IF NOT EXISTS inventory_service;
CREATE SCHEMA IF NOT EXISTS order_service;
CREATE SCHEMA IF NOT EXISTS payment_service;
CREATE SCHEMA IF NOT EXISTS loyalty_service;
CREATE SCHEMA IF NOT EXISTS customer_service;
CREATE SCHEMA IF NOT EXISTS logging_service;

-- ==========================================
-- AUTH SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS auth_service.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  pin_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_service.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_service.users(id),
  token VARCHAR(500) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  terminal_id VARCHAR(50),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON auth_service.sessions(token);
CREATE INDEX idx_sessions_user_id ON auth_service.sessions(user_id);

-- ==========================================
-- PRODUCT SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS product_service.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(255) NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL,
  cost NUMERIC(10, 2),
  category VARCHAR(100),
  tax_rate NUMERIC(5, 4) DEFAULT 0.07,
  requires_age_verification BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_barcode ON product_service.products(barcode);
CREATE INDEX idx_products_category ON product_service.products(category);

-- ==========================================
-- INVENTORY SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS inventory_service.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_service.products(id),
  location_id VARCHAR(50) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(10, 2),
  reorder_quantity NUMERIC(10, 2),
  last_counted_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

CREATE TABLE IF NOT EXISTS inventory_service.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_service.products(id),
  location_id VARCHAR(50) NOT NULL,
  movement_type VARCHAR(20) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON inventory_service.stock_movements(product_id);
CREATE INDEX idx_stock_movements_reference ON inventory_service.stock_movements(reference_id);

-- ==========================================
-- ORDER SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS order_service.retail_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number SERIAL,
  store_id VARCHAR(50) NOT NULL,
  terminal_id VARCHAR(50),
  business_date DATE NOT NULL,
  cashier_id UUID REFERENCES auth_service.users(id),
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  external_order_id VARCHAR(100),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  customer_email VARCHAR(255),
  subtotal NUMERIC(10, 2) NOT NULL,
  tax_amount NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  contains_alcohol BOOLEAN DEFAULT false,
  age_verified BOOLEAN DEFAULT false,
  delivery_address TEXT,
  driver_name VARCHAR(255),
  driver_phone VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'PENDING',
  payment_intent_id VARCHAR(255),
  payment_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_service.transaction_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES order_service.retail_transactions(id),
  line_number INTEGER NOT NULL,
  product_id UUID REFERENCES product_service.products(id),
  barcode VARCHAR(50),
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  extended_price NUMERIC(10, 2) NOT NULL,
  tax_amount NUMERIC(10, 2) NOT NULL,
  requires_age_verification BOOLEAN DEFAULT false,
  UNIQUE(transaction_id, line_number)
);

CREATE TABLE IF NOT EXISTS order_service.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES order_service.retail_transactions(id),
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_business_date ON order_service.retail_transactions(business_date);
CREATE INDEX idx_transactions_status ON order_service.retail_transactions(status);
CREATE INDEX idx_transaction_line_items_transaction ON order_service.transaction_line_items(transaction_id);

-- ==========================================
-- PAYMENT SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS payment_service.tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES order_service.retail_transactions(id),
  tender_type VARCHAR(20) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_intent_id VARCHAR(255),
  cash_tendered NUMERIC(10, 2),
  change_amount NUMERIC(10, 2),
  status VARCHAR(20) DEFAULT 'COMPLETED',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_service.offline_payment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES order_service.retail_transactions(id),
  amount NUMERIC(10, 2) NOT NULL,
  payment_intent_id VARCHAR(255),
  processed_at TIMESTAMP NOT NULL,
  sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  synced_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_offline_payment_queue_sync_status ON payment_service.offline_payment_queue(sync_status);
CREATE INDEX idx_offline_payment_queue_payment_intent ON payment_service.offline_payment_queue(payment_intent_id);

-- ==========================================
-- LOYALTY SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS loyalty_service.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_number VARCHAR(50) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  points_balance INTEGER DEFAULT 0,
  tier VARCHAR(20) DEFAULT 'BRONZE',
  enrolled_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS loyalty_service.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES loyalty_service.members(id),
  transaction_id UUID REFERENCES order_service.retail_transactions(id),
  points_earned INTEGER,
  points_redeemed INTEGER,
  balance_after INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_members_phone ON loyalty_service.members(phone);
CREATE INDEX idx_points_transactions_member ON loyalty_service.points_transactions(member_id);

-- ==========================================
-- LOGGING SERVICE SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS logging_service.application_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  level VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  store_id VARCHAR(50),
  terminal_id VARCHAR(50),
  user_id UUID,
  session_id UUID,
  request_id VARCHAR(100),
  stack_trace TEXT,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logging_service.critical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  metadata JSONB,
  store_id VARCHAR(50),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_application_logs_timestamp ON logging_service.application_logs(timestamp);
CREATE INDEX idx_application_logs_level ON logging_service.application_logs(level);
CREATE INDEX idx_application_logs_category ON logging_service.application_logs(category);
CREATE INDEX idx_critical_alerts_acknowledged ON logging_service.critical_alerts(acknowledged);

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA product_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA inventory_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA order_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA payment_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA loyalty_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA customer_service TO test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA logging_service TO test;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA product_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA order_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA payment_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA loyalty_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA customer_service TO test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA logging_service TO test;
