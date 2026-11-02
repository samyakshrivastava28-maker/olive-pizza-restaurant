/**
 * RestaurantIndexedDbService.ts — Local Database Persistence & Offline Queue Engine
 * 
 * Provides resilient, durable offline persistence for Restaurant Management:
 * 1. Durable order caching (orders_cache) to prevent blank screens during network blips.
 * 2. Reliable offline action queue (offline_actions) for kitchen status transitions.
 * 3. Synchronization metadata tracking (sync_metadata).
 * 4. Local backup snapshot registry with SHA-256 integrity verification.
 * 5. CSV export audit registry (csv_exports).
 */

import { Order, OrderStatus } from '../types/restaurant';

export const RESTAURANT_DB_NAME = 'OlivePizzaRestaurant_DB';
export const RESTAURANT_DB_VERSION = 1;

export const ORDERS_CACHE_STORE = 'orders_cache';
export const OFFLINE_ACTIONS_STORE = 'offline_actions';
export const SYNC_METADATA_STORE = 'sync_metadata';
export const LOCAL_BACKUPS_STORE = 'local_backups';
export const CSV_EXPORTS_STORE = 'csv_exports';

export type ActionSyncStatus = 
  | 'PENDING_SYNC' 
  | 'SYNCING' 
  | 'SYNCED' 
  | 'RETRY_REQUIRED' 
  | 'REVIEW_REQUIRED' 
  | 'FAILED';

export interface OfflineActionRecord {
  idempotencyKey: string;
  orderId: string;
  nextStatus: OrderStatus;
  branchId: string;
  franchiseId: string;
  reason?: string;
  estimatedPreparationMinutes?: number;
  status: ActionSyncStatus;
  createdAt: string;
  syncedAt?: string;
  retryCount: number;
  lastError?: string;
  orderSummary?: {
    orderNumber?: string;
    customerName?: string;
    totalAmount?: number;
  };
}

export interface BackupRecordMeta {
  id: string;
  filename: string;
  createdAt: string;
  recordCount: number;
  checksumSha256: string;
  sizeBytes: number;
  scope: { branchId: string; franchiseId: string };
  status: 'COMPLETED' | 'FAILED';
}

export interface CsvExportRecordMeta {
  id: string;
  reportType: string;
  filename: string;
  createdAt: string;
  rowCount: number;
  scope: { branchId: string; franchiseId: string };
  status: 'SUCCESS' | 'FAILED';
}

export interface RestaurantDatabaseSnapshot {
  schemaVersion: number;
  app: 'OLIVE_PIZZA_RESTAURANT';
  createdAt: string;
  franchiseId: string;
  branchId: string;
  checksumSha256: string;
  data: {
    orders: Order[];
    offlineActions: OfflineActionRecord[];
    backups?: BackupRecordMeta[];
    csvExports?: CsvExportRecordMeta[];
  };
}

export async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fast deterministic fallback hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

export class RestaurantIndexedDbService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB not supported in this environment'));
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(RESTAURANT_DB_NAME, RESTAURANT_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Orders cache
        if (!db.objectStoreNames.contains(ORDERS_CACHE_STORE)) {
          const orderStore = db.createObjectStore(ORDERS_CACHE_STORE, { keyPath: 'id' });
          orderStore.createIndex('branchId', 'branchId', { unique: false });
          orderStore.createIndex('status', 'status', { unique: false });
          orderStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 2. Offline actions queue
        if (!db.objectStoreNames.contains(OFFLINE_ACTIONS_STORE)) {
          const actionStore = db.createObjectStore(OFFLINE_ACTIONS_STORE, { keyPath: 'idempotencyKey' });
          actionStore.createIndex('status', 'status', { unique: false });
          actionStore.createIndex('createdAt', 'createdAt', { unique: false });
          actionStore.createIndex('branchId', 'branchId', { unique: false });
        }

        // 3. Sync metadata
        if (!db.objectStoreNames.contains(SYNC_METADATA_STORE)) {
          db.createObjectStore(SYNC_METADATA_STORE, { keyPath: 'key' });
        }

        // 4. Local backups audit
        if (!db.objectStoreNames.contains(LOCAL_BACKUPS_STORE)) {
          const backupStore = db.createObjectStore(LOCAL_BACKUPS_STORE, { keyPath: 'id' });
          backupStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 5. CSV export audit
        if (!db.objectStoreNames.contains(CSV_EXPORTS_STORE)) {
          const csvStore = db.createObjectStore(CSV_EXPORTS_STORE, { keyPath: 'id' });
          csvStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error || new Error('Failed to open Restaurant IndexedDB database'));
      };
    });

    return this.dbPromise;
  }

  // ==========================================
  // 1. ORDERS CACHE OPERATIONS
  // ==========================================

  public static async cacheOrders(orders: Order[]): Promise<void> {
    if (!orders || orders.length === 0) return;
    try {
      const db = await this.getDB();
      const tx = db.transaction(ORDERS_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(ORDERS_CACHE_STORE);

      for (const order of orders) {
        if (!order.id) continue;
        store.put(order);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted while caching orders'));
      });
    } catch (err) {
      console.warn('[RestaurantIndexedDb] Failed to cache orders:', err);
    }
  }

  public static async getCachedOrders(branchId?: string): Promise<Order[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(ORDERS_CACHE_STORE, 'readonly');
      const store = tx.objectStore(ORDERS_CACHE_STORE);

      return new Promise<Order[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          let list = (req.result as Order[]) || [];
          if (branchId && branchId !== 'all') {
            list = list.filter(o => o.branchId === branchId);
          }
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  // ==========================================
  // 2. OFFLINE ACTIONS QUEUE OPERATIONS
  // ==========================================

  public static async enqueueOfflineAction(action: OfflineActionRecord): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(OFFLINE_ACTIONS_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_ACTIONS_STORE);

    store.put(action);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to enqueue offline action'));
      tx.onabort = () => reject(new Error('Transaction aborted while enqueuing offline action'));
    });
  }

  public static async getPendingActions(): Promise<OfflineActionRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(OFFLINE_ACTIONS_STORE, 'readonly');
      const store = tx.objectStore(OFFLINE_ACTIONS_STORE);

      return new Promise<OfflineActionRecord[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as OfflineActionRecord[]) || [];
          const pending = all.filter(a => a.status === 'PENDING_SYNC' || a.status === 'RETRY_REQUIRED');
          resolve(pending);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public static async getAllActions(): Promise<OfflineActionRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(OFFLINE_ACTIONS_STORE, 'readonly');
      const store = tx.objectStore(OFFLINE_ACTIONS_STORE);

      return new Promise<OfflineActionRecord[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as OfflineActionRecord[]) || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public static async markActionSynced(idempotencyKey: string, serverTimestamp?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(OFFLINE_ACTIONS_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_ACTIONS_STORE);

      const req = store.get(idempotencyKey);
      req.onsuccess = () => {
        const item = req.result as OfflineActionRecord | undefined;
        if (item) {
          item.status = 'SYNCED';
          item.syncedAt = serverTimestamp || new Date().toISOString();
          store.put(item);
        }
      };

      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('[RestaurantIndexedDb] Failed to mark action synced:', err);
    }
  }

  public static async markActionFailed(
    idempotencyKey: string, 
    error: string, 
    status: 'RETRY_REQUIRED' | 'REVIEW_REQUIRED' = 'RETRY_REQUIRED'
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(OFFLINE_ACTIONS_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_ACTIONS_STORE);

      const req = store.get(idempotencyKey);
      req.onsuccess = () => {
        const item = req.result as OfflineActionRecord | undefined;
        if (item) {
          item.status = status;
          item.lastError = error;
          item.retryCount = (item.retryCount || 0) + 1;
          store.put(item);
        }
      };

      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('[RestaurantIndexedDb] Failed to update action error:', err);
    }
  }

  // ==========================================
  // 3. METADATA OPERATIONS
  // ==========================================

  public static async setSyncMeta(key: string, value: any): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SYNC_METADATA_STORE, 'readwrite');
      const store = tx.objectStore(SYNC_METADATA_STORE);
      store.put({ key, value, updatedAt: new Date().toISOString() });
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('[RestaurantIndexedDb] Failed to set sync meta:', err);
    }
  }

  public static async getSyncMeta(key: string): Promise<any> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SYNC_METADATA_STORE, 'readonly');
      const store = tx.objectStore(SYNC_METADATA_STORE);
      return new Promise<any>((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  // ==========================================
  // 4. BACKUP AUDIT & REGISTRY
  // ==========================================

  public static async saveBackupRecord(record: BackupRecordMeta): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(LOCAL_BACKUPS_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_BACKUPS_STORE);
      store.put(record);
    } catch (err) {
      console.warn('[RestaurantIndexedDb] Failed to save backup record:', err);
    }
  }

  public static async getAllBackupRecords(): Promise<BackupRecordMeta[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(LOCAL_BACKUPS_STORE, 'readonly');
      const store = tx.objectStore(LOCAL_BACKUPS_STORE);
      return new Promise<BackupRecordMeta[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as BackupRecordMeta[]) || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  // ==========================================
  // 5. CSV EXPORT AUDIT & REGISTRY
  // ==========================================

  public static async saveCsvExportRecord(record: CsvExportRecordMeta): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CSV_EXPORTS_STORE, 'readwrite');
      const store = tx.objectStore(CSV_EXPORTS_STORE);
      store.put(record);
    } catch (err) {
      console.warn('[RestaurantIndexedDb] Failed to save CSV export record:', err);
    }
  }

  public static async getAllCsvExportRecords(): Promise<CsvExportRecordMeta[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CSV_EXPORTS_STORE, 'readonly');
      const store = tx.objectStore(CSV_EXPORTS_STORE);
      return new Promise<CsvExportRecordMeta[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as CsvExportRecordMeta[]) || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  // ==========================================
  // 6. CRYPTOGRAPHIC BACKUP SNAPSHOT & VALIDATION
  // ==========================================

  public static async exportLocalDatabaseSnapshot(scope: { branchId: string; franchiseId: string }): Promise<RestaurantDatabaseSnapshot> {
    const orders = await this.getCachedOrders(scope.branchId);
    const offlineActions = await this.getAllActions();
    const backups = await this.getAllBackupRecords();
    const csvExports = await this.getAllCsvExportRecords();

    const rawData = {
      orders,
      offlineActions,
      backups,
      csvExports
    };

    const payloadString = JSON.stringify(rawData);
    const checksumSha256 = await computeSha256(payloadString);

    const snapshot: RestaurantDatabaseSnapshot = {
      schemaVersion: RESTAURANT_DB_VERSION,
      app: 'OLIVE_PIZZA_RESTAURANT',
      createdAt: new Date().toISOString(),
      franchiseId: scope.franchiseId,
      branchId: scope.branchId,
      checksumSha256,
      data: rawData
    };

    await this.saveBackupRecord({
      id: `bkp_${Date.now()}`,
      filename: `olive-pizza-restaurant-backup-${new Date().toISOString().split('T')[0]}.json`,
      createdAt: snapshot.createdAt,
      recordCount: orders.length + offlineActions.length,
      checksumSha256,
      sizeBytes: payloadString.length,
      scope,
      status: 'COMPLETED'
    });

    return snapshot;
  }

  public static async validateBackupSnapshot(snapshot: any): Promise<{ valid: boolean; error?: string; summary?: any }> {
    if (!snapshot || typeof snapshot !== 'object') {
      return { valid: false, error: 'Invalid backup file: not a valid JSON object' };
    }

    if (snapshot.app !== 'OLIVE_PIZZA_RESTAURANT') {
      return { valid: false, error: `App mismatch: expected "OLIVE_PIZZA_RESTAURANT", found "${snapshot.app || 'unknown'}"` };
    }

    if (!snapshot.checksumSha256 || !snapshot.data) {
      return { valid: false, error: 'Corrupt backup file: missing data or checksum header' };
    }

    const payloadString = JSON.stringify(snapshot.data);
    const computedHash = await computeSha256(payloadString);

    if (computedHash !== snapshot.checksumSha256) {
      return {
        valid: false,
        error: `Integrity check failed: checksum mismatch (expected ${snapshot.checksumSha256}, computed ${computedHash})`
      };
    }

    const orders = Array.isArray(snapshot.data.orders) ? snapshot.data.orders : [];
    const actions = Array.isArray(snapshot.data.offlineActions) ? snapshot.data.offlineActions : [];

    return {
      valid: true,
      summary: {
        totalOrders: orders.length,
        totalOfflineActions: actions.length,
        franchiseId: snapshot.franchiseId,
        branchId: snapshot.branchId,
        createdAt: snapshot.createdAt,
        checksum: snapshot.checksumSha256
      }
    };
  }

  /**
   * Restores an exported database snapshot into IndexedDB.
   * Validates schema and checksum before modifying any tables.
   * Runs in an atomic readwrite transaction across ORDERS_CACHE_STORE, OFFLINE_ACTIONS_STORE, LOCAL_BACKUPS_STORE, and CSV_EXPORTS_STORE.
   * Supports MERGE (preserves existing records, inserts/updates from snapshot) or REPLACE (clears stores before restoring).
   */
  public static async restoreLocalDatabaseSnapshot(
    snapshot: any,
    options: { mode?: 'MERGE' | 'REPLACE' } = { mode: 'MERGE' }
  ): Promise<{ success: boolean; restoredOrders: number; restoredActions: number; error?: string }> {
    const validation = await this.validateBackupSnapshot(snapshot);
    if (!validation.valid) {
      return { success: false, restoredOrders: 0, restoredActions: 0, error: validation.error };
    }

    const orders: Order[] = Array.isArray(snapshot.data?.orders) ? snapshot.data.orders : [];
    const actions: OfflineActionRecord[] = Array.isArray(snapshot.data?.offlineActions) ? snapshot.data.offlineActions : [];
    const backups: BackupRecordMeta[] = Array.isArray(snapshot.data?.backups) ? snapshot.data.backups : [];
    const csvExports: CsvExportRecordMeta[] = Array.isArray(snapshot.data?.csvExports) ? snapshot.data.csvExports : [];

    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([ORDERS_CACHE_STORE, OFFLINE_ACTIONS_STORE, LOCAL_BACKUPS_STORE, CSV_EXPORTS_STORE], 'readwrite');
      const orderStore = tx.objectStore(ORDERS_CACHE_STORE);
      const actionStore = tx.objectStore(OFFLINE_ACTIONS_STORE);
      const backupStore = tx.objectStore(LOCAL_BACKUPS_STORE);
      const csvStore = tx.objectStore(CSV_EXPORTS_STORE);

      let restoredOrders = 0;
      let restoredActions = 0;

      tx.onerror = () => {
        reject(new Error(`Restore transaction failed: ${tx.error?.message || 'Transaction aborted'}`));
      };

      tx.oncomplete = () => {
        resolve({
          success: true,
          restoredOrders,
          restoredActions
        });
      };

      if (options.mode === 'REPLACE') {
        orderStore.clear();
        actionStore.clear();
        backupStore.clear();
        csvStore.clear();

        for (const order of orders) {
          if (order && (order.id || (order as any)._id)) {
            orderStore.put(order);
            restoredOrders++;
          }
        }

        for (const act of actions) {
          if (act && act.idempotencyKey) {
            actionStore.put(act);
            restoredActions++;
          }
        }

        for (const bkp of backups) {
          if (bkp && bkp.id) backupStore.put(bkp);
        }

        for (const exp of csvExports) {
          if (exp && exp.id) csvStore.put(exp);
        }
      } else {
        // MERGE mode: Conflict-aware merge
        const existingActionsReq = actionStore.getAll();
        existingActionsReq.onsuccess = () => {
          const existingList = (existingActionsReq.result as OfflineActionRecord[]) || [];
          const existingMap = new Map<string, OfflineActionRecord>();
          for (const ex of existingList) {
            if (ex && ex.idempotencyKey) {
              existingMap.set(ex.idempotencyKey, ex);
            }
          }

          for (const act of actions) {
            if (act && act.idempotencyKey) {
              const existing = existingMap.get(act.idempotencyKey);
              if (existing) {
                // Conflict resolution: Never downgrade SYNCED to PENDING
                const merged: OfflineActionRecord = {
                  ...act,
                  status: (existing.status === 'SYNCED' && act.status !== 'SYNCED')
                    ? 'SYNCED'
                    : act.status,
                  syncedAt: existing.syncedAt || act.syncedAt,
                  retryCount: Math.max(existing.retryCount || 0, act.retryCount || 0)
                };
                actionStore.put(merged);
              } else {
                actionStore.put(act);
              }
              restoredActions++;
            }
          }

          for (const order of orders) {
            if (order && (order.id || (order as any)._id)) {
              orderStore.put(order);
              restoredOrders++;
            }
          }

          for (const bkp of backups) {
            if (bkp && bkp.id) backupStore.put(bkp);
          }
          for (const exp of csvExports) {
            if (exp && exp.id) csvStore.put(exp);
          }
        };
      }
    });
  }

}
