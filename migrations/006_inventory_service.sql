-- =============================================
-- Inventory Service Tables
-- Stock tracking, reservations, movements
-- =============================================

-- Inventory table (current stock levels)
CREATE TABLE IF NOT EXISTS inventory_service.inventory (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES product_service.products(id),
    store_id VARCHAR(50) NOT NULL,
    quantity_on_hand INT NOT NULL DEFAULT 0,
    quantity_reserved INT NOT NULL DEFAULT 0,
    reorder_point INT NOT NULL DEFAULT 5,
    reorder_quantity INT NOT NULL DEFAULT 50,
    last_stock_take TIMESTAMP,
    last_restocked TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Ensure non-negative quantities
    CONSTRAINT positive_quantity_on_hand CHECK (quantity_on_hand >= 0),
    CONSTRAINT positive_quantity_reserved CHECK (quantity_reserved >= 0),
    CONSTRAINT reserved_not_more_than_on_hand CHECK (quantity_reserved <= quantity_on_hand),

    -- Unique per product per store
    UNIQUE(product_id, store_id)
);

CREATE INDEX idx_inventory_product_store ON inventory_service.inventory(product_id, store_id);
CREATE INDEX idx_inventory_low_stock ON inventory_service.inventory(store_id) WHERE quantity_on_hand <= reorder_point;

-- Stock reservations (for pending orders)
CREATE TABLE IF NOT EXISTS inventory_service.stock_reservations (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES product_service.products(id),
    store_id VARCHAR(50) NOT NULL,
    order_id UUID NOT NULL,
    quantity INT NOT NULL,
    released BOOLEAN DEFAULT false,
    released_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_reservations_order ON inventory_service.stock_reservations(order_id);
CREATE INDEX idx_stock_reservations_product ON inventory_service.stock_reservations(product_id, store_id);
CREATE INDEX idx_stock_reservations_unreleased ON inventory_service.stock_reservations(order_id) WHERE released = false;

-- Stock movements (audit trail of all inventory changes)
CREATE TYPE stock_movement_type AS ENUM (
    'SALE',
    'RETURN',
    'RESTOCK',
    'ADJUSTMENT',
    'DAMAGE',
    'THEFT',
    'STOCK_TAKE',
    'TRANSFER'
);

CREATE TABLE IF NOT EXISTS inventory_service.stock_movements (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES product_service.products(id),
    store_id VARCHAR(50) NOT NULL,
    movement_type stock_movement_type NOT NULL,
    quantity INT NOT NULL, -- Positive for increase, negative for decrease
    from_quantity INT NOT NULL,
    to_quantity INT NOT NULL,
    reason TEXT,
    reference_id UUID, -- Transaction ID, PO number, etc.
    user_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON inventory_service.stock_movements(product_id, store_id);
CREATE INDEX idx_stock_movements_created_at ON inventory_service.stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_type ON inventory_service.stock_movements(movement_type);
CREATE INDEX idx_stock_movements_reference ON inventory_service.stock_movements(reference_id);

-- Low stock alerts log
CREATE TABLE IF NOT EXISTS inventory_service.low_stock_alerts (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES product_service.products(id),
    store_id VARCHAR(50) NOT NULL,
    quantity_on_hand INT NOT NULL,
    reorder_point INT NOT NULL,
    reorder_quantity INT NOT NULL,
    alerted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP,
    acknowledged_by UUID
);

CREATE INDEX idx_low_stock_alerts_product ON inventory_service.low_stock_alerts(product_id, store_id);
CREATE INDEX idx_low_stock_alerts_unacknowledged ON inventory_service.low_stock_alerts(store_id) WHERE acknowledged = false;

-- Stock takes (physical inventory counts)
CREATE TABLE IF NOT EXISTS inventory_service.stock_takes (
    id UUID PRIMARY KEY,
    store_id VARCHAR(50) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_by UUID NOT NULL,
    completed_at TIMESTAMP,
    completed_by UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    notes TEXT
);

CREATE INDEX idx_stock_takes_store ON inventory_service.stock_takes(store_id);
CREATE INDEX idx_stock_takes_status ON inventory_service.stock_takes(status);

-- Stock take details (counts per product)
CREATE TABLE IF NOT EXISTS inventory_service.stock_take_details (
    id UUID PRIMARY KEY,
    stock_take_id UUID NOT NULL REFERENCES inventory_service.stock_takes(id),
    product_id UUID NOT NULL REFERENCES product_service.products(id),
    system_quantity INT NOT NULL,
    counted_quantity INT NOT NULL,
    variance INT NOT NULL,
    counted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    counted_by UUID NOT NULL
);

CREATE INDEX idx_stock_take_details_stock_take ON inventory_service.stock_take_details(stock_take_id);
CREATE INDEX idx_stock_take_details_product ON inventory_service.stock_take_details(product_id);

-- Triggers
-- Automatically create low stock alert when inventory drops below reorder point
CREATE OR REPLACE FUNCTION inventory_service.check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity_on_hand <= NEW.reorder_point THEN
        INSERT INTO inventory_service.low_stock_alerts (
            id, product_id, store_id, quantity_on_hand, reorder_point, reorder_quantity, alerted_at
        ) VALUES (
            gen_random_uuid(), NEW.product_id, NEW.store_id, NEW.quantity_on_hand, NEW.reorder_point, NEW.reorder_quantity, NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_low_stock
    AFTER UPDATE OF quantity_on_hand ON inventory_service.inventory
    FOR EACH ROW
    WHEN (NEW.quantity_on_hand <= NEW.reorder_point)
    EXECUTE FUNCTION inventory_service.check_low_stock();

COMMENT ON TABLE inventory_service.inventory IS 'Current stock levels per product per store';
COMMENT ON TABLE inventory_service.stock_reservations IS 'Reserved stock for pending orders';
COMMENT ON TABLE inventory_service.stock_movements IS 'Audit trail of all inventory changes';
COMMENT ON TABLE inventory_service.low_stock_alerts IS 'Low stock alerts for reordering';
COMMENT ON TABLE inventory_service.stock_takes IS 'Physical inventory counts';
