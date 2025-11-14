-- =============================================
-- Loyalty Service Tables
-- Member management, points tracking, rewards
-- =============================================

CREATE TYPE loyalty_tier AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
CREATE TYPE reward_type AS ENUM ('DOLLAR_OFF', 'PERCENT_OFF', 'FREE_PRODUCT', 'BONUS_POINTS');
CREATE TYPE points_transaction_type AS ENUM ('EARNED', 'REDEEMED', 'EXPIRED', 'ADJUSTED', 'BONUS');

-- Loyalty members
CREATE TABLE IF NOT EXISTS loyalty_service.members (
    id UUID PRIMARY KEY,
    member_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(20) NOT NULL,
    points_balance INT NOT NULL DEFAULT 0,
    lifetime_points INT NOT NULL DEFAULT 0,
    tier loyalty_tier NOT NULL DEFAULT 'BRONZE',
    joined_date DATE NOT NULL,
    last_visit TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,

    CONSTRAINT positive_points_balance CHECK (points_balance >= 0)
);

CREATE INDEX idx_loyalty_members_phone ON loyalty_service.members(phone);
CREATE INDEX idx_loyalty_members_number ON loyalty_service.members(member_number);
CREATE INDEX idx_loyalty_members_email ON loyalty_service.members(email);
CREATE INDEX idx_loyalty_members_tier ON loyalty_service.members(tier);
CREATE INDEX idx_loyalty_members_active ON loyalty_service.members(is_active) WHERE is_active = true;

-- Points transactions (audit trail)
CREATE TABLE IF NOT EXISTS loyalty_service.points_transactions (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES loyalty_service.members(id) ON DELETE CASCADE,
    transaction_type points_transaction_type NOT NULL,
    points INT NOT NULL, -- Positive for earn, negative for redeem
    order_id UUID, -- Reference to order_service.retail_transactions
    reward_id UUID, -- Reference to redeemed reward
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_points_txn_member ON loyalty_service.points_transactions(member_id, created_at DESC);
CREATE INDEX idx_points_txn_order ON loyalty_service.points_transactions(order_id);
CREATE INDEX idx_points_txn_type ON loyalty_service.points_transactions(transaction_type);

-- Rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_service.rewards (
    id UUID PRIMARY KEY,
    reward_name VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    points_cost INT NOT NULL,
    reward_type reward_type NOT NULL,
    reward_value DECIMAL(10, 2) NOT NULL, -- Dollar amount or percent (0.1 = 10%)
    product_id UUID, -- If reward is free product
    is_active BOOLEAN DEFAULT true,
    valid_from DATE,
    valid_until DATE,
    max_redemptions INT, -- NULL = unlimited
    current_redemptions INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT positive_points_cost CHECK (points_cost > 0),
    CONSTRAINT positive_reward_value CHECK (reward_value > 0)
);

CREATE INDEX idx_rewards_active ON loyalty_service.rewards(is_active) WHERE is_active = true;
CREATE INDEX idx_rewards_points_cost ON loyalty_service.rewards(points_cost);

-- Redemption history
CREATE TABLE IF NOT EXISTS loyalty_service.redemptions (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES loyalty_service.members(id),
    reward_id UUID NOT NULL REFERENCES loyalty_service.rewards(id),
    order_id UUID, -- Order where reward was applied
    points_redeemed INT NOT NULL,
    discount_amount DECIMAL(10, 2),
    redeemed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_redemptions_member ON loyalty_service.redemptions(member_id, redeemed_at DESC);
CREATE INDEX idx_redemptions_reward ON loyalty_service.redemptions(reward_id);
CREATE INDEX idx_redemptions_order ON loyalty_service.redemptions(order_id);

-- Tier benefits configuration
CREATE TABLE IF NOT EXISTS loyalty_service.tier_benefits (
    id SERIAL PRIMARY KEY,
    tier loyalty_tier NOT NULL,
    benefit_name VARCHAR(200) NOT NULL,
    benefit_description TEXT,
    points_multiplier DECIMAL(3, 2) DEFAULT 1.0, -- 1.0 = normal, 1.5 = 50% bonus
    discount_percentage DECIMAL(5, 4) DEFAULT 0.0, -- 0.05 = 5% discount
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_tier_benefits_tier ON loyalty_service.tier_benefits(tier);

-- Insert default tier benefits
INSERT INTO loyalty_service.tier_benefits (tier, benefit_name, benefit_description, points_multiplier, discount_percentage) VALUES
('BRONZE', 'Standard Benefits', 'Earn 10 points per dollar', 1.0, 0.0),
('SILVER', 'Silver Benefits', 'Earn 12 points per dollar + 5% discount', 1.2, 0.05),
('GOLD', 'Gold Benefits', 'Earn 15 points per dollar + 10% discount', 1.5, 0.10),
('PLATINUM', 'Platinum Benefits', 'Earn 20 points per dollar + 15% discount', 2.0, 0.15)
ON CONFLICT DO NOTHING;

-- Points expiration tracking
CREATE TABLE IF NOT EXISTS loyalty_service.points_expiration (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES loyalty_service.members(id),
    points INT NOT NULL,
    earned_date DATE NOT NULL,
    expires_date DATE NOT NULL,
    is_expired BOOLEAN DEFAULT false
);

CREATE INDEX idx_points_expiration_member ON loyalty_service.points_expiration(member_id);
CREATE INDEX idx_points_expiration_date ON loyalty_service.points_expiration(expires_date);

-- Function to expire old points (call nightly)
CREATE OR REPLACE FUNCTION loyalty_service.expire_old_points()
RETURNS void AS $$
BEGIN
    -- Mark points as expired
    UPDATE loyalty_service.points_expiration
    SET is_expired = true
    WHERE expires_date < CURRENT_DATE AND is_expired = false;

    -- Deduct expired points from member balances
    UPDATE loyalty_service.members m
    SET points_balance = points_balance - (
        SELECT COALESCE(SUM(points), 0)
        FROM loyalty_service.points_expiration
        WHERE member_id = m.id
          AND expires_date < CURRENT_DATE
          AND is_expired = true
    )
    WHERE id IN (
        SELECT DISTINCT member_id
        FROM loyalty_service.points_expiration
        WHERE expires_date < CURRENT_DATE
          AND is_expired = true
    );

    -- Record expiration transactions
    INSERT INTO loyalty_service.points_transactions (id, member_id, transaction_type, points, created_at)
    SELECT
        gen_random_uuid(),
        member_id,
        'EXPIRED',
        -points,
        NOW()
    FROM loyalty_service.points_expiration
    WHERE expires_date < CURRENT_DATE
      AND is_expired = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE loyalty_service.members IS 'Loyalty program members with points and tier';
COMMENT ON TABLE loyalty_service.points_transactions IS 'Complete audit trail of all points activity';
COMMENT ON TABLE loyalty_service.rewards IS 'Rewards catalog (redemption options)';
COMMENT ON TABLE loyalty_service.redemptions IS 'History of reward redemptions';
COMMENT ON TABLE loyalty_service.tier_benefits IS 'Benefits per loyalty tier';
