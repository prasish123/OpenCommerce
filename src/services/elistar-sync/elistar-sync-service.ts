import { NAXMLParser, NAXMLParseResult } from './naxml-parser';
import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { config } from '../../shared/config';
import { eventBus } from '../../shared/event-bus';
import { EventType, NAXMLImportResult } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Elistar Sync Service
 * Handles bidirectional sync with Elistar back-office:
 * - Import: Receive NAXML files (items, prices, promos)
 * - Export: Send transaction journal back to Elistar
 */
export class ElistarSyncService {
  private parser: NAXMLParser;

  constructor() {
    this.parser = new NAXMLParser();
  }

  /**
   * Import NAXML file from Elistar
   * This is called by the API endpoint when Elistar sends data
   */
  async importNAXML(xmlContent: string): Promise<NAXMLImportResult> {
    log.info('Starting NAXML import');

    // Publish start event
    await eventBus.publish({
      type: EventType.ELISTAR_IMPORT_STARTED,
      aggregateId: uuidv4(),
      data: { timestamp: new Date() },
      metadata: { storeId: config.store.id },
    });

    try {
      // Parse XML
      const parsed = this.parser.parse(xmlContent);

      if (parsed.errors.length > 0) {
        log.warn('NAXML parsing encountered errors', {
          errors: parsed.errors,
        });
      }

      // Import to database
      const result = await db.transaction(async (client) => {
        let itemsImported = 0;
        let merchandiseCodesImported = 0;
        let promotionsImported = 0;
        let itemListsImported = 0;

        // Import Merchandise Codes first (referenced by products)
        for (const mc of parsed.merchandiseCodes) {
          if (mc.action === 'delete') {
            await client.query(
              'DELETE FROM product_service.merchandise_codes WHERE code = $1',
              [mc.code]
            );
          } else {
            await client.query(
              `INSERT INTO product_service.merchandise_codes
              (code, description, active, tax_strategy_id, minimum_customer_age)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (code) DO UPDATE SET
                description = EXCLUDED.description,
                active = EXCLUDED.active,
                tax_strategy_id = EXCLUDED.tax_strategy_id,
                minimum_customer_age = EXCLUDED.minimum_customer_age,
                updated_at = CURRENT_TIMESTAMP`,
              [
                mc.code,
                mc.description,
                mc.active,
                mc.taxStrategyId,
                mc.minimumCustomerAge,
              ]
            );
          }
          merchandiseCodesImported++;
        }

        // Import Products
        for (const item of parsed.items) {
          if (item.action === 'delete') {
            await client.query(
              'UPDATE product_service.products SET active = false WHERE barcode = $1',
              [item.barcode]
            );
          } else {
            // Calculate channel-specific prices
            const priceInStore = item.basePrice * (1 + config.channelMarkup.inStore);
            const priceDoordash = item.basePrice * (1 + config.channelMarkup.doordash);
            const priceUberEats = item.basePrice * (1 + config.channelMarkup.uberEats);
            const priceWebsite = item.basePrice * (1 + config.channelMarkup.website);

            // Check if merchandise code requires age verification
            const mcResult = await client.query(
              'SELECT minimum_customer_age FROM product_service.merchandise_codes WHERE code = $1',
              [item.merchandiseCode]
            );
            const requiresAge = mcResult.rows[0]?.minimum_customer_age != null;
            const minAge = mcResult.rows[0]?.minimum_customer_age;

            await client.query(
              `INSERT INTO product_service.products
              (barcode, barcode_type, description, base_price, inventory_value_price,
               merchandise_code, tax_strategy_id, active,
               price_in_store, price_doordash, price_uber_eats, price_website,
               requires_age_verification, minimum_age, last_elistar_sync)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
              ON CONFLICT (barcode) DO UPDATE SET
                description = EXCLUDED.description,
                base_price = EXCLUDED.base_price,
                inventory_value_price = EXCLUDED.inventory_value_price,
                merchandise_code = EXCLUDED.merchandise_code,
                tax_strategy_id = EXCLUDED.tax_strategy_id,
                active = EXCLUDED.active,
                price_in_store = EXCLUDED.price_in_store,
                price_doordash = EXCLUDED.price_doordash,
                price_uber_eats = EXCLUDED.price_uber_eats,
                price_website = EXCLUDED.price_website,
                requires_age_verification = EXCLUDED.requires_age_verification,
                minimum_age = EXCLUDED.minimum_age,
                last_elistar_sync = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP`,
              [
                item.barcode,
                item.barcodeType,
                item.description,
                item.basePrice,
                item.inventoryValuePrice,
                item.merchandiseCode,
                item.taxStrategyId,
                item.active,
                priceInStore,
                priceDoordash,
                priceUberEats,
                priceWebsite,
                requiresAge,
                minAge,
              ]
            );
          }
          itemsImported++;
        }

        // Import Item Lists
        for (const list of parsed.itemLists) {
          if (list.action === 'delete') {
            await client.query(
              'DELETE FROM product_service.item_lists WHERE id = $1',
              [list.id]
            );
          } else {
            // Insert item list
            await client.query(
              `INSERT INTO product_service.item_lists (id, description)
              VALUES ($1, $2)
              ON CONFLICT (id) DO UPDATE SET
                description = EXCLUDED.description`,
              [list.id, list.description]
            );

            // Delete old entries
            await client.query(
              'DELETE FROM product_service.item_list_entries WHERE item_list_id = $1',
              [list.id]
            );

            // Insert new entries
            for (const barcode of list.barcodes) {
              // Get product ID from barcode
              const prodResult = await client.query(
                'SELECT id FROM product_service.products WHERE barcode = $1',
                [barcode]
              );

              if (prodResult.rows[0]) {
                await client.query(
                  `INSERT INTO product_service.item_list_entries
                  (item_list_id, product_id)
                  VALUES ($1, $2)
                  ON CONFLICT DO NOTHING`,
                  [list.id, prodResult.rows[0].id]
                );
              }
            }
          }
          itemListsImported++;
        }

        // Import Promotions
        for (const promo of parsed.promotions) {
          if (promo.action === 'delete') {
            await client.query(
              'UPDATE product_service.promotions SET active = false WHERE id = $1',
              [promo.id]
            );
          } else {
            await client.query(
              `INSERT INTO product_service.promotions
              (id, promotion_type, description, start_date, end_date, rules, active)
              VALUES ($1, $2, $3, $4, $5, $6, true)
              ON CONFLICT (id) DO UPDATE SET
                promotion_type = EXCLUDED.promotion_type,
                description = EXCLUDED.description,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                rules = EXCLUDED.rules,
                active = true`,
              [
                promo.id,
                promo.type,
                promo.description,
                promo.startDate,
                promo.endDate,
                JSON.stringify(promo.rules),
              ]
            );
          }
          promotionsImported++;
        }

        return {
          itemsImported,
          merchandiseCodesImported,
          promotionsImported,
          itemListsImported,
        };
      });

      const finalResult: NAXMLImportResult = {
        success: true,
        ...result,
        errors: parsed.errors,
        timestamp: new Date(),
      };

      log.info('NAXML import completed', finalResult);

      // Publish completion event
      await eventBus.publish({
        type: EventType.ELISTAR_IMPORT_COMPLETED,
        aggregateId: uuidv4(),
        data: finalResult,
        metadata: { storeId: parsed.storeId },
      });

      // TODO: Trigger menu sync to channels (DoorDash, Uber, Website)
      // This will be done by a subscriber to ELISTAR_IMPORT_COMPLETED event

      return finalResult;
    } catch (error) {
      log.error('NAXML import failed', error);
      return {
        success: false,
        itemsImported: 0,
        merchandiseCodesImported: 0,
        promotionsImported: 0,
        itemListsImported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        timestamp: new Date(),
      };
    }
  }

  /**
   * Export transactions to Elistar
   * This is called periodically or on-demand to send sales data back
   */
  async exportTransactions(
    startDate: Date,
    endDate: Date,
    storeId: string = config.store.id
  ): Promise<any> {
    log.info('Exporting transactions to Elistar', { startDate, endDate, storeId });

    try {
      // Get transactions in date range
      const result = await db.query(
        `SELECT
          t.id,
          t.transaction_number,
          t.business_date,
          t.subtotal,
          t.tax_total,
          t.total_amount,
          t.completed_at,
          json_agg(
            json_build_object(
              'barcode', li.barcode,
              'description', li.description,
              'quantity', li.quantity,
              'unitPrice', li.unit_price,
              'extendedPrice', li.extended_price,
              'taxAmount', li.tax_amount
            )
          ) as items
        FROM order_service.retail_transactions t
        LEFT JOIN order_service.transaction_line_items li ON t.id = li.transaction_id
        WHERE t.store_id = $1
          AND t.status = 'COMPLETED'
          AND t.completed_at >= $2
          AND t.completed_at < $3
          AND t.synced_to_elistar = false
        GROUP BY t.id
        ORDER BY t.completed_at`,
        [storeId, startDate, endDate]
      );

      const transactions = result.rows.map((row) => ({
        storeId,
        transactionId: row.id,
        transactionNumber: row.transaction_number,
        businessDate: row.business_date.toISOString().split('T')[0],
        items: row.items,
        subtotal: parseFloat(row.subtotal),
        tax: parseFloat(row.tax_total),
        total: parseFloat(row.total_amount),
        timestamp: row.completed_at.toISOString(),
      }));

      // Mark as synced
      if (transactions.length > 0) {
        const ids = transactions.map((t) => t.transactionId);
        await db.query(
          `UPDATE order_service.retail_transactions
          SET synced_to_elistar = true, synced_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1)`,
          [ids]
        );

        log.info('Transactions marked as synced', {
          count: transactions.length,
        });
      }

      // TODO: Send to Elistar endpoint (if configured)
      if (config.elistar.exportEndpoint && transactions.length > 0) {
        // await axios.post(config.elistar.exportEndpoint, transactions);
        log.info('Would send to Elistar endpoint', {
          endpoint: config.elistar.exportEndpoint,
          count: transactions.length,
        });
      }

      await eventBus.publish({
        type: EventType.ELISTAR_EXPORT_COMPLETED,
        aggregateId: uuidv4(),
        data: { transactionCount: transactions.length, startDate, endDate },
        metadata: { storeId },
      });

      return {
        success: true,
        transactionsExported: transactions.length,
        transactions,
      };
    } catch (error) {
      log.error('Transaction export failed', error);
      throw error;
    }
  }
}
