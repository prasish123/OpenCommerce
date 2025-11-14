import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tax Service
 * Advanced tax calculation with jurisdiction-based rules
 * Supports multiple tax types: sales tax, excise tax, bottle deposit, etc.
 */

export enum TaxType {
  SALES_TAX = 'SALES_TAX', // General sales tax
  EXCISE_TAX = 'EXCISE_TAX', // Alcohol excise tax (per unit or percentage)
  BOTTLE_DEPOSIT = 'BOTTLE_DEPOSIT', // Bottle/can deposit fees
  LOCAL_TAX = 'LOCAL_TAX', // City/county specific tax
  ENVIRONMENTAL_FEE = 'ENVIRONMENTAL_FEE', // Environmental fees
}

export enum TaxCalculationMethod {
  PERCENTAGE = 'PERCENTAGE', // Tax as % of price
  FIXED_AMOUNT = 'FIXED_AMOUNT', // Fixed amount per unit
  TIERED = 'TIERED', // Different rates based on price tiers
}

export interface TaxRule {
  id: string;
  jurisdiction: string; // State, county, city (e.g., "CA", "CA-LOS-ANGELES", "CA-90001")
  taxType: TaxType;
  rate: number; // Percentage (7.5) or fixed amount (0.10)
  calculationMethod: TaxCalculationMethod;
  productCategory?: string; // ALCOHOL, BEER, WINE, SPIRITS, TOBACCO, GENERAL
  minPrice?: number; // For tiered pricing
  maxPrice?: number;
  isActive: boolean;
  effectiveDate: Date;
  expirationDate?: Date;
}

export interface TaxBreakdown {
  taxType: TaxType;
  description: string;
  rate: number;
  calculationMethod: TaxCalculationMethod;
  baseAmount: number;
  taxAmount: number;
}

export interface TaxCalculationResult {
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  breakdown: TaxBreakdown[];
}

export interface LineItemTax {
  productId: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  category: string;
  taxAmount: number;
  breakdown: TaxBreakdown[];
}

export class TaxService {
  /**
   * Calculate tax for entire transaction
   */
  async calculateTransactionTax(
    lineItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      category: string;
    }>,
    storeId: string,
    zipCode?: string
  ): Promise<TaxCalculationResult> {
    try {
      // Get jurisdiction for store
      const jurisdiction = await this.getJurisdiction(storeId, zipCode);

      // Get applicable tax rules
      const taxRules = await this.getTaxRules(jurisdiction);

      // Calculate tax for each line item
      const lineItemTaxes: LineItemTax[] = [];
      let subtotal = 0;
      let totalTax = 0;

      for (const item of lineItems) {
        const extendedPrice = item.unitPrice * item.quantity;
        subtotal += extendedPrice;

        const itemTax = await this.calculateLineItemTax(
          item.productId,
          item.quantity,
          item.unitPrice,
          item.category,
          taxRules
        );

        totalTax += itemTax.taxAmount;
        lineItemTaxes.push(itemTax);
      }

      // Aggregate breakdown by tax type
      const aggregatedBreakdown = this.aggregateTaxBreakdown(lineItemTaxes);

      return {
        subtotal,
        totalTax,
        totalAmount: subtotal + totalTax,
        breakdown: aggregatedBreakdown,
      };
    } catch (error: any) {
      log.error('Failed to calculate transaction tax', {
        storeId,
        error: error.message,
      });
      // Fallback to default tax rate
      return this.calculateFallbackTax(lineItems);
    }
  }

  /**
   * Calculate tax for single line item
   */
  async calculateLineItemTax(
    productId: string,
    quantity: number,
    unitPrice: number,
    category: string,
    taxRules: TaxRule[]
  ): Promise<LineItemTax> {
    const extendedPrice = unitPrice * quantity;
    const breakdown: TaxBreakdown[] = [];
    let totalTaxAmount = 0;

    // Apply each applicable tax rule
    for (const rule of taxRules) {
      // Skip if rule doesn't apply to this product category
      if (rule.productCategory && rule.productCategory !== category) {
        continue;
      }

      // Skip if price is outside tiered range
      if (rule.minPrice !== undefined && unitPrice < rule.minPrice) {
        continue;
      }
      if (rule.maxPrice !== undefined && unitPrice > rule.maxPrice) {
        continue;
      }

      // Calculate tax based on method
      let taxAmount = 0;
      let baseAmount = extendedPrice;

      switch (rule.calculationMethod) {
        case TaxCalculationMethod.PERCENTAGE:
          taxAmount = (extendedPrice * rule.rate) / 100;
          break;

        case TaxCalculationMethod.FIXED_AMOUNT:
          taxAmount = rule.rate * quantity;
          baseAmount = quantity;
          break;

        case TaxCalculationMethod.TIERED:
          // Tiered calculation (different rates for different price ranges)
          taxAmount = this.calculateTieredTax(unitPrice, quantity, rule);
          break;
      }

      totalTaxAmount += taxAmount;

      breakdown.push({
        taxType: rule.taxType,
        description: this.getTaxDescription(rule),
        rate: rule.rate,
        calculationMethod: rule.calculationMethod,
        baseAmount,
        taxAmount,
      });
    }

    return {
      productId,
      quantity,
      unitPrice,
      extendedPrice,
      category,
      taxAmount: totalTaxAmount,
      breakdown,
    };
  }

  /**
   * Get jurisdiction (state, county, city) for tax calculation
   */
  private async getJurisdiction(storeId: string, zipCode?: string): Promise<string> {
    try {
      // Get store location from database
      const result = await db.query(
        `SELECT state, county, city, zip_code FROM store_locations WHERE store_id = $1`,
        [storeId]
      );

      if (result.rows.length === 0) {
        log.warn('Store location not found, using default jurisdiction', { storeId });
        return 'CA'; // Default to California
      }

      const location = result.rows[0];
      const state = location.state || 'CA';
      const county = location.county;
      const city = location.city;
      const zip = zipCode || location.zip_code;

      // Build jurisdiction string (most specific to least specific)
      // Format: STATE-COUNTY-CITY or STATE-ZIPCODE
      if (zip) {
        return `${state}-${zip}`;
      } else if (county && city) {
        return `${state}-${county.toUpperCase().replace(/\s/g, '-')}-${city.toUpperCase().replace(/\s/g, '-')}`;
      } else if (county) {
        return `${state}-${county.toUpperCase().replace(/\s/g, '-')}`;
      } else {
        return state;
      }
    } catch (error: any) {
      log.error('Failed to get jurisdiction', { storeId, error: error.message });
      return 'CA'; // Default fallback
    }
  }

  /**
   * Get applicable tax rules for jurisdiction
   */
  private async getTaxRules(jurisdiction: string): Promise<TaxRule[]> {
    try {
      // Get all tax rules that apply to this jurisdiction
      // Match exact jurisdiction or parent jurisdictions (e.g., CA-90001 matches CA)
      const jurisdictionParts = jurisdiction.split('-');
      const jurisdictions = [jurisdiction];

      // Add parent jurisdictions
      for (let i = jurisdictionParts.length - 1; i > 0; i--) {
        jurisdictions.push(jurisdictionParts.slice(0, i).join('-'));
      }

      const result = await db.query(
        `SELECT
          id, jurisdiction, tax_type as "taxType", rate,
          calculation_method as "calculationMethod",
          product_category as "productCategory",
          min_price as "minPrice", max_price as "maxPrice",
          is_active as "isActive",
          effective_date as "effectiveDate",
          expiration_date as "expirationDate"
        FROM tax_service.tax_rules
        WHERE jurisdiction = ANY($1)
          AND is_active = true
          AND effective_date <= NOW()
          AND (expiration_date IS NULL OR expiration_date > NOW())
        ORDER BY jurisdiction DESC, tax_type`,
        [jurisdictions]
      );

      return result.rows;
    } catch (error: any) {
      log.error('Failed to get tax rules', { jurisdiction, error: error.message });
      return [];
    }
  }

  /**
   * Calculate tiered tax (different rates for different price ranges)
   */
  private calculateTieredTax(unitPrice: number, quantity: number, rule: TaxRule): number {
    // Simplified tiered calculation
    // In production, you'd load tier definitions from database
    const extendedPrice = unitPrice * quantity;
    return (extendedPrice * rule.rate) / 100;
  }

  /**
   * Get human-readable tax description
   */
  private getTaxDescription(rule: TaxRule): string {
    const jurisdictionName = rule.jurisdiction.replace(/-/g, ' ');

    switch (rule.taxType) {
      case TaxType.SALES_TAX:
        return `${jurisdictionName} Sales Tax`;
      case TaxType.EXCISE_TAX:
        return `${jurisdictionName} Excise Tax`;
      case TaxType.BOTTLE_DEPOSIT:
        return 'Bottle Deposit';
      case TaxType.LOCAL_TAX:
        return `${jurisdictionName} Local Tax`;
      case TaxType.ENVIRONMENTAL_FEE:
        return 'Environmental Fee';
      default:
        return `${jurisdictionName} Tax`;
    }
  }

  /**
   * Aggregate tax breakdown from line items
   */
  private aggregateTaxBreakdown(lineItemTaxes: LineItemTax[]): TaxBreakdown[] {
    const aggregated = new Map<string, TaxBreakdown>();

    for (const lineItem of lineItemTaxes) {
      for (const breakdown of lineItem.breakdown) {
        const key = `${breakdown.taxType}-${breakdown.description}`;

        if (aggregated.has(key)) {
          const existing = aggregated.get(key)!;
          existing.baseAmount += breakdown.baseAmount;
          existing.taxAmount += breakdown.taxAmount;
        } else {
          aggregated.set(key, { ...breakdown });
        }
      }
    }

    return Array.from(aggregated.values());
  }

  /**
   * Fallback tax calculation (7% sales tax)
   */
  private calculateFallbackTax(
    lineItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      category: string;
    }>
  ): TaxCalculationResult {
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
    const totalTax = subtotal * 0.07; // 7% default tax rate

    return {
      subtotal,
      totalTax,
      totalAmount: subtotal + totalTax,
      breakdown: [
        {
          taxType: TaxType.SALES_TAX,
          description: 'Sales Tax (Default)',
          rate: 7.0,
          calculationMethod: TaxCalculationMethod.PERCENTAGE,
          baseAmount: subtotal,
          taxAmount: totalTax,
        },
      ],
    };
  }

  /**
   * Create new tax rule
   */
  async createTaxRule(
    jurisdiction: string,
    taxType: TaxType,
    rate: number,
    calculationMethod: TaxCalculationMethod = TaxCalculationMethod.PERCENTAGE,
    productCategory?: string,
    minPrice?: number,
    maxPrice?: number,
    effectiveDate: Date = new Date(),
    expirationDate?: Date
  ): Promise<TaxRule> {
    const ruleId = uuidv4();

    await db.query(
      `INSERT INTO tax_service.tax_rules (
        id, jurisdiction, tax_type, rate, calculation_method,
        product_category, min_price, max_price,
        is_active, effective_date, expiration_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, NOW())`,
      [
        ruleId,
        jurisdiction,
        taxType,
        rate,
        calculationMethod,
        productCategory,
        minPrice,
        maxPrice,
        effectiveDate,
        expirationDate,
      ]
    );

    log.info('Tax rule created', {
      ruleId,
      jurisdiction,
      taxType,
      rate,
    });

    return {
      id: ruleId,
      jurisdiction,
      taxType,
      rate,
      calculationMethod,
      productCategory,
      minPrice,
      maxPrice,
      isActive: true,
      effectiveDate,
      expirationDate,
    };
  }

  /**
   * Update tax rule
   */
  async updateTaxRule(ruleId: string, updates: Partial<TaxRule>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (updates.rate !== undefined) {
      fields.push(`rate = $${index++}`);
      values.push(updates.rate);
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(updates.isActive);
    }
    if (updates.effectiveDate !== undefined) {
      fields.push(`effective_date = $${index++}`);
      values.push(updates.effectiveDate);
    }
    if (updates.expirationDate !== undefined) {
      fields.push(`expiration_date = $${index++}`);
      values.push(updates.expirationDate);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(ruleId);

    await db.query(
      `UPDATE tax_service.tax_rules
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${index}`,
      values
    );

    log.info('Tax rule updated', { ruleId, updates });
  }

  /**
   * Get all tax rules for a jurisdiction
   */
  async getTaxRulesForJurisdiction(jurisdiction: string): Promise<TaxRule[]> {
    const result = await db.query(
      `SELECT
        id, jurisdiction, tax_type as "taxType", rate,
        calculation_method as "calculationMethod",
        product_category as "productCategory",
        min_price as "minPrice", max_price as "maxPrice",
        is_active as "isActive",
        effective_date as "effectiveDate",
        expiration_date as "expirationDate"
      FROM tax_service.tax_rules
      WHERE jurisdiction = $1
      ORDER BY tax_type, effective_date DESC`,
      [jurisdiction]
    );

    return result.rows;
  }

  /**
   * Validate tax calculation (for testing/auditing)
   */
  async validateTaxCalculation(
    transactionId: string
  ): Promise<{ isValid: boolean; expected: number; actual: number; variance: number }> {
    try {
      // Get transaction details
      const txResult = await db.query(
        `SELECT
          t.id, t.store_id, t.tax_amount as actual_tax,
          json_agg(json_build_object(
            'productId', li.product_id,
            'quantity', li.quantity,
            'unitPrice', li.unit_price,
            'category', p.category
          )) as line_items
        FROM order_service.retail_transactions t
        LEFT JOIN order_service.transaction_line_items li ON t.id = li.transaction_id
        LEFT JOIN product_service.products p ON li.product_id = p.id
        WHERE t.id = $1
        GROUP BY t.id`,
        [transactionId]
      );

      if (txResult.rows.length === 0) {
        throw new Error('Transaction not found');
      }

      const transaction = txResult.rows[0];
      const actualTax = parseFloat(transaction.actual_tax);

      // Recalculate tax
      const recalculated = await this.calculateTransactionTax(
        transaction.line_items,
        transaction.store_id
      );

      const expectedTax = recalculated.totalTax;
      const variance = Math.abs(actualTax - expectedTax);
      const isValid = variance < 0.01; // Within 1 cent

      return {
        isValid,
        expected: expectedTax,
        actual: actualTax,
        variance,
      };
    } catch (error: any) {
      log.error('Failed to validate tax calculation', {
        transactionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get tax summary report
   */
  async getTaxSummaryReport(
    storeId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const result = await db.query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(subtotal) as total_subtotal,
        SUM(tax_amount) as total_tax,
        SUM(total_amount) as total_sales,
        AVG(tax_amount) as avg_tax_per_transaction
      FROM order_service.retail_transactions
      WHERE store_id = $1
        AND business_date >= $2
        AND business_date <= $3
        AND status = 'COMPLETED'`,
      [storeId, startDate, endDate]
    );

    const summary = result.rows[0];

    return {
      storeId,
      startDate,
      endDate,
      transactionCount: parseInt(summary.transaction_count),
      totalSubtotal: parseFloat(summary.total_subtotal || 0),
      totalTax: parseFloat(summary.total_tax || 0),
      totalSales: parseFloat(summary.total_sales || 0),
      averageTaxPerTransaction: parseFloat(summary.avg_tax_per_transaction || 0),
      effectiveTaxRate:
        parseFloat(summary.total_subtotal) > 0
          ? (parseFloat(summary.total_tax) / parseFloat(summary.total_subtotal)) * 100
          : 0,
    };
  }
}

// Singleton instance
export const taxService = new TaxService();
