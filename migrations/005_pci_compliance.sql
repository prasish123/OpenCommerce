-- =============================================
-- PCI Compliance Tables
-- PCI DSS Requirements: 3, 4, 10, 12
-- =============================================

-- Audit Logs (PCI DSS Requirement 10)
-- Tamper-proof, append-only log of all security events
CREATE TABLE IF NOT EXISTS compliance_service.audit_logs (
    id UUID PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    user_id UUID,
    username VARCHAR(100),
    ip_address VARCHAR(45), -- IPv6 compatible
    terminal_id VARCHAR(50),
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for fast querying
CREATE INDEX idx_audit_logs_created_at ON compliance_service.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON compliance_service.audit_logs(event_type);
CREATE INDEX idx_audit_logs_user_id ON compliance_service.audit_logs(user_id);
CREATE INDEX idx_audit_logs_severity ON compliance_service.audit_logs(severity);

-- Prevent updates and deletes (append-only)
CREATE OR REPLACE FUNCTION compliance_service.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable - modifications not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE ON compliance_service.audit_logs
    FOR EACH ROW EXECUTE FUNCTION compliance_service.prevent_audit_log_modification();

CREATE TRIGGER prevent_audit_log_delete
    BEFORE DELETE ON compliance_service.audit_logs
    FOR EACH ROW EXECUTE FUNCTION compliance_service.prevent_audit_log_modification();

-- Encrypted Cardholder Data Vault (PCI DSS Requirement 3)
-- Never store full PAN - use tokenization
CREATE TABLE IF NOT EXISTS compliance_service.payment_tokens (
    id UUID PRIMARY KEY,
    token VARCHAR(100) UNIQUE NOT NULL, -- Token to reference card
    last_four VARCHAR(4) NOT NULL, -- Last 4 digits (allowed by PCI)
    card_brand VARCHAR(20), -- VISA, MASTERCARD, etc.
    expiry_month SMALLINT,
    expiry_year SMALLINT,
    cardholder_name VARCHAR(200),
    encrypted_data TEXT, -- Encrypted PAN (if stored - avoid if possible)
    encryption_key_id VARCHAR(50), -- Reference to encryption key
    iv VARCHAR(32), -- Initialization vector for encryption
    auth_tag VARCHAR(32), -- Authentication tag for AES-GCM
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    expires_at TIMESTAMP, -- Auto-expire tokens after certain period

    -- PCI DSS Requirement: Limit data retention
    CONSTRAINT valid_expiry CHECK (expiry_month BETWEEN 1 AND 12)
);

CREATE INDEX idx_payment_tokens_token ON compliance_service.payment_tokens(token);
CREATE INDEX idx_payment_tokens_expires_at ON compliance_service.payment_tokens(expires_at);

-- Session Management (PCI DSS Requirement 8.2.5)
-- Track active sessions with automatic timeout
CREATE TABLE IF NOT EXISTS compliance_service.user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth_service.users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    terminal_id VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,

    -- Automatic timeout after 15 minutes of inactivity (PCI requirement)
    CONSTRAINT session_timeout CHECK (expires_at > created_at)
);

CREATE INDEX idx_user_sessions_token ON compliance_service.user_sessions(token);
CREATE INDEX idx_user_sessions_user_id ON compliance_service.user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON compliance_service.user_sessions(expires_at);

-- Automatic session cleanup (expired sessions)
CREATE OR REPLACE FUNCTION compliance_service.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE compliance_service.user_sessions
    SET is_active = false
    WHERE expires_at < NOW() AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Failed Login Attempts Tracking (PCI DSS Requirement 8.1.6)
-- Lock account after 6 failed attempts
CREATE TABLE IF NOT EXISTS compliance_service.failed_login_attempts (
    id UUID PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    terminal_id VARCHAR(50),
    attempt_time TIMESTAMP NOT NULL DEFAULT NOW(),
    reason VARCHAR(255)
);

CREATE INDEX idx_failed_login_username ON compliance_service.failed_login_attempts(username);
CREATE INDEX idx_failed_login_time ON compliance_service.failed_login_attempts(attempt_time DESC);

-- Account Lockout Tracking
CREATE TABLE IF NOT EXISTS compliance_service.account_lockouts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth_service.users(id),
    username VARCHAR(100) NOT NULL,
    locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    unlock_at TIMESTAMP, -- Auto-unlock after 30 minutes
    unlocked_by UUID, -- Admin who manually unlocked
    is_locked BOOLEAN DEFAULT true,
    reason TEXT
);

CREATE INDEX idx_account_lockouts_user_id ON compliance_service.account_lockouts(user_id);
CREATE INDEX idx_account_lockouts_unlock_at ON compliance_service.account_lockouts(unlock_at);

-- Password History (PCI DSS Requirement 8.2.5)
-- Prevent reuse of last 4 passwords
CREATE TABLE IF NOT EXISTS compliance_service.password_history (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth_service.users(id),
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_history_user_id ON compliance_service.password_history(user_id, created_at DESC);

-- Encryption Key Audit Trail
CREATE TABLE IF NOT EXISTS compliance_service.encryption_keys (
    id UUID PRIMARY KEY,
    key_id VARCHAR(100) UNIQUE NOT NULL,
    algorithm VARCHAR(50) NOT NULL, -- AES-256, 3DES, etc.
    key_length INT NOT NULL, -- In bits
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth_service.users(id),

    -- Keys stored in HSM/KMS, not in database
    storage_location VARCHAR(255) -- 'HSM', 'AWS_KMS', etc.
);

CREATE INDEX idx_encryption_keys_key_id ON compliance_service.encryption_keys(key_id);
CREATE INDEX idx_encryption_keys_is_active ON compliance_service.encryption_keys(is_active);

-- Data Access Log (track who accessed sensitive data)
CREATE TABLE IF NOT EXISTS compliance_service.data_access_log (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth_service.users(id),
    resource_type VARCHAR(100) NOT NULL, -- 'PAYMENT_TOKEN', 'TRANSACTION', etc.
    resource_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'READ', 'WRITE', 'DELETE'
    ip_address VARCHAR(45),
    accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_data_access_log_user_id ON compliance_service.data_access_log(user_id);
CREATE INDEX idx_data_access_log_resource ON compliance_service.data_access_log(resource_type, resource_id);
CREATE INDEX idx_data_access_log_accessed_at ON compliance_service.data_access_log(accessed_at DESC);

-- PCI Compliance Checklist
CREATE TABLE IF NOT EXISTS compliance_service.pci_compliance_checklist (
    id UUID PRIMARY KEY,
    requirement VARCHAR(100) NOT NULL, -- e.g., 'PCI-3.4', 'PCI-8.2.3'
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('COMPLIANT', 'NON_COMPLIANT', 'IN_PROGRESS', 'NOT_APPLICABLE')),
    evidence TEXT, -- Link to evidence/documentation
    last_verified TIMESTAMP,
    verified_by UUID REFERENCES auth_service.users(id),
    next_review_date DATE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_pci_checklist_requirement ON compliance_service.pci_compliance_checklist(requirement);
CREATE INDEX idx_pci_checklist_status ON compliance_service.pci_compliance_checklist(status);

-- Automatic Data Retention Policy (PCI DSS Requirement 3.1)
-- Delete data older than retention period
CREATE OR REPLACE FUNCTION compliance_service.enforce_data_retention()
RETURNS void AS $$
BEGIN
    -- Delete audit logs older than 1 year
    DELETE FROM compliance_service.audit_logs
    WHERE created_at < NOW() - INTERVAL '1 year';

    -- Delete expired payment tokens
    DELETE FROM compliance_service.payment_tokens
    WHERE expires_at < NOW();

    -- Delete old failed login attempts (keep 90 days)
    DELETE FROM compliance_service.failed_login_attempts
    WHERE attempt_time < NOW() - INTERVAL '90 days';

    -- Delete old password history (keep last 4 per user)
    DELETE FROM compliance_service.password_history
    WHERE id NOT IN (
        SELECT id FROM compliance_service.password_history
        WHERE user_id = password_history.user_id
        ORDER BY created_at DESC
        LIMIT 4
    );
END;
$$ LANGUAGE plpgsql;

-- Insert default PCI requirements checklist
INSERT INTO compliance_service.pci_compliance_checklist (id, requirement, description, status) VALUES
(gen_random_uuid(), 'PCI-3.4', 'Render PAN unreadable anywhere it is stored', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-4.1', 'Use strong cryptography for transmission over open networks', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-8.2.3', 'Passwords must meet minimum length of 7 characters', 'COMPLIANT'),
(gen_random_uuid(), 'PCI-8.2.4', 'Change passwords every 90 days', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-8.2.5', 'Do not allow reuse of last 4 passwords', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-8.1.6', 'Limit repeated access attempts by locking out user after 6 attempts', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-8.1.8', 'If session idle for 15 minutes, require re-authentication', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-10.1', 'Implement audit trails to link all access to cardholder data', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-10.2', 'Implement automated audit trails for all system components', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-10.3', 'Record audit trail entries for all events', 'IN_PROGRESS'),
(gen_random_uuid(), 'PCI-12.3', 'Develop usage policies for critical technologies', 'NOT_APPLICABLE')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE compliance_service.audit_logs IS 'PCI DSS Requirement 10: Tamper-proof audit log';
COMMENT ON TABLE compliance_service.payment_tokens IS 'PCI DSS Requirement 3: Encrypted cardholder data vault';
COMMENT ON TABLE compliance_service.user_sessions IS 'PCI DSS Requirement 8.2.5: Session management with timeout';
COMMENT ON TABLE compliance_service.failed_login_attempts IS 'PCI DSS Requirement 8.1.6: Track failed login attempts';
COMMENT ON TABLE compliance_service.account_lockouts IS 'PCI DSS Requirement 8.1.6: Account lockout after failed attempts';
COMMENT ON TABLE compliance_service.password_history IS 'PCI DSS Requirement 8.2.5: Prevent password reuse';
