-- =============================================
-- Notification Service Tables
-- SMS, email, push notifications
-- =============================================

-- Notifications log
CREATE TABLE IF NOT EXISTS notification_service.notifications (
    id UUID PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('EMAIL', 'SMS', 'PUSH')),
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('RECEIPT', 'ORDER_READY', 'ORDER_CANCELLED', 'MARKETING', 'LOW_STOCK_ALERT', 'SECURITY_ALERT', 'LOYALTY_REWARD')),
    recipient VARCHAR(200) NOT NULL, -- Email or phone number
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SENT', 'FAILED', 'PENDING')),
    message_id VARCHAR(200), -- External message ID (Twilio SID, email message ID)
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notification_service.notifications(recipient);
CREATE INDEX idx_notifications_type ON notification_service.notifications(type);
CREATE INDEX idx_notifications_channel ON notification_service.notifications(channel);
CREATE INDEX idx_notifications_status ON notification_service.notifications(status);
CREATE INDEX idx_notifications_created_at ON notification_service.notifications(created_at DESC);

-- Notification templates
CREATE TABLE IF NOT EXISTS notification_service.templates (
    id UUID PRIMARY KEY,
    template_name VARCHAR(100) UNIQUE NOT NULL,
    channel VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL,
    subject VARCHAR(200), -- For email
    body_template TEXT NOT NULL, -- Supports {{variable}} placeholders
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_templates_channel ON notification_service.templates(channel);
CREATE INDEX idx_templates_type ON notification_service.templates(type);

-- Scheduled notifications (for marketing campaigns)
CREATE TABLE IF NOT EXISTS notification_service.scheduled_notifications (
    id UUID PRIMARY KEY,
    template_id UUID REFERENCES notification_service.templates(id),
    schedule_time TIMESTAMP NOT NULL,
    recipient_query TEXT, -- SQL query to get recipients
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_scheduled_notifications_schedule ON notification_service.scheduled_notifications(schedule_time) WHERE status = 'PENDING';
CREATE INDEX idx_scheduled_notifications_status ON notification_service.scheduled_notifications(status);

-- Notification preferences (customer opt-in/opt-out)
CREATE TABLE IF NOT EXISTS notification_service.preferences (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES customer_service.customers(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT true,
    marketing_emails BOOLEAN DEFAULT true,
    marketing_sms BOOLEAN DEFAULT false,
    order_updates BOOLEAN DEFAULT true,
    loyalty_updates BOOLEAN DEFAULT true,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(customer_id)
);

CREATE INDEX idx_preferences_customer ON notification_service.preferences(customer_id);

-- Insert default notification templates
INSERT INTO notification_service.templates (id, template_name, channel, type, subject, body_template, is_active) VALUES
(gen_random_uuid(), 'receipt_email', 'RECEIPT', 'EMAIL', 'Your Receipt from {{store_name}}', 'Thank you for your purchase! Total: ${{total}}', true),
(gen_random_uuid(), 'receipt_sms', 'RECEIPT', 'SMS', NULL, 'Thanks for shopping at {{store_name}}! Total: ${{total}}', true),
(gen_random_uuid(), 'order_ready_sms', 'ORDER_READY', 'SMS', NULL, 'Your order #{{order_number}} is ready for pickup at {{store_name}}!', true),
(gen_random_uuid(), 'loyalty_points_sms', 'LOYALTY_REWARD', 'SMS', NULL, 'You earned {{points}} points! Balance: {{balance}} points. Thanks for your loyalty!', true)
ON CONFLICT (template_name) DO NOTHING;

COMMENT ON TABLE notification_service.notifications IS 'Notification delivery log (SMS, email, push)';
COMMENT ON TABLE notification_service.templates IS 'Notification message templates';
COMMENT ON TABLE notification_service.scheduled_notifications IS 'Scheduled marketing campaigns';
COMMENT ON TABLE notification_service.preferences IS 'Customer notification preferences';
