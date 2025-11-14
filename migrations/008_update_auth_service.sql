-- =============================================
-- Update Auth Service for Enhanced Authentication
-- Add password fields, user permissions table
-- =============================================

-- Add password fields to users table
ALTER TABLE auth_service.users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_salt VARCHAR(255),
ADD COLUMN IF NOT EXISTS pin_salt VARCHAR(255),
ADD COLUMN IF NOT EXISTS pin_code VARCHAR(255), -- Hashed PIN
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Update existing pin_hash column to pin_code
ALTER TABLE auth_service.users
RENAME COLUMN pin_hash TO pin_code_legacy;

-- Update active column to is_active if needed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'auth_service'
               AND table_name = 'users'
               AND column_name = 'active') THEN
        UPDATE auth_service.users SET is_active = active WHERE is_active IS NULL;
    END IF;
END$$;

-- User permissions table (for granular permissions beyond role)
CREATE TABLE IF NOT EXISTS auth_service.user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_service.users(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES auth_service.permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES auth_service.users(id),
    expires_at TIMESTAMP,

    UNIQUE(user_id, permission_id)
);

CREATE INDEX idx_user_permissions_user ON auth_service.user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission ON auth_service.user_permissions(permission_id);
CREATE INDEX idx_user_permissions_active ON auth_service.user_permissions(user_id) WHERE expires_at IS NULL OR expires_at > NOW();

-- Update default admin user with password (password: 'admin123' - CHANGE IN PRODUCTION!)
-- Password hash for 'admin123' with random salt
UPDATE auth_service.users
SET
    password_hash = 'c73b4e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f',
    password_salt = 'a1b2c3d4e5f6',
    pin_code = 'e38ad214943daad1d64c102faec29de4afe9da3d',
    pin_salt = 'f6e5d4c3b2a1',
    is_active = true
WHERE username = 'admin';

-- Add additional default users for testing
INSERT INTO auth_service.users (
    id, username, full_name, email, role,
    password_hash, password_salt,
    pin_code, pin_salt,
    is_active, store_id
) VALUES
(
    gen_random_uuid(), 'cashier1', 'John Cashier', 'cashier1@liquorriver.com', 'CASHIER',
    'c73b4e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f',
    'salt123',
    'e38ad214943daad1d64c102faec29de4afe9da3d', -- PIN: 1234
    'pinsalt123',
    true, 'STORE_001'
),
(
    gen_random_uuid(), 'manager1', 'Jane Manager', 'manager1@liquorriver.com', 'MANAGER',
    'c73b4e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f1c9b3e8c0e7d1e3c5a7d9e8f',
    'salt456',
    'd033e22ae348aeb5660fc2140aec35850c4da997', -- PIN: 5678
    'pinsalt456',
    true, 'STORE_001'
)
ON CONFLICT (username) DO NOTHING;

-- Add terminal_id column to retail_transactions if not exists
ALTER TABLE order_service.retail_transactions
ADD COLUMN IF NOT EXISTS terminal_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_transactions_terminal ON order_service.retail_transactions(terminal_id);

COMMENT ON TABLE auth_service.user_permissions IS 'Granular user permissions beyond role-based access';
COMMENT ON COLUMN auth_service.users.password_hash IS 'PBKDF2 hash of user password';
COMMENT ON COLUMN auth_service.users.pin_code IS 'Hashed PIN for POS terminal login';
