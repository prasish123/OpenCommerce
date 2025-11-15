import { db } from '../../shared/database';
import { Product, OrderChannel } from '../../shared/types';
import { config } from '../../shared/config';
import { PromoEngine, CartItem } from './promo-engine';

/**
 * Product Service
 * Handles product catalog, pricing, and inventory checks
 */
export class ProductService {
  private promoEngine: PromoEngine;

  constructor() {
    this.promoEngine = new PromoEngine();
  }

  /**
   * Get product by barcode
   */
  async getProductByBarcode(
    barcode: string,
    channel: OrderChannel = OrderChannel.IN_STORE
  ): Promise<Product | null> {
    const result = await db.query(
      `SELECT
        id, barcode, barcode_type as "barcodeType", description,
        base_price as "basePrice", inventory_value_price as "inventoryValuePrice",
        merchandise_code as "merchandiseCode",
        tax_strategy_id as "taxStrategyId", active,
        price_in_store as "priceInStore",
        price_doordash as "priceDoordash",
        price_uber_eats as "priceUberEats",
        price_website as "priceWebsite",
        requires_age_verification as "requiresAgeVerification",
        minimum_age as "minimumAge",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM product_service.products
      WHERE barcode = $1 AND active = true`,
      [barcode]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const product = result.rows[0];

    // Return price for the specific channel
    let channelPrice = product.priceInStore;
    switch (channel) {
      case OrderChannel.DOORDASH:
        channelPrice = product.priceDoordash;
        break;
      case OrderChannel.UBER_EATS:
        channelPrice = product.priceUberEats;
        break;
      case OrderChannel.WEBSITE:
        channelPrice = product.priceWebsite;
        break;
    }

    return {
      ...product,
      basePrice: parseFloat(product.basePrice),
      priceInStore: parseFloat(product.priceInStore),
      priceDoordash: parseFloat(product.priceDoordash),
      priceUberEats: parseFloat(product.priceUberEats),
      priceWebsite: parseFloat(product.priceWebsite),
      channelPrice: parseFloat(channelPrice),
    } as Product & { channelPrice: number };
  }

  /**
   * Search products (semantic search if Ollama enabled, otherwise text search)
   */
  async searchProducts(
    query: string,
    limit: number = 20
  ): Promise<Product[]> {
    // TODO: Implement semantic search with Ollama
    // For now, use PostgreSQL full-text search

    const result = await db.query(
      `SELECT
        id, barcode, barcode_type as "barcodeType", description,
        base_price as "basePrice", active,
        price_in_store as "priceInStore",
        requires_age_verification as "requiresAgeVerification"
      FROM product_service.products
      WHERE active = true
        AND (search_vector @@ plainto_tsquery('english', $1)
             OR barcode ILIKE $2
             OR description ILIKE $2)
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
      LIMIT $3`,
      [query, `%${query}%`, limit]
    );

    return result.rows.map((row) => ({
      ...row,
      basePrice: parseFloat(row.basePrice),
      priceInStore: parseFloat(row.priceInStore),
    })) as Product[];
  }

  /**
   * Check inventory availability
   */
  async checkInventory(
    productId: string,
    quantity: number,
    storeId: string = config.store.id
  ): Promise<boolean> {
    const result = await db.query(
      `SELECT quantity_available
       FROM inventory_service.inventory
       WHERE product_id = $1 AND store_id = $2`,
      [productId, storeId]
    );

    if (result.rows.length === 0) {
      // Product not in inventory, assume available (or could default to false)
      return true;
    }

    const available = parseFloat(result.rows[0].quantity_available);
    return available >= quantity;
  }

  /**
   * Calculate promotions for cart items
   */
  async calculatePromotions(items: CartItem[]) {
    return await this.promoEngine.calculatePromotions(items);
  }

  /**
   * Get all products for channel menu sync
   */
  async getAllProducts(channel: OrderChannel): Promise<Product[]> {
    const result = await db.query(
      `SELECT
        id, barcode, description,
        CASE
          WHEN $1 = 'DOORDASH' THEN price_doordash
          WHEN $1 = 'UBER_EATS' THEN price_uber_eats
          WHEN $1 = 'WEBSITE' THEN price_website
          ELSE price_in_store
        END as price,
        requires_age_verification as "requiresAgeVerification",
        merchandise_code as "merchandiseCode"
      FROM product_service.products
      WHERE active = true
      ORDER BY description`,
      [channel]
    );

    return result.rows.map((row) => ({
      ...row,
      price: parseFloat(row.price),
    })) as Product[];
  }
}
