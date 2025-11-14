import { log } from '../../shared/logger';
import { ProductService } from '../product/product-service';
import { OrderChannel } from '../../shared/types';
import { CartItem, PromoResult } from '../product/promo-engine';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../shared/config';
import Decimal from 'decimal.js';

/**
 * POS Cart Service
 * Handles in-store shopping cart: scan items, calculate totals, apply promotions
 */

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  promoResult?: PromoResult;
  requiresAgeVerification: boolean;
}

export class CartService {
  private productService: ProductService;
  private carts: Map<string, Cart> = new Map(); // In-memory cart storage

  constructor() {
    this.productService = new ProductService();
  }

  /**
   * Create new cart (start transaction)
   */
  createCart(): string {
    const cartId = uuidv4();
    this.carts.set(cartId, {
      id: cartId,
      items: [],
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      requiresAgeVerification: false,
    });

    log.info('Cart created', { cartId });
    return cartId;
  }

  /**
   * Add item to cart by barcode (simulates barcode scan)
   */
  async addItemByBarcode(
    cartId: string,
    barcode: string,
    quantity: number = 1
  ): Promise<Cart> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    // Lookup product
    const product = await this.productService.getProductByBarcode(
      barcode,
      OrderChannel.IN_STORE
    );

    if (!product) {
      throw new Error(`Product not found: ${barcode}`);
    }

    // Check if item already in cart
    const existingItem = cart.items.find(
      (item) => item.barcode === barcode
    );

    if (existingItem) {
      // Increase quantity
      existingItem.quantity += quantity;
      existingItem.extendedPrice = new Decimal(existingItem.quantity)
        .times(existingItem.unitPrice)
        .toNumber();
    } else {
      // Add new item
      const cartItem: CartItem = {
        productId: product.id,
        barcode: product.barcode,
        description: product.description,
        quantity,
        unitPrice: (product as any).channelPrice || product.priceInStore,
        extendedPrice: new Decimal(quantity)
          .times((product as any).channelPrice || product.priceInStore)
          .toNumber(),
      };

      cart.items.push(cartItem);
    }

    // Mark if age verification required
    if (product.requiresAgeVerification) {
      cart.requiresAgeVerification = true;
    }

    // Recalculate totals
    await this.recalculateCart(cartId);

    log.info('Item added to cart', {
      cartId,
      barcode,
      quantity,
      description: product.description,
    });

    return this.carts.get(cartId)!;
  }

  /**
   * Remove item from cart
   */
  async removeItem(cartId: string, barcode: string): Promise<Cart> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    cart.items = cart.items.filter((item) => item.barcode !== barcode);

    // Recalculate age verification requirement
    cart.requiresAgeVerification = false;
    for (const item of cart.items) {
      const product = await this.productService.getProductByBarcode(
        item.barcode,
        OrderChannel.IN_STORE
      );
      if (product?.requiresAgeVerification) {
        cart.requiresAgeVerification = true;
        break;
      }
    }

    await this.recalculateCart(cartId);

    log.info('Item removed from cart', { cartId, barcode });
    return this.carts.get(cartId)!;
  }

  /**
   * Update item quantity
   */
  async updateQuantity(
    cartId: string,
    barcode: string,
    quantity: number
  ): Promise<Cart> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    if (quantity <= 0) {
      return this.removeItem(cartId, barcode);
    }

    const item = cart.items.find((item) => item.barcode === barcode);
    if (!item) {
      throw new Error('Item not found in cart');
    }

    item.quantity = quantity;
    item.extendedPrice = new Decimal(quantity)
      .times(item.unitPrice)
      .toNumber();

    await this.recalculateCart(cartId);

    log.info('Item quantity updated', { cartId, barcode, quantity });
    return this.carts.get(cartId)!;
  }

  /**
   * Recalculate cart totals (subtotal, promotions, tax, total)
   */
  private async recalculateCart(cartId: string): Promise<void> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    // Calculate subtotal
    cart.subtotal = cart.items.reduce(
      (sum, item) => new Decimal(sum).plus(item.extendedPrice).toNumber(),
      0
    );

    // Apply promotions
    if (cart.items.length > 0) {
      cart.promoResult = await this.productService.calculatePromotions(
        cart.items
      );
    } else {
      cart.promoResult = {
        originalTotal: 0,
        discountTotal: 0,
        finalTotal: 0,
        appliedPromotions: [],
      };
    }

    // Calculate tax (Florida sales tax: 7% for Ocala)
    // Tax is applied AFTER promotions
    const taxableAmount = cart.promoResult.finalTotal;
    cart.taxAmount = new Decimal(taxableAmount)
      .times(config.tax.salesTaxRate)
      .toDecimalPlaces(2)
      .toNumber();

    // Calculate total
    cart.totalAmount = new Decimal(cart.promoResult.finalTotal)
      .plus(cart.taxAmount)
      .toDecimalPlaces(2)
      .toNumber();
  }

  /**
   * Get cart
   */
  getCart(cartId: string): Cart | null {
    return this.carts.get(cartId) || null;
  }

  /**
   * Clear cart (after payment or void)
   */
  clearCart(cartId: string): void {
    this.carts.delete(cartId);
    log.info('Cart cleared', { cartId });
  }

  /**
   * Get all active carts (for multi-terminal support)
   */
  getAllCarts(): Cart[] {
    return Array.from(this.carts.values());
  }

  /**
   * Void entire transaction (manager override)
   */
  async voidCart(cartId: string, reason: string, managerId: string): Promise<void> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    log.warn('Cart voided', {
      cartId,
      reason,
      managerId,
      itemCount: cart.items.length,
      total: cart.totalAmount,
    });

    this.clearCart(cartId);
  }

  /**
   * Apply manual discount (manager override)
   */
  async applyManualDiscount(
    cartId: string,
    amount: number,
    reason: string,
    managerId: string
  ): Promise<Cart> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    // Add manual discount as negative line item (ARTS standard)
    cart.items.push({
      productId: 'MANUAL_DISCOUNT',
      barcode: 'DISCOUNT',
      description: `Manual Discount - ${reason}`,
      quantity: 1,
      unitPrice: -amount,
      extendedPrice: -amount,
    });

    await this.recalculateCart(cartId);

    log.info('Manual discount applied', {
      cartId,
      amount,
      reason,
      managerId,
    });

    return this.carts.get(cartId)!;
  }

  /**
   * Price override (manager function)
   */
  async overridePrice(
    cartId: string,
    barcode: string,
    newPrice: number,
    reason: string,
    managerId: string
  ): Promise<Cart> {
    const cart = this.carts.get(cartId);
    if (!cart) {
      throw new Error('Cart not found');
    }

    const item = cart.items.find((item) => item.barcode === barcode);
    if (!item) {
      throw new Error('Item not found in cart');
    }

    const oldPrice = item.unitPrice;
    item.unitPrice = newPrice;
    item.extendedPrice = new Decimal(item.quantity)
      .times(newPrice)
      .toNumber();

    await this.recalculateCart(cartId);

    log.warn('Price override', {
      cartId,
      barcode,
      oldPrice,
      newPrice,
      reason,
      managerId,
    });

    return this.carts.get(cartId)!;
  }
}
