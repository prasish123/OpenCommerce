-- OpenCommerce POS Database Migration
-- Migration 001: Create database schemas (service boundaries)
-- ARTS/Conexxus compliant structure

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create separate schemas for each service (microservices-ready)
CREATE SCHEMA IF NOT EXISTS product_service;
CREATE SCHEMA IF NOT EXISTS order_service;
CREATE SCHEMA IF NOT EXISTS inventory_service;
CREATE SCHEMA IF NOT EXISTS payment_service;
CREATE SCHEMA IF NOT EXISTS customer_service;
CREATE SCHEMA IF NOT EXISTS compliance_service;
CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS reporting_service;

-- Grant permissions
GRANT USAGE ON SCHEMA product_service TO opencommerce;
GRANT USAGE ON SCHEMA order_service TO opencommerce;
GRANT USAGE ON SCHEMA inventory_service TO opencommerce;
GRANT USAGE ON SCHEMA payment_service TO opencommerce;
GRANT USAGE ON SCHEMA customer_service TO opencommerce;
GRANT USAGE ON SCHEMA compliance_service TO opencommerce;
GRANT USAGE ON SCHEMA auth_service TO opencommerce;
GRANT USAGE ON SCHEMA reporting_service TO opencommerce;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA product_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA order_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA inventory_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA payment_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA customer_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA compliance_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth_service TO opencommerce;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA reporting_service TO opencommerce;

-- Comment for documentation
COMMENT ON SCHEMA product_service IS 'Product catalog, pricing, promotions, and semantic search';
COMMENT ON SCHEMA order_service IS 'Orders from all channels (DoorDash, Uber, Website, In-store)';
COMMENT ON SCHEMA inventory_service IS 'Real-time inventory tracking across channels';
COMMENT ON SCHEMA payment_service IS 'Payment processing, Stripe integration, tenders';
COMMENT ON SCHEMA customer_service IS 'Customer data, loyalty (future)';
COMMENT ON SCHEMA compliance_service IS 'Age verification, alcohol delivery logs';
COMMENT ON SCHEMA auth_service IS 'User authentication, RBAC, sessions';
COMMENT ON SCHEMA reporting_service IS 'Aggregated reports, analytics';
