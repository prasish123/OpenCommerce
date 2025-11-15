import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { PromotionType } from '../../shared/types';
import { Decimal } from 'decimal.js';

/**
 * Promotion Engine
 * Calculates discounts for all promotion types:
 * - Mix & Match (3 for $14, 2 for $3)
 * - Combo Deals (bundle pricing)
 * - BOGO (Buy One Get One)
 * - Percent Off
 * - Dollar Off
 */

export interface CartItem {
  productId: string;
  barcode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
}

export interface AppliedPromotion {
  promotionId: string;
  promotionType: PromotionType;
  description: string;
  discountAmount: number;
  affectedItems: number[]; // Line item indices
}

export interface PromoResult {
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
  appliedPromotions: AppliedPromotion[];
}

interface Promotion {
  id: string;
  promotionType: PromotionType;
  description: string;
  rules: any;
}

export class PromoEngine {
  /**
   * Calculate all applicable promotions for a cart
   */
  async calculatePromotions(items: CartItem[]): Promise<PromoResult> {
    const originalTotal = items.reduce(
      (sum, item) => sum + item.extendedPrice,
      0
    );

    // Get active promotions
    const promotions = await this.getActivePromotions();

    const appliedPromotions: AppliedPromotion[] = [];
    let totalDiscount = 0;

    // Try each promotion type
    for (const promo of promotions) {
      let discount = 0;
      let affectedItems: number[] = [];

      switch (promo.promotionType) {
        case PromotionType.MIX_MATCH:
          ({ discount, affectedItems } = await this.calculateMixMatch(
            items,
            promo
          ));
          break;

        case PromotionType.COMBO:
          ({ discount, affectedItems } = await this.calculateCombo(
            items,
            promo
          ));
          break;

        case PromotionType.BOGO:
          ({ discount, affectedItems } = await this.calculateBOGO(items, promo));
          break;

        case PromotionType.PERCENT_OFF:
          ({ discount, affectedItems } = this.calculatePercentOff(
            items,
            promo
          ));
          break;

        case PromotionType.DOLLAR_OFF:
          ({ discount, affectedItems } = this.calculateDollarOff(
            items,
            promo
          ));
          break;
      }

      if (discount > 0) {
        appliedPromotions.push({
          promotionId: promo.id,
          promotionType: promo.promotionType,
          description: promo.description,
          discountAmount: discount,
          affectedItems,
        });
        totalDiscount += discount;
      }
    }

    const finalTotal = Math.max(0, originalTotal - totalDiscount);

    log.info('Promotions calculated', {
      originalTotal,
      discountTotal: totalDiscount,
      finalTotal,
      promotionsApplied: appliedPromotions.length,
    });

    return {
      originalTotal,
      discountTotal: totalDiscount,
      finalTotal,
      appliedPromotions,
    };
  }

  /**
   * Get active promotions
   */
  private async getActivePromotions(): Promise<Promotion[]> {
    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().getDay(); // 0 = Sunday

    const dayColumns = [
      'active_sunday',
      'active_monday',
      'active_tuesday',
      'active_wednesday',
      'active_thursday',
      'active_friday',
      'active_saturday',
    ];

    const result = await db.query(
      `SELECT id, promotion_type, description, rules
       FROM product_service.promotions
       WHERE active = true
         AND start_date <= $1
         AND end_date >= $1
         AND ${dayColumns[dayOfWeek]} = true`,
      [today]
    );

    return result.rows;
  }

  /**
   * Calculate Mix & Match discount
   * Example: 3 for $14 (buy 3 qualifying items, pay $14 total)
   */
  private async calculateMixMatch(
    items: CartItem[],
    promo: Promotion
  ): Promise<{ discount: number; affectedItems: number[] }> {
    const { itemListId, requiredQuantity, mixMatchPrice, mixMatchDiscountAmount } =
      promo.rules;

    // Get eligible barcodes for this promo
    const eligibleBarcodes = await this.getItemListBarcodes(itemListId);

    // Find matching items in cart
    const matchingItems: { index: number; item: CartItem }[] = [];
    items.forEach((item, index) => {
      if (eligibleBarcodes.includes(item.barcode)) {
        for (let i = 0; i < item.quantity; i++) {
          matchingItems.push({ index, item });
        }
      }
    });

    // Calculate how many sets qualify
    const sets = Math.floor(matchingItems.length / requiredQuantity);

    if (sets === 0) {
      return { discount: 0, affectedItems: [] };
    }

    let discount = 0;
    const affectedItems = new Set<number>();

    if (mixMatchPrice) {
      // Fixed price for set (e.g., 3 for $14)
      const regularPrice = matchingItems
        .slice(0, sets * requiredQuantity)
        .reduce((sum, { item }) => sum + item.unitPrice, 0);
      discount = regularPrice - mixMatchPrice * sets;
    } else if (mixMatchDiscountAmount) {
      // Fixed discount amount
      discount = mixMatchDiscountAmount * sets;
    }

    matchingItems.slice(0, sets * requiredQuantity).forEach(({ index }) => {
      affectedItems.add(index);
    });

    return { discount, affectedItems: Array.from(affectedItems) };
  }

  /**
   * Calculate Combo discount
   * Example: Buy item A + item B together for special price
   */
  private async calculateCombo(
    items: CartItem[],
    promo: Promotion
  ): Promise<{ discount: number; affectedItems: number[] }> {
    const { combos, comboPrice } = promo.rules;

    // Check if all combo items are in cart
    const comboMatches: { [key: string]: CartItem[] } = {};

    for (const combo of combos) {
      const eligibleBarcodes = await this.getItemListBarcodes(combo.itemListId);
      const matching = items.filter((item) =>
        eligibleBarcodes.includes(item.barcode)
      );

      const totalQty = matching.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      if (totalQty < combo.quantity) {
        // Combo not satisfied
        return { discount: 0, affectedItems: [] };
      }

      comboMatches[combo.itemListId] = matching;
    }

    // Combo is satisfied, calculate discount
    const regularPrice = Object.values(comboMatches)
      .flat()
      .reduce((sum, item) => sum + item.extendedPrice, 0);

    const discount = comboPrice ? regularPrice - comboPrice : 0;
    const affectedItems = items
      .map((_, index) => index)
      .filter((index) =>
        Object.values(comboMatches)
          .flat()
          .some((item) => items[index].barcode === item.barcode)
      );

    return { discount, affectedItems };
  }

  /**
   * Calculate BOGO (Buy One Get One)
   * Examples:
   * - Buy 1 Get 1 Free (buyQuantity=1, getQuantity=1, discountPercent=100)
   * - Buy 2 Get 1 Free (buyQuantity=2, getQuantity=1, discountPercent=100)
   * - Buy 1 Get 1 50% Off (buyQuantity=1, getQuantity=1, discountPercent=50)
   */
  private async calculateBOGO(
    items: CartItem[],
    promo: Promotion
  ): Promise<{ discount: number; affectedItems: number[] }> {
    const {
      itemListId,
      buyQuantity = 1,
      getQuantity = 1,
      discountPercent = 100,
    } = promo.rules;

    // Get eligible barcodes from item list
    const eligibleBarcodes = await this.getItemListBarcodes(itemListId);

    // Find all matching items in cart with their indices
    const matchingItems: Array<{ index: number; item: CartItem }> = [];
    items.forEach((item, index) => {
      if (eligibleBarcodes.includes(item.barcode)) {
        // Add each unit of the item separately for proper BOGO calculation
        for (let i = 0; i < item.quantity; i++) {
          matchingItems.push({ index, item });
        }
      }
    });

    // Need at least buyQuantity + getQuantity items to qualify
    const setSize = buyQuantity + getQuantity;
    if (matchingItems.length < setSize) {
      return { discount: 0, affectedItems: [] };
    }

    // Calculate how many complete sets qualify
    const sets = Math.floor(matchingItems.length / setSize);

    if (sets === 0) {
      return { discount: 0, affectedItems: [] };
    }

    // Sort items by unit price (descending) so we discount the cheapest items
    // This is the typical BOGO behavior - customer pays full price for expensive items
    const sortedItems = [...matchingItems].sort(
      (a, b) => b.item.unitPrice - a.item.unitPrice
    );

    let discount = 0;
    const affectedItems = new Set<number>();

    // For each set, discount the cheapest 'getQuantity' items
    for (let set = 0; set < sets; set++) {
      const setStart = set * setSize;
      const setEnd = setStart + setSize;
      const setItems = sortedItems.slice(setStart, setEnd);

      // Discount the last 'getQuantity' items in each set (the cheapest ones)
      const itemsToDiscount = setItems.slice(-getQuantity);

      itemsToDiscount.forEach(({ index, item }) => {
        const itemDiscount = item.unitPrice * (discountPercent / 100);
        discount += itemDiscount;
        affectedItems.add(index);
      });

      // Mark all items in the set as affected (for display purposes)
      setItems.forEach(({ index }) => {
        affectedItems.add(index);
      });
    }

    return { discount, affectedItems: Array.from(affectedItems) };
  }

  /**
   * Calculate Percent Off
   */
  private calculatePercentOff(
    items: CartItem[],
    promo: Promotion
  ): { discount: number; affectedItems: number[] } {
    const { discountPercent } = promo.rules;

    const totalPrice = items.reduce(
      (sum, item) => sum + item.extendedPrice,
      0
    );
    const discount = totalPrice * (discountPercent / 100);
    const affectedItems = items.map((_, index) => index);

    return { discount, affectedItems };
  }

  /**
   * Calculate Dollar Off
   */
  private calculateDollarOff(
    items: CartItem[],
    promo: Promotion
  ): { discount: number; affectedItems: number[] } {
    const { discountAmount } = promo.rules;

    const affectedItems = items.map((_, index) => index);

    return { discount: discountAmount, affectedItems };
  }

  /**
   * Get barcodes for an item list
   */
  private async getItemListBarcodes(itemListId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT p.barcode
       FROM product_service.item_list_entries ile
       JOIN product_service.products p ON ile.product_id = p.id
       WHERE ile.item_list_id = $1`,
      [itemListId]
    );

    return result.rows.map((row) => row.barcode);
  }
}
