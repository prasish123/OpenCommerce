-- =============================================
-- Store-Level Database Architecture
-- Support multiple POS terminals per store with local database
-- =============================================

-- Store database configuration
CREATE TABLE IF NOT EXISTS store_databases (
    id UUID PRIMARY KEY,
    store_id VARCHAR(50) UNIQUE NOT NULL,
    database_type VARCHAR(20) NOT NULL CHECK (database_type IN ('SQLITE', 'POSTGRESQL')),
    connection_string TEXT, -- For PostgreSQL at store level
    sqlite_file_path TEXT, -- For SQLite at store level
    sync_enabled BOOLEAN DEFAULT true,
    last_sync TIMESTAMP,
    sync_interval_seconds INT DEFAULT 30, -- Sync every 30 seconds
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_store_databases_store_id ON store_databases(store_id);
CREATE INDEX idx_store_databases_active ON store_databases(is_active) WHERE is_active = true;

-- Terminals (POS terminals at each store)
CREATE TABLE IF NOT EXISTS terminals (
    id UUID PRIMARY KEY,
    terminal_id VARCHAR(50) UNIQUE NOT NULL,
    store_id VARCHAR(50) NOT NULL,
    terminal_name VARCHAR(200) NOT NULL,
    ip_address VARCHAR(45), -- Supports IPv4 and IPv6
    mac_address VARCHAR(17),
    hardware_model VARCHAR(100),
    software_version VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    is_online BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMP,
    capabilities JSONB, -- {"barcode_scanner": true, "receipt_printer": true, "card_reader": true}
    settings JSONB, -- Terminal-specific settings
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES store_locations(store_id) ON DELETE CASCADE
);

CREATE INDEX idx_terminals_store_id ON terminals(store_id);
CREATE INDEX idx_terminals_terminal_id ON terminals(terminal_id);
CREATE INDEX idx_terminals_active ON terminals(is_active) WHERE is_active = true;
CREATE INDEX idx_terminals_online ON terminals(is_online) WHERE is_online = true;

-- Terminal sessions (track when terminal was opened/closed)
CREATE TABLE IF NOT EXISTS terminal_sessions (
    id UUID PRIMARY KEY,
    terminal_id VARCHAR(50) NOT NULL,
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    opened_by UUID REFERENCES auth_service.users(id),
    closed_at TIMESTAMP,
    closed_by UUID REFERENCES auth_service.users(id),
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CRASHED')),
    transactions_count INT DEFAULT 0,
    total_sales DECIMAL(10, 2) DEFAULT 0,
    FOREIGN KEY (terminal_id) REFERENCES terminals(terminal_id) ON DELETE CASCADE
);

CREATE INDEX idx_terminal_sessions_terminal ON terminal_sessions(terminal_id);
CREATE INDEX idx_terminal_sessions_status ON terminal_sessions(status);
CREATE INDEX idx_terminal_sessions_opened_at ON terminal_sessions(opened_at DESC);

-- Sync queue (track pending sync operations)
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY,
    store_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50),
    sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('TRANSACTION', 'PRODUCT', 'INVENTORY', 'PROMOTION', 'LOYALTY', 'CUSTOMER', 'CONFIG')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('UP', 'DOWN')), -- UP = store to central, DOWN = central to store
    record_id UUID NOT NULL,
    record_data JSONB NOT NULL,
    priority INT DEFAULT 5, -- 1 = highest, 10 = lowest
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CONFLICT')),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES store_locations(store_id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_queue_store_id ON sync_queue(store_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_priority ON sync_queue(priority, created_at);
CREATE INDEX idx_sync_queue_pending ON sync_queue(store_id, status, priority) WHERE status = 'PENDING';

-- Sync conflicts (track conflicts that need manual resolution)
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY,
    store_id VARCHAR(50) NOT NULL,
    record_type VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    local_data JSONB NOT NULL,
    server_data JSONB NOT NULL,
    conflict_type VARCHAR(50) NOT NULL, -- TIMESTAMP_MISMATCH, DATA_DIVERGENCE, DUPLICATE_KEY
    resolution_strategy VARCHAR(50), -- SERVER_WINS, LOCAL_WINS, MERGED, MANUAL
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES auth_service.users(id),
    resolution_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (store_id) REFERENCES store_locations(store_id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_conflicts_store_id ON sync_conflicts(store_id);
CREATE INDEX idx_sync_conflicts_unresolved ON sync_conflicts(resolved) WHERE resolved = false;
CREATE INDEX idx_sync_conflicts_created_at ON sync_conflicts(created_at DESC);

-- Sync statistics (track sync performance)
CREATE TABLE IF NOT EXISTS sync_statistics (
    id UUID PRIMARY KEY,
    store_id VARCHAR(50) NOT NULL,
    sync_type VARCHAR(50) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    records_synced INT NOT NULL,
    records_failed INT NOT NULL,
    duration_ms INT NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    success BOOLEAN NOT NULL,
    error_summary TEXT,
    FOREIGN KEY (store_id) REFERENCES store_locations(store_id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_statistics_store_id ON sync_statistics(store_id);
CREATE INDEX idx_sync_statistics_started_at ON sync_statistics(started_at DESC);
CREATE INDEX idx_sync_statistics_sync_type ON sync_statistics(sync_type);

-- Offline transaction queue (transactions made while offline)
CREATE TABLE IF NOT EXISTS offline_transactions (
    id UUID PRIMARY KEY,
    transaction_id UUID UNIQUE NOT NULL,
    store_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50) NOT NULL,
    transaction_data JSONB NOT NULL, -- Complete transaction payload
    created_at TIMESTAMP NOT NULL,
    synced BOOLEAN DEFAULT false,
    synced_at TIMESTAMP,
    sync_attempts INT DEFAULT 0,
    last_sync_error TEXT,
    FOREIGN KEY (store_id) REFERENCES store_locations(store_id) ON DELETE CASCADE,
    FOREIGN KEY (terminal_id) REFERENCES terminals(terminal_id) ON DELETE CASCADE
);

CREATE INDEX idx_offline_transactions_store_id ON offline_transactions(store_id);
CREATE INDEX idx_offline_transactions_terminal_id ON offline_transactions(terminal_id);
CREATE INDEX idx_offline_transactions_unsynced ON offline_transactions(synced) WHERE synced = false;
CREATE INDEX idx_offline_transactions_created_at ON offline_transactions(created_at DESC);

-- Heartbeat tracking (monitor terminal health)
CREATE TABLE IF NOT EXISTS terminal_heartbeats (
    id UUID PRIMARY KEY,
    terminal_id VARCHAR(50) NOT NULL,
    heartbeat_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL, -- HEALTHY, WARNING, ERROR
    cpu_usage DECIMAL(5, 2), -- Percentage
    memory_usage DECIMAL(5, 2), -- Percentage
    disk_usage DECIMAL(5, 2), -- Percentage
    network_latency INT, -- Milliseconds
    pending_sync_count INT,
    error_count INT,
    metadata JSONB,
    FOREIGN KEY (terminal_id) REFERENCES terminals(terminal_id) ON DELETE CASCADE
);

CREATE INDEX idx_terminal_heartbeats_terminal ON terminal_heartbeats(terminal_id);
CREATE INDEX idx_terminal_heartbeats_time ON terminal_heartbeats(heartbeat_at DESC);

-- Data retention policy: Keep heartbeats for 30 days
CREATE OR REPLACE FUNCTION cleanup_old_heartbeats()
RETURNS void AS $$
BEGIN
    DELETE FROM terminal_heartbeats
    WHERE heartbeat_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Function to get sync queue for store (ordered by priority)
CREATE OR REPLACE FUNCTION get_sync_queue(p_store_id VARCHAR(50), p_limit INT DEFAULT 100)
RETURNS TABLE (
    id UUID,
    sync_type VARCHAR(50),
    direction VARCHAR(10),
    record_id UUID,
    record_data JSONB,
    priority INT,
    retry_count INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sq.id,
        sq.sync_type,
        sq.direction,
        sq.record_id,
        sq.record_data,
        sq.priority,
        sq.retry_count
    FROM sync_queue sq
    WHERE sq.store_id = p_store_id
      AND sq.status = 'PENDING'
      AND sq.retry_count < sq.max_retries
    ORDER BY sq.priority ASC, sq.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to mark terminal as online/offline
CREATE OR REPLACE FUNCTION update_terminal_status(
    p_terminal_id VARCHAR(50),
    p_is_online BOOLEAN
)
RETURNS void AS $$
BEGIN
    UPDATE terminals
    SET is_online = p_is_online,
        last_heartbeat = NOW(),
        updated_at = NOW()
    WHERE terminal_id = p_terminal_id;
END;
$$ LANGUAGE plpgsql;

-- Insert sample store database configurations
INSERT INTO store_databases (id, store_id, database_type, sqlite_file_path, sync_enabled, sync_interval_seconds) VALUES
(gen_random_uuid(), 'STORE-001', 'SQLITE', '/var/lib/opencommerce/store001.db', true, 30),
(gen_random_uuid(), 'STORE-002', 'SQLITE', '/var/lib/opencommerce/store002.db', true, 30)
ON CONFLICT (store_id) DO NOTHING;

-- Insert sample terminals
INSERT INTO terminals (id, terminal_id, store_id, terminal_name, is_active, capabilities) VALUES
(gen_random_uuid(), 'TERMINAL-001', 'STORE-001', 'Main Register 1', true, '{"barcode_scanner": true, "receipt_printer": true, "card_reader": true, "cash_drawer": true}'::jsonb),
(gen_random_uuid(), 'TERMINAL-002', 'STORE-001', 'Main Register 2', true, '{"barcode_scanner": true, "receipt_printer": true, "card_reader": true, "cash_drawer": true}'::jsonb),
(gen_random_uuid(), 'TERMINAL-003', 'STORE-002', 'Main Register 1', true, '{"barcode_scanner": true, "receipt_printer": true, "card_reader": true, "cash_drawer": true}'::jsonb)
ON CONFLICT (terminal_id) DO NOTHING;

COMMENT ON TABLE store_databases IS 'Store-level database configurations (SQLite or PostgreSQL at each store)';
COMMENT ON TABLE terminals IS 'POS terminals at each store location';
COMMENT ON TABLE sync_queue IS 'Queue of pending sync operations (bidirectional)';
COMMENT ON TABLE sync_conflicts IS 'Conflicts requiring manual resolution';
COMMENT ON TABLE offline_transactions IS 'Transactions made while offline (store and forward)';
COMMENT ON TABLE terminal_heartbeats IS 'Terminal health monitoring';
