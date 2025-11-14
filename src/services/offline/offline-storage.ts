/**
 * Offline Storage Service
 * Store and forward capability using IndexedDB
 * Supports offline POS operations with automatic sync when online
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { log } from '../../shared/logger';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// DATABASE SCHEMA
// ==========================================

interface OfflineDB extends DBSchema {
  // Pending transactions (not yet synced to server)
  pending_transactions: {
    key: string;
    value: {
      id: string;
      storeId: string;
      terminalId: string;
      businessDate: string;
      items: any[];
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
      tenders: any[];
      customerId?: string;
      createdAt: string;
      syncAttempts: number;
      lastSyncAttempt?: string;
      syncError?: string;
    };
    indexes: {
      'by-store': string;
      'by-terminal': string;
      'by-date': string;
      'by-sync-status': number;
    };
  };

  // Products cache (for offline lookup)
  products: {
    key: string;
    value: {
      id: string;
      barcode: string;
      description: string;
      basePrice: number;
      priceInStore: number;
      category: string;
      requiresAgeVerification: boolean;
      active: boolean;
      lastSyncedAt: string;
    };
    indexes: {
      'by-barcode': string;
      'by-category': string;
    };
  };

  // Inventory snapshot (for offline availability check)
  inventory: {
    key: string;
    value: {
      productId: string;
      storeId: string;
      quantityOnHand: number;
      quantityReserved: number;
      lastSyncedAt: string;
    };
    indexes: {
      'by-store': string;
      'by-product-store': [string, string];
    };
  };

  // Promotions cache
  promotions: {
    key: string;
    value: {
      id: string;
      promotionType: string;
      description: string;
      rules: any;
      startDate: string;
      endDate: string;
      active: boolean;
      lastSyncedAt: string;
    };
    indexes: {
      'by-date': string;
    };
  };

  // Loyalty members cache
  loyalty_members: {
    key: string;
    value: {
      id: string;
      memberNumber: string;
      phone: string;
      firstName: string;
      lastName: string;
      tier: string;
      pointsBalance: number;
      lastSyncedAt: string;
    };
    indexes: {
      'by-phone': string;
      'by-member-number': string;
    };
  };

  // Sync log (track sync operations)
  sync_log: {
    key: string;
    value: {
      id: string;
      syncType: 'TRANSACTION' | 'PRODUCT' | 'INVENTORY' | 'PROMOTION' | 'LOYALTY';
      direction: 'UP' | 'DOWN'; // UP = local to server, DOWN = server to local
      status: 'PENDING' | 'SUCCESS' | 'FAILED';
      recordCount: number;
      startedAt: string;
      completedAt?: string;
      error?: string;
    };
    indexes: {
      'by-status': string;
      'by-type': string;
      'by-date': string;
    };
  };

  // Store configuration (cached locally)
  store_config: {
    key: string;
    value: {
      storeId: string;
      storeName: string;
      address: string;
      timezone: string;
      taxRates: any;
      settings: any;
      lastSyncedAt: string;
    };
  };
}

// ==========================================
// OFFLINE STORAGE SERVICE
// ==========================================

export class OfflineStorageService {
  private db: IDBPDatabase<OfflineDB> | null = null;
  private readonly DB_NAME = 'opencommerce_offline';
  private readonly DB_VERSION = 1;

  /**
   * Initialize database
   */
  async initialize(): Promise<void> {
    try {
      this.db = await openDB<OfflineDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          // Pending transactions
          if (!db.objectStoreNames.contains('pending_transactions')) {
            const txnStore = db.createObjectStore('pending_transactions', { keyPath: 'id' });
            txnStore.createIndex('by-store', 'storeId');
            txnStore.createIndex('by-terminal', 'terminalId');
            txnStore.createIndex('by-date', 'businessDate');
            txnStore.createIndex('by-sync-status', 'syncAttempts');
          }

          // Products cache
          if (!db.objectStoreNames.contains('products')) {
            const productStore = db.createObjectStore('products', { keyPath: 'id' });
            productStore.createIndex('by-barcode', 'barcode', { unique: true });
            productStore.createIndex('by-category', 'category');
          }

          // Inventory snapshot
          if (!db.objectStoreNames.contains('inventory')) {
            const invStore = db.createObjectStore('inventory', { keyPath: ['productId', 'storeId'] });
            invStore.createIndex('by-store', 'storeId');
            invStore.createIndex('by-product-store', ['productId', 'storeId']);
          }

          // Promotions
          if (!db.objectStoreNames.contains('promotions')) {
            const promoStore = db.createObjectStore('promotions', { keyPath: 'id' });
            promoStore.createIndex('by-date', 'startDate');
          }

          // Loyalty members
          if (!db.objectStoreNames.contains('loyalty_members')) {
            const loyaltyStore = db.createObjectStore('loyalty_members', { keyPath: 'id' });
            loyaltyStore.createIndex('by-phone', 'phone');
            loyaltyStore.createIndex('by-member-number', 'memberNumber', { unique: true });
          }

          // Sync log
          if (!db.objectStoreNames.contains('sync_log')) {
            const syncStore = db.createObjectStore('sync_log', { keyPath: 'id' });
            syncStore.createIndex('by-status', 'status');
            syncStore.createIndex('by-type', 'syncType');
            syncStore.createIndex('by-date', 'startedAt');
          }

          // Store config
          if (!db.objectStoreNames.contains('store_config')) {
            db.createObjectStore('store_config', { keyPath: 'storeId' });
          }
        },
      });

      log.info('Offline storage initialized');
    } catch (error: any) {
      log.error('Failed to initialize offline storage', { error: error.message });
      throw error;
    }
  }

  /**
   * Save transaction for offline sync
   */
  async savePendingTransaction(transaction: any): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.put('pending_transactions', {
        id: transaction.id || uuidv4(),
        storeId: transaction.storeId,
        terminalId: transaction.terminalId,
        businessDate: transaction.businessDate || new Date().toISOString().split('T')[0],
        items: transaction.items,
        subtotal: transaction.subtotal,
        taxAmount: transaction.taxAmount,
        totalAmount: transaction.totalAmount,
        tenders: transaction.tenders,
        customerId: transaction.customerId,
        createdAt: new Date().toISOString(),
        syncAttempts: 0,
      });

      log.info('Transaction saved for offline sync', { transactionId: transaction.id });
    } catch (error: any) {
      log.error('Failed to save pending transaction', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all pending transactions
   */
  async getPendingTransactions(storeId?: string): Promise<any[]> {
    if (!this.db) await this.initialize();

    try {
      if (storeId) {
        return await this.db!.getAllFromIndex('pending_transactions', 'by-store', storeId);
      }
      return await this.db!.getAll('pending_transactions');
    } catch (error: any) {
      log.error('Failed to get pending transactions', { error: error.message });
      return [];
    }
  }

  /**
   * Delete pending transaction after successful sync
   */
  async deletePendingTransaction(transactionId: string): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.delete('pending_transactions', transactionId);
      log.info('Pending transaction deleted', { transactionId });
    } catch (error: any) {
      log.error('Failed to delete pending transaction', { error: error.message });
    }
  }

  /**
   * Update sync attempt count
   */
  async updateSyncAttempt(transactionId: string, error?: string): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      const txn = await this.db!.get('pending_transactions', transactionId);
      if (txn) {
        txn.syncAttempts += 1;
        txn.lastSyncAttempt = new Date().toISOString();
        if (error) {
          txn.syncError = error;
        }
        await this.db!.put('pending_transactions', txn);
      }
    } catch (error: any) {
      log.error('Failed to update sync attempt', { error: error.message });
    }
  }

  /**
   * Cache product for offline lookup
   */
  async cacheProduct(product: any): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.put('products', {
        id: product.id,
        barcode: product.barcode,
        description: product.description,
        basePrice: product.basePrice,
        priceInStore: product.priceInStore,
        category: product.category,
        requiresAgeVerification: product.requiresAgeVerification,
        active: product.active,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error('Failed to cache product', { error: error.message });
    }
  }

  /**
   * Get product from cache
   */
  async getCachedProductByBarcode(barcode: string): Promise<any | null> {
    if (!this.db) await this.initialize();

    try {
      return await this.db!.getFromIndex('products', 'by-barcode', barcode);
    } catch (error: any) {
      log.error('Failed to get cached product', { error: error.message });
      return null;
    }
  }

  /**
   * Cache inventory snapshot
   */
  async cacheInventory(productId: string, storeId: string, inventory: any): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.put('inventory', {
        productId,
        storeId,
        quantityOnHand: inventory.quantityOnHand,
        quantityReserved: inventory.quantityReserved,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error('Failed to cache inventory', { error: error.message });
    }
  }

  /**
   * Get cached inventory
   */
  async getCachedInventory(productId: string, storeId: string): Promise<any | null> {
    if (!this.db) await this.initialize();

    try {
      return await this.db!.get('inventory', [productId, storeId]);
    } catch (error: any) {
      log.error('Failed to get cached inventory', { error: error.message });
      return null;
    }
  }

  /**
   * Cache loyalty member
   */
  async cacheLoyaltyMember(member: any): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.put('loyalty_members', {
        id: member.id,
        memberNumber: member.memberNumber,
        phone: member.phone,
        firstName: member.firstName,
        lastName: member.lastName,
        tier: member.tier,
        pointsBalance: member.pointsBalance,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error('Failed to cache loyalty member', { error: error.message });
    }
  }

  /**
   * Get cached loyalty member by phone
   */
  async getCachedLoyaltyMemberByPhone(phone: string): Promise<any | null> {
    if (!this.db) await this.initialize();

    try {
      return await this.db!.getFromIndex('loyalty_members', 'by-phone', phone);
    } catch (error: any) {
      log.error('Failed to get cached loyalty member', { error: error.message });
      return null;
    }
  }

  /**
   * Log sync operation
   */
  async logSync(
    syncType: 'TRANSACTION' | 'PRODUCT' | 'INVENTORY' | 'PROMOTION' | 'LOYALTY',
    direction: 'UP' | 'DOWN',
    status: 'PENDING' | 'SUCCESS' | 'FAILED',
    recordCount: number,
    error?: string
  ): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.add('sync_log', {
        id: uuidv4(),
        syncType,
        direction,
        status,
        recordCount,
        startedAt: new Date().toISOString(),
        completedAt: status !== 'PENDING' ? new Date().toISOString() : undefined,
        error,
      });
    } catch (error: any) {
      log.error('Failed to log sync', { error: error.message });
    }
  }

  /**
   * Get sync history
   */
  async getSyncHistory(limit: number = 100): Promise<any[]> {
    if (!this.db) await this.initialize();

    try {
      const logs = await this.db!.getAllFromIndex('sync_log', 'by-date');
      return logs.slice(-limit).reverse();
    } catch (error: any) {
      log.error('Failed to get sync history', { error: error.message });
      return [];
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<any> {
    if (!this.db) await this.initialize();

    try {
      const pendingCount = await this.db!.count('pending_transactions');
      const productsCount = await this.db!.count('products');
      const inventoryCount = await this.db!.count('inventory');
      const loyaltyCount = await this.db!.count('loyalty_members');
      const syncLogCount = await this.db!.count('sync_log');

      return {
        pendingTransactions: pendingCount,
        cachedProducts: productsCount,
        cachedInventory: inventoryCount,
        cachedLoyaltyMembers: loyaltyCount,
        syncLogs: syncLogCount,
      };
    } catch (error: any) {
      log.error('Failed to get storage stats', { error: error.message });
      return {};
    }
  }

  /**
   * Clear all cached data (for testing or reset)
   */
  async clearCache(): Promise<void> {
    if (!this.db) await this.initialize();

    try {
      await this.db!.clear('products');
      await this.db!.clear('inventory');
      await this.db!.clear('promotions');
      await this.db!.clear('loyalty_members');
      log.info('Cache cleared');
    } catch (error: any) {
      log.error('Failed to clear cache', { error: error.message });
    }
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorageService();
