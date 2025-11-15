-- Seed Test Data for OpenCommerce POS
-- This data is used by integration tests

-- ==========================================
-- SEED TEST USERS
-- ==========================================

-- Password: "password123" (bcrypt hash)
-- PIN: "1234" (bcrypt hash)
INSERT INTO auth_service.users (id, username, password_hash, role, pin_hash, first_name, last_name, email, phone) VALUES
('00000000-0000-0000-0000-000000000001', 'test_cashier', '$2b$10$rZJ8zF5J6fJ5J5J5J5J5JeZJ5J5J5J5J5J5J5J5J5J5J5J5J5J5J5', 'cashier', '$2b$10$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst', 'Test', 'Cashier', 'cashier@test.com', '555-0001'),
('00000000-0000-0000-0000-000000000002', 'test_manager', '$2b$10$rZJ8zF5J6fJ5J5J5J5J5JeZJ5J5J5J5J5J5J5J5J5J5J5J5J5J5J5', 'manager', '$2b$10$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst', 'Test', 'Manager', 'manager@test.com', '555-0002'),
('00000000-0000-0000-0000-000000000003', 'test_admin', '$2b$10$rZJ8zF5J6fJ5J5J5J5J5JeZJ5J5J5J5J5J5J5J5J5J5J5J5J5J5J5', 'admin', '$2b$10$abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst', 'Test', 'Admin', 'admin@test.com', '555-0003');

-- ==========================================
-- SEED TEST PRODUCTS
-- ==========================================

INSERT INTO product_service.products (id, barcode, description, base_price, cost, category, tax_rate, requires_age_verification) VALUES
('10000000-0000-0000-0000-000000000001', '123456789012', 'Test Product 1', 12.99, 8.00, 'Grocery', 0.07, false),
('10000000-0000-0000-0000-000000000002', '234567890123', 'Test Beer (21+)', 8.99, 6.00, 'Alcohol', 0.10, true),
('10000000-0000-0000-0000-000000000003', '345678901234', 'Test Snack', 2.49, 1.50, 'Snacks', 0.07, false),
('10000000-0000-0000-0000-000000000004', '456789012345', 'Test Beverage', 1.99, 1.00, 'Beverages', 0.07, false),
('10000000-0000-0000-0000-000000000005', '567890123456', 'Test Cigarettes (21+)', 9.99, 7.00, 'Tobacco', 0.15, true);

-- ==========================================
-- SEED TEST INVENTORY
-- ==========================================

INSERT INTO inventory_service.inventory (product_id, location_id, quantity, reorder_point, reorder_quantity) VALUES
('10000000-0000-0000-0000-000000000001', 'STORE-001', 100, 20, 50),
('10000000-0000-0000-0000-000000000002', 'STORE-001', 50, 10, 25),
('10000000-0000-0000-0000-000000000003', 'STORE-001', 200, 50, 100),
('10000000-0000-0000-0000-000000000004', 'STORE-001', 150, 30, 75),
('10000000-0000-0000-0000-000000000005', 'STORE-001', 75, 15, 40);

-- ==========================================
-- SEED TEST LOYALTY MEMBERS
-- ==========================================

INSERT INTO loyalty_service.members (id, member_number, phone, first_name, last_name, email, points_balance, tier) VALUES
('20000000-0000-0000-0000-000000000001', 'LOYAL001', '555-1001', 'John', 'Doe', 'john.doe@test.com', 500, 'SILVER'),
('20000000-0000-0000-0000-000000000002', 'LOYAL002', '555-1002', 'Jane', 'Smith', 'jane.smith@test.com', 1200, 'GOLD'),
('20000000-0000-0000-0000-000000000003', 'LOYAL003', '555-1003', 'Bob', 'Johnson', 'bob.johnson@test.com', 150, 'BRONZE');

-- ==========================================
-- VERIFY DATA
-- ==========================================

SELECT 'Users created: ' || COUNT(*) FROM auth_service.users;
SELECT 'Products created: ' || COUNT(*) FROM product_service.products;
SELECT 'Inventory records: ' || COUNT(*) FROM inventory_service.inventory;
SELECT 'Loyalty members: ' || COUNT(*) FROM loyalty_service.members;
