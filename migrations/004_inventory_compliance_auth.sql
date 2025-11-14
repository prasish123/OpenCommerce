-- Migration 004: Inventory, Compliance, and Auth Services

-- ===========================
-- INVENTORY SERVICE
-- ===========================
SET search_path TO inventory_service;

CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL, -- Reference to product_service.products
    store_id VARCHAR(50) NOT NULL,
    quantity_on_hand DECIMAL(10,3) NOT NULL DEFAULT 0,
    quantity_reserved DECIMAL(10,3) NOT NULL DEFAULT 0, -- Pending orders
    quantity_available DECIMAL(10,3) GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,

    -- Reorder management
    reorder_point DECIMAL(10,3) DEFAULT 10,
    reorder_quantity DECIMAL(10,3) DEFAULT 50,

    -- Tracking
    last_received_at TIMESTAMP,
    last_sold_at TIMESTAMP,
    last_counted_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(product_id, store_id)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_store ON inventory(store_id);
CREATE INDEX idx_inventory_low_stock ON inventory(store_id, quantity_available) WHERE quantity_available < reorder_point;

-- Inventory Movements (audit trail)
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL,
    store_id VARCHAR(50) NOT NULL,
    movement_type VARCHAR(50) NOT NULL, -- SALE, RECEIVE, ADJUST, RETURN
    quantity DECIMAL(10,3) NOT NULL, -- Positive or negative
    reference_id UUID, -- transaction_id, purchase_order_id, etc.
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_movements_product ON inventory_movements(product_id, created_at DESC);
CREATE INDEX idx_movements_store ON inventory_movements(store_id, created_at DESC);
CREATE INDEX idx_movements_reference ON inventory_movements(reference_id);

-- ===========================
-- COMPLIANCE SERVICE
-- ===========================
SET search_path TO compliance_service;

-- Age Verification Logs (alcohol, tobacco, etc.)
CREATE TABLE age_verification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    order_channel VARCHAR(50) NOT NULL,

    -- Customer/Driver info
    customer_name VARCHAR(200),
    driver_name VARCHAR(200),
    driver_license_number VARCHAR(50),
    driver_license_state VARCHAR(2),
    driver_dob DATE,

    -- Verification details
    verification_method VARCHAR(50) NOT NULL, -- MANUAL_ID_CHECK, ID_SCANNER, PHOTO_UPLOAD
    verified_by VARCHAR(100) NOT NULL, -- Cashier ID
    verified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Optional photo evidence
    id_photo_url TEXT,

    -- Products requiring verification
    restricted_items JSONB,

    store_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_age_verification_transaction ON age_verification_logs(transaction_id);
CREATE INDEX idx_age_verification_date ON age_verification_logs(verified_at DESC);
CREATE INDEX idx_age_verification_store ON age_verification_logs(store_id, verified_at DESC);

-- Compliance Audit Trail (general)
CREATE TABLE compliance_audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'INFO', -- INFO, WARNING, CRITICAL
    store_id VARCHAR(50),
    user_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_trail_type ON compliance_audit_trail(event_type);
CREATE INDEX idx_audit_trail_date ON compliance_audit_trail(created_at DESC);
CREATE INDEX idx_audit_trail_store ON compliance_audit_trail(store_id, created_at DESC);

-- ===========================
-- AUTH SERVICE
-- ===========================
SET search_path TO auth_service;

CREATE TYPE user_role AS ENUM ('CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');

-- Users (employees)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    pin_hash VARCHAR(255) NOT NULL, -- Hashed 4-digit PIN
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    role user_role NOT NULL DEFAULT 'CASHIER',

    -- Assignment
    store_id VARCHAR(50),
    terminal_id VARCHAR(50),

    -- Status
    active BOOLEAN DEFAULT true,
    locked_until TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,

    -- Timestamps
    last_login_at TIMESTAMP,
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_store ON users(store_id);
CREATE INDEX idx_users_active ON users(active) WHERE active = true;

-- Sessions (JWT alternative for terminal sessions)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    store_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- User Activity Log
CREATE TABLE user_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- LOGIN, LOGOUT, TRANSACTION, PRICE_OVERRIDE, etc.
    details JSONB,
    ip_address INET,
    store_id VARCHAR(50),
    terminal_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_user ON user_activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_action ON user_activity_log(action);
CREATE INDEX idx_activity_store ON user_activity_log(store_id, created_at DESC);

-- Permissions (RBAC)
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    resource VARCHAR(100) NOT NULL, -- products, orders, inventory, users, etc.
    action VARCHAR(50) NOT NULL, -- read, write, delete, approve
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role Permissions
CREATE TABLE role_permissions (
    role user_role NOT NULL,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- Insert default permissions
INSERT INTO permissions (name, description, resource, action) VALUES
('read_products', 'View products and pricing', 'products', 'read'),
('write_products', 'Modify products and pricing', 'products', 'write'),
('read_orders', 'View orders and transactions', 'orders', 'read'),
('write_orders', 'Create and modify orders', 'orders', 'write'),
('cancel_orders', 'Cancel transactions', 'orders', 'delete'),
('read_inventory', 'View inventory levels', 'inventory', 'read'),
('write_inventory', 'Adjust inventory', 'inventory', 'write'),
('read_reports', 'View reports and analytics', 'reports', 'read'),
('manage_users', 'Create and manage users', 'users', 'write'),
('price_override', 'Override item prices', 'pricing', 'write'),
('void_transaction', 'Void completed transactions', 'transactions', 'delete'),
('refund', 'Process refunds', 'refunds', 'write');

-- Assign permissions to roles
-- CASHIER: Basic operations
INSERT INTO role_permissions (role, permission_id) VALUES
('CASHIER', (SELECT id FROM permissions WHERE name = 'read_products')),
('CASHIER', (SELECT id FROM permissions WHERE name = 'read_orders')),
('CASHIER', (SELECT id FROM permissions WHERE name = 'write_orders')),
('CASHIER', (SELECT id FROM permissions WHERE name = 'read_inventory'));

-- MANAGER: Cashier + overrides + reports
INSERT INTO role_permissions (role, permission_id)
SELECT 'MANAGER', id FROM permissions WHERE name IN (
    'read_products', 'read_orders', 'write_orders', 'read_inventory',
    'write_inventory', 'read_reports', 'price_override', 'void_transaction',
    'refund', 'cancel_orders'
);

-- ADMIN: Manager + user management + product management
INSERT INTO role_permissions (role, permission_id)
SELECT 'ADMIN', id FROM permissions;

-- SUPER_ADMIN: Everything
INSERT INTO role_permissions (role, permission_id)
SELECT 'SUPER_ADMIN', id FROM permissions;

-- Create default admin user (PIN: 1234 - CHANGE IN PRODUCTION!)
INSERT INTO users (username, pin_hash, full_name, email, role, active, store_id) VALUES
('admin', '$2b$10$rBV2kA.6HKxX4P8yL/9nEO3h7L9LDxQKlZFQx5H9YL7bQZFRYLQNK', 'Administrator', 'admin@example.com', 'SUPER_ADMIN', true, 'STORE_001');

-- Note: PIN hash is bcrypt of '1234' - MUST CHANGE ON FIRST LOGIN
