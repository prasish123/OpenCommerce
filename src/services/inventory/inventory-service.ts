import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/event-bus';
import { EventType } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

/**
 * Inventory Service
 * Handles stock tracking, low stock alerts, stock takes, reorder points
 */

export interface InventoryItem {
  id: string;
  productId: string;
  storeId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderPoint: number;
  reorderQuantity: number;
  lastStockTake?: Date;
  lastRestocked?: Date;
  updatedAt: Date;
}

export interface StockMovement {
  id: string;
  productId: string;
  storeId: string;
  movementType: StockMovementType;
  quantity: number;
  fromQuantity: number;
  toQuantity: number;
  reason?: string;
  referenceId?: string;
  userId?: string;
  createdAt: Date;
}

export enum StockMovementType {
  SALE = 'SALE',
  RETURN = 'RETURN',
  RESTOCK = 'RESTOCK',
  ADJUSTMENT = 'ADJUSTMENT',
  DAMAGE = 'DAMAGE',
  THEFT = 'THEFT',
  STOCK_TAKE = 'STOCK_TAKE',
  TRANSFER = 'TRANSFER',
}

export interface LowStockAlert {
  productId: string;
  barcode: string;
  description: string;
  quantityOnHand: number;
  reorderPoint: number;
  reorderQuantity: number;
}

export class InventoryService {
  /**
   * Get inventory for a product
   */
  async getInventory(productId: string, storeId: string): Promise<InventoryItem | null> {
    const result = await db.query(
      `SELECT
        id, product_id as "productId", store_id as "storeId",
        quantity_on_hand as "quantityOnHand",
        quantity_reserved as "quantityReserved",
        (quantity_on_hand - quantity_reserved) as "quantityAvailable",
        reorder_point as "reorderPoint",
        reorder_quantity as "reorderQuantity",
        last_stock_take as "lastStockTake",
        last_restocked as "lastRestocked",
        updated_at as "updatedAt"
      FROM inventory_service.inventory
      WHERE product_id = $1 AND store_id = $2`,
      [productId, storeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Check if product is in stock
   */
  async isInStock(productId: string, quantity: number, storeId: string): Promise<boolean> {
    const inventory = await this.getInventory(productId, storeId);
    if (!inventory) {
      return false;
    }

    return inventory.quantityAvailable >= quantity;
  }

  /**
   * Reserve stock for order
   */
  async reserveStock(
    productId: string,
    quantity: number,
    storeId: string,
    orderId: string
  ): Promise<boolean> {
    try {
      await db.transaction(async (client) => {
        // Get current inventory with row lock
        const inventoryResult = await client.query(
          `SELECT quantity_on_hand, quantity_reserved
           FROM inventory_service.inventory
           WHERE product_id = $1 AND store_id = $2
           FOR UPDATE`,
          [productId, storeId]
        );

        if (inventoryResult.rows.length === 0) {
          throw new Error('Product not in inventory');
        }

        const inventory = inventoryResult.rows[0];
        const available = inventory.quantity_on_hand - inventory.quantity_reserved;

        if (available < quantity) {
          throw new Error('Insufficient stock');
        }

        // Reserve stock
        await client.query(
          `UPDATE inventory_service.inventory
           SET quantity_reserved = quantity_reserved + $1,
               updated_at = NOW()
           WHERE product_id = $2 AND store_id = $3`,
          [quantity, productId, storeId]
        );

        // Record reservation
        await client.query(
          `INSERT INTO inventory_service.stock_reservations (
            id, product_id, store_id, order_id, quantity, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [uuidv4(), productId, storeId, orderId, quantity]
        );
      });

      log.info('Stock reserved', { productId, quantity, storeId, orderId });
      return true;
    } catch (error) {
      log.error('Failed to reserve stock', error);
      return false;
    }
  }

  /**
   * Release reserved stock (order cancelled)
   */
  async releaseReservedStock(orderId: string): Promise<void> {
    await db.transaction(async (client) => {
      // Get reservations
      const reservations = await client.query(
        `SELECT product_id, store_id, quantity
         FROM inventory_service.stock_reservations
         WHERE order_id = $1 AND released = false`,
        [orderId]
      );

      for (const reservation of reservations.rows) {
        // Release stock
        await client.query(
          `UPDATE inventory_service.inventory
           SET quantity_reserved = quantity_reserved - $1,
               updated_at = NOW()
           WHERE product_id = $2 AND store_id = $3`,
          [reservation.quantity, reservation.product_id, reservation.store_id]
        );

        // Mark reservation as released
        await client.query(
          `UPDATE inventory_service.stock_reservations
           SET released = true, released_at = NOW()
           WHERE order_id = $1`,
          [orderId]
        );
      }
    });

    log.info('Reserved stock released', { orderId });
  }

  /**
   * Record stock sale (decrease inventory)
   */
  async recordSale(
    productId: string,
    quantity: number,
    storeId: string,
    transactionId: string,
    userId?: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Get current inventory
      const inventoryResult = await client.query(
        `SELECT id, quantity_on_hand, quantity_reserved
         FROM inventory_service.inventory
         WHERE product_id = $1 AND store_id = $2
         FOR UPDATE`,
        [productId, storeId]
      );

      if (inventoryResult.rows.length === 0) {
        // Initialize inventory if not exists
        await client.query(
          `INSERT INTO inventory_service.inventory (
            id, product_id, store_id, quantity_on_hand, quantity_reserved,
            reorder_point, reorder_quantity, updated_at
          ) VALUES ($1, $2, $3, 0, 0, 5, 50, NOW())`,
          [uuidv4(), productId, storeId]
        );
      }

      const inventory = inventoryResult.rows[0] || { quantity_on_hand: 0, quantity_reserved: 0 };
      const fromQuantity = inventory.quantity_on_hand;
      const toQuantity = fromQuantity - quantity;

      // Decrease stock
      await client.query(
        `UPDATE inventory_service.inventory
         SET quantity_on_hand = quantity_on_hand - $1,
             quantity_reserved = GREATEST(0, quantity_reserved - $1),
             updated_at = NOW()
         WHERE product_id = $2 AND store_id = $3`,
        [quantity, productId, storeId]
      );

      // Record stock movement
      await client.query(
        `INSERT INTO inventory_service.stock_movements (
          id, product_id, store_id, movement_type, quantity,
          from_quantity, to_quantity, reference_id, user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          uuidv4(),
          productId,
          storeId,
          StockMovementType.SALE,
          -quantity,
          fromQuantity,
          toQuantity,
          transactionId,
          userId || null,
        ]
      );

      // Release reservation if exists
      await client.query(
        `UPDATE inventory_service.stock_reservations
         SET released = true, released_at = NOW()
         WHERE order_id = $1 AND product_id = $2`,
        [transactionId, productId]
      );
    });

    // Check for low stock
    await this.checkLowStock(productId, storeId);

    // Publish event
    await eventBus.publish({
      type: EventType.INVENTORY_UPDATED,
      aggregateId: productId,
      data: { productId, quantity: -quantity, storeId, transactionId },
    });

    log.info('Sale recorded in inventory', { productId, quantity, storeId, transactionId });
  }

  /**
   * Restock inventory
   */
  async restock(
    productId: string,
    quantity: number,
    storeId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Get current inventory
      const inventoryResult = await client.query(
        `SELECT quantity_on_hand
         FROM inventory_service.inventory
         WHERE product_id = $1 AND store_id = $2
         FOR UPDATE`,
        [productId, storeId]
      );

      const fromQuantity = inventoryResult.rows[0]?.quantity_on_hand || 0;
      const toQuantity = fromQuantity + quantity;

      // Update inventory
      if (inventoryResult.rows.length === 0) {
        // Initialize if not exists
        await client.query(
          `INSERT INTO inventory_service.inventory (
            id, product_id, store_id, quantity_on_hand, quantity_reserved,
            reorder_point, reorder_quantity, last_restocked, updated_at
          ) VALUES ($1, $2, $3, $4, 0, 5, 50, NOW(), NOW())`,
          [uuidv4(), productId, storeId, quantity]
        );
      } else {
        await client.query(
          `UPDATE inventory_service.inventory
           SET quantity_on_hand = quantity_on_hand + $1,
               last_restocked = NOW(),
               updated_at = NOW()
           WHERE product_id = $2 AND store_id = $3`,
          [quantity, productId, storeId]
        );
      }

      // Record stock movement
      await client.query(
        `INSERT INTO inventory_service.stock_movements (
          id, product_id, store_id, movement_type, quantity,
          from_quantity, to_quantity, reason, user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          uuidv4(),
          productId,
          storeId,
          StockMovementType.RESTOCK,
          quantity,
          fromQuantity,
          toQuantity,
          reason || 'Restock',
          userId,
        ]
      );
    });

    // Publish event
    await eventBus.publish({
      type: EventType.INVENTORY_UPDATED,
      aggregateId: productId,
      data: { productId, quantity, storeId },
    });

    log.info('Inventory restocked', { productId, quantity, storeId, userId });
  }

  /**
   * Adjust inventory (manual correction)
   */
  async adjustInventory(
    productId: string,
    newQuantity: number,
    storeId: string,
    reason: string,
    userId: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Get current inventory
      const inventoryResult = await client.query(
        `SELECT quantity_on_hand
         FROM inventory_service.inventory
         WHERE product_id = $1 AND store_id = $2
         FOR UPDATE`,
        [productId, storeId]
      );

      const fromQuantity = inventoryResult.rows[0]?.quantity_on_hand || 0;
      const adjustment = newQuantity - fromQuantity;

      // Update inventory
      await client.query(
        `UPDATE inventory_service.inventory
         SET quantity_on_hand = $1,
             updated_at = NOW()
         WHERE product_id = $2 AND store_id = $3`,
        [newQuantity, productId, storeId]
      );

      // Record stock movement
      await client.query(
        `INSERT INTO inventory_service.stock_movements (
          id, product_id, store_id, movement_type, quantity,
          from_quantity, to_quantity, reason, user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          uuidv4(),
          productId,
          storeId,
          StockMovementType.ADJUSTMENT,
          adjustment,
          fromQuantity,
          newQuantity,
          reason,
          userId,
        ]
      );
    });

    log.warn('Inventory adjusted', { productId, fromQuantity: 0, newQuantity, reason, userId });
  }

  /**
   * Perform stock take (physical count)
   */
  async performStockTake(
    productId: string,
    countedQuantity: number,
    storeId: string,
    userId: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Get current inventory
      const inventoryResult = await client.query(
        `SELECT quantity_on_hand
         FROM inventory_service.inventory
         WHERE product_id = $1 AND store_id = $2
         FOR UPDATE`,
        [productId, storeId]
      );

      const systemQuantity = inventoryResult.rows[0]?.quantity_on_hand || 0;
      const variance = countedQuantity - systemQuantity;

      // Update inventory
      await client.query(
        `UPDATE inventory_service.inventory
         SET quantity_on_hand = $1,
             last_stock_take = NOW(),
             updated_at = NOW()
         WHERE product_id = $2 AND store_id = $3`,
        [countedQuantity, productId, storeId]
      );

      // Record stock movement
      await client.query(
        `INSERT INTO inventory_service.stock_movements (
          id, product_id, store_id, movement_type, quantity,
          from_quantity, to_quantity, reason, user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          uuidv4(),
          productId,
          storeId,
          StockMovementType.STOCK_TAKE,
          variance,
          systemQuantity,
          countedQuantity,
          `Stock take variance: ${variance}`,
          userId,
        ]
      );
    });

    log.info('Stock take performed', {
      productId,
      systemQuantity: 0,
      countedQuantity,
      userId,
    });
  }

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(storeId: string): Promise<LowStockAlert[]> {
    const result = await db.query(
      `SELECT
        i.product_id as "productId",
        p.barcode,
        p.description,
        i.quantity_on_hand as "quantityOnHand",
        i.reorder_point as "reorderPoint",
        i.reorder_quantity as "reorderQuantity"
      FROM inventory_service.inventory i
      JOIN product_service.products p ON i.product_id = p.id
      WHERE i.store_id = $1
        AND i.quantity_on_hand <= i.reorder_point
      ORDER BY i.quantity_on_hand ASC`,
      [storeId]
    );

    return result.rows;
  }

  /**
   * Check for low stock and alert
   */
  private async checkLowStock(productId: string, storeId: string): Promise<void> {
    const inventory = await this.getInventory(productId, storeId);
    if (!inventory) return;

    if (inventory.quantityOnHand <= inventory.reorderPoint) {
      // Publish low stock event
      await eventBus.publish({
        type: EventType.LOW_STOCK_ALERT,
        aggregateId: productId,
        data: {
          productId,
          storeId,
          quantityOnHand: inventory.quantityOnHand,
          reorderPoint: inventory.reorderPoint,
          reorderQuantity: inventory.reorderQuantity,
        },
      });

      log.warn('Low stock alert', {
        productId,
        storeId,
        quantityOnHand: inventory.quantityOnHand,
        reorderPoint: inventory.reorderPoint,
      });
    }
  }

  /**
   * Get stock movements history
   */
  async getStockMovements(
    productId: string,
    storeId: string,
    limit: number = 50
  ): Promise<StockMovement[]> {
    const result = await db.query(
      `SELECT
        id, product_id as "productId", store_id as "storeId",
        movement_type as "movementType", quantity,
        from_quantity as "fromQuantity", to_quantity as "toQuantity",
        reason, reference_id as "referenceId", user_id as "userId",
        created_at as "createdAt"
      FROM inventory_service.stock_movements
      WHERE product_id = $1 AND store_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
      [productId, storeId, limit]
    );

    return result.rows;
  }

  /**
   * Get inventory summary for all products
   */
  async getInventorySummary(storeId: string): Promise<any> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_products,
        SUM(quantity_on_hand) as total_quantity,
        SUM(CASE WHEN quantity_on_hand <= reorder_point THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN quantity_on_hand = 0 THEN 1 ELSE 0 END) as out_of_stock_count
      FROM inventory_service.inventory
      WHERE store_id = $1`,
      [storeId]
    );

    return result.rows[0];
  }
}

// Singleton instance
export const inventoryService = new InventoryService();
