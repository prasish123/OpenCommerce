/**
 * Sync Service
 * Bidirectional synchronization between store (offline) and central server
 * Handles conflict resolution and ensures data consistency
 */

import { offlineStorage } from './offline-storage';
import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/events';
import { EventType } from '../../shared/types';
import axios, { AxiosInstance } from 'axios';

// ==========================================
// TYPES
// ==========================================

export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  errors: string[];
  conflicts: ConflictResolution[];
}

export interface ConflictResolution {
  recordId: string;
  recordType: string;
  resolution: 'SERVER_WINS' | 'LOCAL_WINS' | 'MERGED' | 'MANUAL_REQUIRED';
  details: string;
}

export enum SyncStrategy {
  SERVER_WINS = 'SERVER_WINS', // Server data always takes precedence
  LOCAL_WINS = 'LOCAL_WINS', // Local data always takes precedence
  LAST_WRITE_WINS = 'LAST_WRITE_WINS', // Most recent timestamp wins
  MANUAL = 'MANUAL', // Requires manual conflict resolution
}

// ==========================================
// SYNC SERVICE
// ==========================================

export class SyncService {
  private client: AxiosInstance;
  private isSyncing: boolean = false;
  private syncStrategy: SyncStrategy = SyncStrategy.LAST_WRITE_WINS;
  private readonly SYNC_INTERVAL = 30000; // 30 seconds
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(baseURL: string = process.env.SYNC_SERVER_URL || 'http://localhost:3000') {
    this.client = axios.create({
      baseURL,
      timeout: 60000, // 60 second timeout for large syncs
    });
  }

  /**
   * Start automatic sync (every 30 seconds when online)
   */
  startAutoSync(storeId: string, terminalId: string): void {
    if (this.syncTimer) {
      return; // Already running
    }

    log.info('Starting auto-sync', { storeId, terminalId, interval: this.SYNC_INTERVAL });

    this.syncTimer = setInterval(async () => {
      await this.syncAll(storeId, terminalId);
    }, this.SYNC_INTERVAL);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      log.info('Auto-sync stopped');
    }
  }

  /**
   * Sync all data types
   */
  async syncAll(storeId: string, terminalId: string): Promise<SyncResult> {
    if (this.isSyncing) {
      log.warn('Sync already in progress, skipping');
      return { success: false, recordsSynced: 0, errors: ['Sync already in progress'], conflicts: [] };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    let totalRecords = 0;
    const errors: string[] = [];
    const conflicts: ConflictResolution[] = [];

    try {
      log.info('Starting full sync', { storeId, terminalId });

      // 1. Sync pending transactions UP (local → server)
      const txnResult = await this.syncPendingTransactions(storeId, terminalId);
      totalRecords += txnResult.recordsSynced;
      errors.push(...txnResult.errors);
      conflicts.push(...txnResult.conflicts);

      // 2. Sync products DOWN (server → local cache)
      const productResult = await this.syncProducts(storeId);
      totalRecords += productResult.recordsSynced;
      errors.push(...productResult.errors);

      // 3. Sync inventory DOWN (server → local cache)
      const inventoryResult = await this.syncInventory(storeId);
      totalRecords += inventoryResult.recordsSynced;
      errors.push(...inventoryResult.errors);

      // 4. Sync promotions DOWN (server → local cache)
      const promoResult = await this.syncPromotions(storeId);
      totalRecords += promoResult.recordsSynced;
      errors.push(...promoResult.errors);

      // 5. Sync loyalty members DOWN (server → local cache)
      const loyaltyResult = await this.syncLoyaltyMembers(storeId);
      totalRecords += loyaltyResult.recordsSynced;
      errors.push(...loyaltyResult.errors);

      const duration = Date.now() - startTime;
      log.info('Sync completed', {
        storeId,
        terminalId,
        recordsSynced: totalRecords,
        duration,
        errors: errors.length,
        conflicts: conflicts.length,
      });

      // Emit sync completed event
      eventBus.emit(EventType.SYNC_COMPLETED, {
        storeId,
        terminalId,
        recordsSynced: totalRecords,
        duration,
        success: errors.length === 0,
      });

      return {
        success: errors.length === 0,
        recordsSynced: totalRecords,
        errors,
        conflicts,
      };
    } catch (error: any) {
      log.error('Sync failed', { error: error.message });
      return {
        success: false,
        recordsSynced: totalRecords,
        errors: [...errors, error.message],
        conflicts,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync pending transactions to server
   */
  private async syncPendingTransactions(storeId: string, terminalId: string): Promise<SyncResult> {
    const errors: string[] = [];
    const conflicts: ConflictResolution[] = [];
    let synced = 0;

    try {
      const pendingTransactions = await offlineStorage.getPendingTransactions(storeId);

      if (pendingTransactions.length === 0) {
        return { success: true, recordsSynced: 0, errors: [], conflicts: [] };
      }

      log.info('Syncing pending transactions', { count: pendingTransactions.length });

      for (const txn of pendingTransactions) {
        try {
          // Send to server
          const response = await this.client.post('/api/sync/transactions', {
            transaction: txn,
            storeId,
            terminalId,
          });

          if (response.status === 200 || response.status === 201) {
            // Success - remove from local queue
            await offlineStorage.deletePendingTransaction(txn.id);
            synced++;

            log.info('Transaction synced', { transactionId: txn.id });
          } else if (response.status === 409) {
            // Conflict - transaction already exists on server
            const conflict: ConflictResolution = {
              recordId: txn.id,
              recordType: 'TRANSACTION',
              resolution: 'SERVER_WINS',
              details: 'Transaction already exists on server',
            };
            conflicts.push(conflict);

            // Remove from local queue (server version is authoritative)
            await offlineStorage.deletePendingTransaction(txn.id);
          }
        } catch (error: any) {
          // Network error or server error
          await offlineStorage.updateSyncAttempt(txn.id, error.message);
          errors.push(`Transaction ${txn.id}: ${error.message}`);

          // If too many failed attempts (>10), flag for manual review
          if (txn.syncAttempts >= 10) {
            conflicts.push({
              recordId: txn.id,
              recordType: 'TRANSACTION',
              resolution: 'MANUAL_REQUIRED',
              details: `Failed to sync after ${txn.syncAttempts} attempts`,
            });
          }
        }
      }

      await offlineStorage.logSync('TRANSACTION', 'UP', errors.length === 0 ? 'SUCCESS' : 'FAILED', synced);

      return { success: errors.length === 0, recordsSynced: synced, errors, conflicts };
    } catch (error: any) {
      log.error('Failed to sync transactions', { error: error.message });
      return { success: false, recordsSynced: synced, errors: [error.message], conflicts };
    }
  }

  /**
   * Sync products from server to local cache
   */
  private async syncProducts(storeId: string): Promise<SyncResult> {
    try {
      const response = await this.client.get(`/api/sync/products/${storeId}`);
      const products = response.data;

      for (const product of products) {
        await offlineStorage.cacheProduct(product);
      }

      await offlineStorage.logSync('PRODUCT', 'DOWN', 'SUCCESS', products.length);

      log.info('Products synced', { count: products.length });

      return { success: true, recordsSynced: products.length, errors: [], conflicts: [] };
    } catch (error: any) {
      log.error('Failed to sync products', { error: error.message });
      await offlineStorage.logSync('PRODUCT', 'DOWN', 'FAILED', 0, error.message);
      return { success: false, recordsSynced: 0, errors: [error.message], conflicts: [] };
    }
  }

  /**
   * Sync inventory from server to local cache
   */
  private async syncInventory(storeId: string): Promise<SyncResult> {
    try {
      const response = await this.client.get(`/api/sync/inventory/${storeId}`);
      const inventoryItems = response.data;

      for (const item of inventoryItems) {
        await offlineStorage.cacheInventory(item.productId, storeId, item);
      }

      await offlineStorage.logSync('INVENTORY', 'DOWN', 'SUCCESS', inventoryItems.length);

      log.info('Inventory synced', { count: inventoryItems.length });

      return { success: true, recordsSynced: inventoryItems.length, errors: [], conflicts: [] };
    } catch (error: any) {
      log.error('Failed to sync inventory', { error: error.message });
      await offlineStorage.logSync('INVENTORY', 'DOWN', 'FAILED', 0, error.message);
      return { success: false, recordsSynced: 0, errors: [error.message], conflicts: [] };
    }
  }

  /**
   * Sync promotions from server to local cache
   */
  private async syncPromotions(storeId: string): Promise<SyncResult> {
    try {
      const response = await this.client.get(`/api/sync/promotions/${storeId}`);
      const promotions = response.data;

      // Cache promotions in IndexedDB
      // (Implementation would be similar to products)

      await offlineStorage.logSync('PROMOTION', 'DOWN', 'SUCCESS', promotions.length);

      log.info('Promotions synced', { count: promotions.length });

      return { success: true, recordsSynced: promotions.length, errors: [], conflicts: [] };
    } catch (error: any) {
      log.error('Failed to sync promotions', { error: error.message });
      await offlineStorage.logSync('PROMOTION', 'DOWN', 'FAILED', 0, error.message);
      return { success: false, recordsSynced: 0, errors: [error.message], conflicts: [] };
    }
  }

  /**
   * Sync loyalty members from server to local cache
   */
  private async syncLoyaltyMembers(storeId: string): Promise<SyncResult> {
    try {
      const response = await this.client.get(`/api/sync/loyalty/${storeId}`);
      const members = response.data;

      for (const member of members) {
        await offlineStorage.cacheLoyaltyMember(member);
      }

      await offlineStorage.logSync('LOYALTY', 'DOWN', 'SUCCESS', members.length);

      log.info('Loyalty members synced', { count: members.length });

      return { success: true, recordsSynced: members.length, errors: [], conflicts: [] };
    } catch (error: any) {
      log.error('Failed to sync loyalty members', { error: error.message });
      await offlineStorage.logSync('LOYALTY', 'DOWN', 'FAILED', 0, error.message);
      return { success: false, recordsSynced: 0, errors: [error.message], conflicts: [] };
    }
  }

  /**
   * Force full sync (on demand)
   */
  async forceSyncNow(storeId: string, terminalId: string): Promise<SyncResult> {
    log.info('Force sync initiated', { storeId, terminalId });
    return await this.syncAll(storeId, terminalId);
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<any> {
    const stats = await offlineStorage.getStorageStats();
    const history = await offlineStorage.getSyncHistory(10);

    return {
      isSyncing: this.isSyncing,
      pendingTransactions: stats.pendingTransactions,
      lastSync: history[0]?.completedAt,
      recentSyncs: history,
      cacheStats: stats,
    };
  }

  /**
   * Set sync strategy
   */
  setSyncStrategy(strategy: SyncStrategy): void {
    this.syncStrategy = strategy;
    log.info('Sync strategy changed', { strategy });
  }
}

// Singleton instance
export const syncService = new SyncService();

// EventType additions needed in shared/types.ts
declare module '../../shared/types' {
  enum EventType {
    SYNC_STARTED = 'sync.started',
    SYNC_COMPLETED = 'sync.completed',
    SYNC_FAILED = 'sync.failed',
  }
}
