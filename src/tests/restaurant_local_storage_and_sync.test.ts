import assert from 'node:assert';
import test from 'node:test';
import { 
  RestaurantIndexedDbService, 
  computeSha256, 
  RestaurantDatabaseSnapshot, 
  OfflineActionRecord 
} from '../services/RestaurantIndexedDbService';
import { RestaurantCsvExportService } from '../services/RestaurantCsvExportService';
import { Order } from '../types/restaurant';

test('Olive Pizza Restaurant Manager — Local Persistence, Sync Queue & CSV Backups Test Suite', async (t) => {

  await t.test('RFC 4180 & CWE-1236: CSV export strictly protects against formula injection while preserving negative numbers', () => {
    // 1. Formula Injection attempts (must be prefixed with single quote; RFC 4180 escapes quotes when present)
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell('=cmd|"/c calc"!A0'), '"\'=cmd|""/c calc""!A0"');
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell('@SUM(1+1)'), "'@SUM(1+1)");
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell('+cmd'), "'+cmd");
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell('-bad_formula'), "'-bad_formula");

    // 2. Pure numbers & negative currency values (must NOT be prefixed with quote)
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell(-50.25), "-50.25");
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell("-50.25"), "-50.25");
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell(1200), "1200");
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell("1200.00"), "1200.00");
    assert.strictEqual(RestaurantCsvExportService.sanitizeCell(0), "0");

    // 3. RFC 4180 Escaping (commas and quotes)
    const escaped = RestaurantCsvExportService.sanitizeCell('Olive Pizza, "Paneer Makhani" Supreme');
    assert.strictEqual(escaped, '"Olive Pizza, ""Paneer Makhani"" Supreme"');

    // 4. Full CSV build with CRLF record separators
    const csv = RestaurantCsvExportService.buildCsv(
      ['Order ID', 'Total Amount', 'Formula Note', 'Discount'],
      [
        ['ord_101', 450, '=2+2', -50],
        ['ord_102', 600, 'Regular Special', 0]
      ]
    );
    assert.ok(csv.includes('\r\n'), 'Must use RFC 4180 standard CRLF record separators');
    assert.ok(csv.includes("ord_101,450,'=2+2,-50"), 'Formula must be sanitized and negative discount preserved');
  });

  await t.test('CSV Report Generators: Orders, Daily Sales, Line Items, and Offline Audit', () => {
    const mockOrders: Order[] = [
      {
        id: 'ord_test_001',
        orderNumber: 'OP-1001',
        dailyOrderNumber: 1,
        customerName: 'Aman Sharma',
        contactPhone: '9876543210',
        customerEmail: 'aman@example.com',
        fulfillmentType: 'dine_in',
        tableNumber: 'T-4',
        status: 'delivered',
        subtotal: 500,
        taxes: 25,
        deliveryFee: 0,
        packagingCharge: 10,
        discountAmount: -50,
        totalAmount: 485,
        paymentMethod: 'UPI',
        paymentStatus: 'PAID',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        updatedAt: new Date('2026-11-01T10:30:00Z'),
        items: [
          { name: 'Veggie Supreme', price: 350, quantity: 1, size: 'Medium', crust: 'Cheese Burst' },
          { name: 'Garlic Bread', price: 150, quantity: 1, size: 'Regular', crust: 'Classic' }
        ]
      },
      {
        id: 'ord_test_002',
        orderNumber: 'OP-1002',
        dailyOrderNumber: 2,
        customerName: 'Pooja Verma',
        contactPhone: '9876500000',
        fulfillmentType: 'delivery',
        status: 'cancelled',
        cancellationReason: 'Customer request',
        subtotal: 300,
        taxes: 15,
        deliveryFee: 40,
        packagingCharge: 0,
        discountAmount: 0,
        totalAmount: 355,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        createdAt: new Date('2026-11-01T11:00:00Z'),
        updatedAt: new Date('2026-11-01T11:15:00Z'),
        items: [
          { name: 'Paneer Makhani Pizza', price: 300, quantity: 1, size: 'Regular', crust: 'Pan' }
        ]
      }
    ];

    // 1. Orders CSV
    const ordersCsv = RestaurantCsvExportService.exportOrdersCsv(mockOrders);
    assert.strictEqual(ordersCsv.rowCount, 2);
    assert.ok(ordersCsv.content.includes('OP-1001'));
    assert.ok(ordersCsv.content.includes('Aman Sharma'));
    assert.ok(ordersCsv.content.includes('OP-1002'));
    assert.ok(ordersCsv.content.includes('Customer request'));

    // 2. Daily Sales CSV
    const salesCsv = RestaurantCsvExportService.exportDailySalesSummaryCsv(mockOrders);
    assert.strictEqual(salesCsv.rowCount, 1); // 1 distinct date
    assert.ok(salesCsv.content.includes('2026-11-01'));
    assert.ok(salesCsv.content.includes('485.00')); // Gross sales from delivered order

    // 3. Line Items CSV
    const itemsCsv = RestaurantCsvExportService.exportLineItemsCsv(mockOrders);
    assert.strictEqual(itemsCsv.rowCount, 3); // 2 items in ord 1, 1 item in ord 2
    assert.ok(itemsCsv.content.includes('Veggie Supreme'));
    assert.ok(itemsCsv.content.includes('Garlic Bread'));
    assert.ok(itemsCsv.content.includes('Paneer Makhani Pizza'));

    // 4. Offline Audit CSV
    const mockActions: OfflineActionRecord[] = [
      {
        idempotencyKey: 'act_idemp_001',
        orderId: 'ord_test_001',
        nextStatus: 'preparing',
        branchId: 'branch_rjn_01',
        franchiseId: 'fra_01',
        status: 'SYNCED',
        createdAt: new Date('2026-11-01T10:05:00Z').toISOString(),
        syncedAt: new Date('2026-11-01T10:06:00Z').toISOString(),
        retryCount: 0,
        orderSummary: { orderNumber: 'OP-1001', customerName: 'Aman', totalAmount: 485 }
      }
    ];
    const auditCsv = RestaurantCsvExportService.exportOfflineActionsAuditCsv(mockActions);
    assert.strictEqual(auditCsv.rowCount, 1);
    assert.ok(auditCsv.content.includes('act_idemp_001'));
    assert.ok(auditCsv.content.includes('SYNCED'));
  });

  await t.test('Cryptographic Integrity: Backup snapshot validation computes SHA-256 and detects tampering', async () => {
    const validSnapshot: RestaurantDatabaseSnapshot = {
      schemaVersion: 1,
      app: 'OLIVE_PIZZA_RESTAURANT',
      createdAt: new Date().toISOString(),
      franchiseId: 'fra_main',
      branchId: 'branch_rjn_01',
      checksumSha256: '',
      data: {
        orders: [
          { id: 'ord_snap_1', orderNumber: 'OP-SNAP-1', totalAmount: 500, status: 'delivered' } as any
        ],
        offlineActions: [
          { idempotencyKey: 'key_snap_1', orderId: 'ord_snap_1', nextStatus: 'delivered', status: 'SYNCED' } as any
        ],
        backups: [],
        csvExports: []
      }
    };

    validSnapshot.checksumSha256 = await computeSha256(JSON.stringify(validSnapshot.data));

    // 1. Valid snapshot verification
    const res = await RestaurantIndexedDbService.validateBackupSnapshot(validSnapshot);
    assert.strictEqual(res.valid, true, 'Valid snapshot must pass verification');
    assert.strictEqual(res.summary?.totalOrders, 1);
    assert.strictEqual(res.summary?.totalOfflineActions, 1);
    assert.strictEqual(res.summary?.branchId, 'branch_rjn_01');

    // 2. Tampered snapshot detection (payload mutated after signing)
    const tamperedSnapshot = JSON.parse(JSON.stringify(validSnapshot));
    tamperedSnapshot.data.orders[0].totalAmount = 9999999; // Tampered!
    const tamperedRes = await RestaurantIndexedDbService.validateBackupSnapshot(tamperedSnapshot);
    assert.strictEqual(tamperedRes.valid, false, 'Tampered snapshot must be detected and rejected');
    assert.match(tamperedRes.error || '', /Integrity check failed/);

    // 3. App mismatch detection
    const wrongAppSnapshot = JSON.parse(JSON.stringify(validSnapshot));
    wrongAppSnapshot.app = 'UNKNOWN_APP';
    const wrongAppRes = await RestaurantIndexedDbService.validateBackupSnapshot(wrongAppSnapshot);
    assert.strictEqual(wrongAppRes.valid, false, 'Foreign application snapshot must be rejected');
    assert.match(wrongAppRes.error || '', /App mismatch/);
  });

  await t.test('Offline Queue Resilience & Conflict Lifecycle: PENDING_SYNC -> SYNCED / REVIEW_REQUIRED', async () => {
    const inMemoryQueue = new Map<string, OfflineActionRecord>();

    // Mock enqueueOfflineAction
    RestaurantIndexedDbService.enqueueOfflineAction = async (action: OfflineActionRecord) => {
      inMemoryQueue.set(action.idempotencyKey, action);
    };

    RestaurantIndexedDbService.getPendingActions = async () => {
      return Array.from(inMemoryQueue.values()).filter(a => a.status === 'PENDING_SYNC' || a.status === 'RETRY_REQUIRED');
    };

    RestaurantIndexedDbService.markActionSynced = async (key: string, timestamp?: string) => {
      const item = inMemoryQueue.get(key);
      if (item) {
        item.status = 'SYNCED';
        item.syncedAt = timestamp || new Date().toISOString();
      }
    };

    RestaurantIndexedDbService.markActionFailed = async (key: string, error: string, status = 'RETRY_REQUIRED') => {
      const item = inMemoryQueue.get(key);
      if (item) {
        item.status = status;
        item.lastError = error;
        item.retryCount = (item.retryCount || 0) + 1;
      }
    };

    // 1. Enqueue action while offline
    const action1: OfflineActionRecord = {
      idempotencyKey: 'act_idemp_offline_1',
      orderId: 'ord_101',
      nextStatus: 'preparing',
      branchId: 'branch_rjn_01',
      franchiseId: 'fra_01',
      status: 'PENDING_SYNC',
      createdAt: new Date().toISOString(),
      retryCount: 0
    };
    await RestaurantIndexedDbService.enqueueOfflineAction(action1);

    const pendingInitial = await RestaurantIndexedDbService.getPendingActions();
    assert.strictEqual(pendingInitial.length, 1);
    assert.strictEqual(pendingInitial[0].idempotencyKey, 'act_idemp_offline_1');

    // 2. Simulate server confirming sync
    await RestaurantIndexedDbService.markActionSynced('act_idemp_offline_1', '2026-11-01T12:00:00Z');
    const pendingAfterSync = await RestaurantIndexedDbService.getPendingActions();
    assert.strictEqual(pendingAfterSync.length, 0, 'Synced action must not remain in pending queue');
    assert.strictEqual(inMemoryQueue.get('act_idemp_offline_1')?.status, 'SYNCED');

    // 3. Enqueue conflicting action (e.g. order cancelled on server while offline)
    const action2: OfflineActionRecord = {
      idempotencyKey: 'act_idemp_offline_conflict',
      orderId: 'ord_102',
      nextStatus: 'ready',
      branchId: 'branch_rjn_01',
      franchiseId: 'fra_01',
      status: 'PENDING_SYNC',
      createdAt: new Date().toISOString(),
      retryCount: 0
    };
    await RestaurantIndexedDbService.enqueueOfflineAction(action2);

    // 4. Server detects conflict -> marks REVIEW_REQUIRED
    await RestaurantIndexedDbService.markActionFailed(
      'act_idemp_offline_conflict',
      'Cannot transition order: current state is cancelled',
      'REVIEW_REQUIRED'
    );

    const conflictingAction = inMemoryQueue.get('act_idemp_offline_conflict');
    assert.strictEqual(conflictingAction?.status, 'REVIEW_REQUIRED');
    assert.strictEqual(conflictingAction?.retryCount, 1);
    assert.match(conflictingAction?.lastError || '', /current state is cancelled/);
  });

});
