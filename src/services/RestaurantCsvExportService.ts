/**
 * RestaurantCsvExportService.ts — Spreadsheet-Compatible CSV Reporting Engine for Restaurant Management
 *
 * Requirements:
 * 1. RFC 4180 spreadsheet-compatible CSV formatting (CRLF line breaks, quote escaping).
 * 2. CWE-1236 Formula Injection Mitigation:
 *    Prepends single quote (') to cells starting with '=', '+', '-', '@', '\t', '\r',
 *    while strictly preserving negative numbers and valid numeric literals.
 * 3. Consistent column names, ISO date formatting, and decimal money formatting.
 * 4. Safe browser blob trigger.
 */

import { Order } from '../types/restaurant';
import { OfflineActionRecord } from './RestaurantIndexedDbService';

export interface CsvExportResult {
  filename: string;
  content: string;
  rowCount: number;
}

export class RestaurantCsvExportService {
  /**
   * Sanitizes a cell value for CSV output:
   * - Prevents CSV formula injection (CSV Injection / CWE-1236).
   * - Escapes quotes, commas, and newlines per RFC 4180.
   * - Strictly preserves native negative numbers (e.g. -50.00, -12.5) and valid numeric strings.
   */
  public static sanitizeCell(val: any): string {
    if (val === null || val === undefined) {
      return '';
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    // Fast-path: If value is a native number, preserve as-is (e.g. -50.00, 100, 0)
    if (typeof val === 'number') {
      return Number.isFinite(val) ? String(val) : '';
    }

    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    const trimmed = str.trim();

    // Preserve valid numeric strings (including negative numbers and decimal points)
    // Examples: "-50.00", "+12.5", "0.00", "-0.99", "1250"
    const isPureNumeric = !isNaN(Number(trimmed)) && /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);

    if (!isPureNumeric) {
      // Formula Injection Mitigation (CWE-1236):
      // Dangerous leading characters: =, @, \t, \r, or + / - when NOT part of a valid numeric literal
      const dangerousChars = ['=', '@', '\t', '\r'];
      if (
        str.length > 0 &&
        (dangerousChars.includes(str[0]) ||
         ((str[0] === '+' || str[0] === '-') && !isPureNumeric))
      ) {
        str = `'${str}`;
      }
    }

    // RFC 4180 escaping: If value contains comma, double-quote, or newline, wrap in double quotes
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Build RFC 4180 CRLF separated CSV text.
   */
  public static buildCsv(headers: string[], rows: any[][]): string {
    const headerLine = headers.map(h => this.sanitizeCell(h)).join(',');
    const bodyLines = rows.map(row => row.map(cell => this.sanitizeCell(cell)).join(','));
    return [headerLine, ...bodyLines].join('\r\n');
  }

  /**
   * Trigger safe client download of generated CSV.
   */
  public static downloadCsv(filename: string, content: string): void {
    if (typeof window === 'undefined' || !window.document) return;

    // Detect Capacitor native platform (Android/iOS)
    const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform && (window as any).Capacitor.isNativePlatform());
    if (isCapacitorNative) {
      console.info('[RestaurantCsvExportService] Native Capacitor platform detected. Blob download initiated; native device filesystem access is handled via @capacitor/filesystem when provisioned.');
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * 1. Export Orders Table to CSV
   */
  public static exportOrdersCsv(orders: Order[]): CsvExportResult {
    const headers = [
      'Order ID',
      'Order Number',
      'Daily Token No',
      'Customer Name',
      'Contact Phone',
      'Customer Email',
      'Fulfillment Type',
      'Table Number',
      'Status',
      'Item Count',
      'Items Summary',
      'Subtotal (INR)',
      'Taxes (INR)',
      'Delivery Fee (INR)',
      'Packaging Charge (INR)',
      'Discount (INR)',
      'Total Amount (INR)',
      'Payment Method',
      'Payment Status',
      'Delivery Partner',
      'Delivery Partner Phone',
      'Created At',
      'Delivered At',
      'Cancelled Reason'
    ];

    const rows = (orders || []).map(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsSummary = items
        .map(i => `${i.quantity}x ${i.name}${i.size ? ` (${i.size})` : ''}`)
        .join('; ');
      const totalItems = items.reduce((acc, i) => acc + (i.quantity || 1), 0);

      const createdDate = order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt || '');
      const deliveredDate = order.deliveredAt ? String(order.deliveredAt) : '';

      return [
        order.id,
        order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`,
        order.dailyOrderNumber !== undefined ? String(order.dailyOrderNumber) : '',
        order.customerName || 'Guest',
        order.contactPhone || '',
        order.customerEmail || '',
        order.fulfillmentType || 'dine_in',
        order.tableNumber || '',
        (order.status || 'pending').toUpperCase(),
        totalItems,
        itemsSummary,
        Number(order.subtotal || 0).toFixed(2),
        Number(order.taxes || 0).toFixed(2),
        Number(order.deliveryFee || 0).toFixed(2),
        Number(order.packagingCharge || 0).toFixed(2),
        Number(order.discountAmount || 0).toFixed(2),
        Number(order.totalAmount || 0).toFixed(2),
        String(order.paymentMethod || 'CASH'),
        String(order.paymentStatus || 'PAID'),
        order.deliveryPartnerName || '',
        order.deliveryPartnerPhone || '',
        createdDate,
        deliveredDate,
        order.cancellationReason || order.rejectionReason || ''
      ];
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-orders-${dateStr}.csv`;
    const content = this.buildCsv(headers, rows);

    return { filename, content, rowCount: rows.length };
  }

  /**
   * 2. Export Daily Sales Summary Report
   */
  public static exportDailySalesSummaryCsv(orders: Order[]): CsvExportResult {
    const headers = [
      'Date',
      'Total Orders',
      'Delivered / Completed',
      'Active / In-Flight',
      'Cancelled / Rejected',
      'Gross Sales (INR)',
      'Taxes Collected (INR)',
      'Delivery Fees (INR)',
      'Discounts Given (INR)',
      'Net Revenue (INR)',
      'Average Order Value (INR)'
    ];

    // Group orders by date (YYYY-MM-DD)
    const map = new Map<string, {
      total: number;
      completed: number;
      active: number;
      cancelled: number;
      gross: number;
      taxes: number;
      deliveryFees: number;
      discounts: number;
      net: number;
    }>();

    for (const o of orders || []) {
      let dStr = 'Unknown';
      if (o.createdAt instanceof Date) {
        dStr = o.createdAt.toISOString().split('T')[0];
      } else if (typeof o.createdAt === 'string') {
        dStr = o.createdAt.split('T')[0];
      }

      const cur = map.get(dStr) || {
        total: 0,
        completed: 0,
        active: 0,
        cancelled: 0,
        gross: 0,
        taxes: 0,
        deliveryFees: 0,
        discounts: 0,
        net: 0
      };

      cur.total += 1;
      const st = (o.status || '').toLowerCase();
      if (st === 'delivered') {
        cur.completed += 1;
        const total = Number(o.totalAmount || 0);
        const tax = Number(o.taxes || 0);
        const delFee = Number(o.deliveryFee || 0);
        const disc = Number(o.discountAmount || 0);

        cur.gross += total;
        cur.taxes += tax;
        cur.deliveryFees += delFee;
        cur.discounts += disc;
        cur.net += (total - tax - delFee);
      } else if (st === 'cancelled' || st === 'rejected') {
        cur.cancelled += 1;
      } else {
        cur.active += 1;
      }

      map.set(dStr, cur);
    }

    const rows: any[][] = [];
    for (const [date, val] of map.entries()) {
      const aov = val.completed > 0 ? (val.gross / val.completed).toFixed(2) : '0.00';
      rows.push([
        date,
        val.total,
        val.completed,
        val.active,
        val.cancelled,
        val.gross.toFixed(2),
        val.taxes.toFixed(2),
        val.deliveryFees.toFixed(2),
        val.discounts.toFixed(2),
        val.net.toFixed(2),
        aov
      ]);
    }

    // Sort descending by date
    rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-daily-sales-${dateStr}.csv`;
    const content = this.buildCsv(headers, rows);

    return { filename, content, rowCount: rows.length };
  }

  /**
   * 3. Export Detailed Line Items Breakdown
   */
  public static exportLineItemsCsv(orders: Order[]): CsvExportResult {
    const headers = [
      'Order ID',
      'Order Number',
      'Item Name',
      'Size / Variant',
      'Crust',
      'Addons',
      'Unit Price (INR)',
      'Quantity',
      'Line Total (INR)',
      'Customer Name',
      'Order Status',
      'Created At'
    ];

    const rows: any[][] = [];
    for (const order of orders || []) {
      const items = Array.isArray(order.items) ? order.items : [];
      const orderNo = order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`;
      const createdDate = order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt || '');

      for (const item of items) {
        const addonsStr = Array.isArray(item.addons) ? item.addons.map(a => a.name).join('; ') : '';
        const unitPrice = Number(item.price || 0);
        const qty = Number(item.quantity || 1);
        const lineTotal = unitPrice * qty;

        rows.push([
          order.id,
          orderNo,
          item.name || 'Pizza Item',
          item.size || item.variant || 'Regular',
          item.crust || 'Pan',
          addonsStr,
          unitPrice.toFixed(2),
          qty,
          lineTotal.toFixed(2),
          order.customerName || 'Guest',
          (order.status || 'pending').toUpperCase(),
          createdDate
        ]);
      }
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-line-items-${dateStr}.csv`;
    const content = this.buildCsv(headers, rows);

    return { filename, content, rowCount: rows.length };
  }

  /**
   * 4. Export Offline Synchronization Audit Log
   */
  public static exportOfflineActionsAuditCsv(actions: OfflineActionRecord[]): CsvExportResult {
    const headers = [
      'Action Idempotency Key',
      'Order ID',
      'Order Number',
      'Customer Name',
      'Order Total (INR)',
      'Target Status',
      'Branch ID',
      'Sync Status',
      'Retry Count',
      'Enqueued Timestamp',
      'Synced Timestamp',
      'Last Error Details'
    ];

    const rows = (actions || []).map(action => [
      action.idempotencyKey,
      action.orderId,
      action.orderSummary?.orderNumber || '',
      action.orderSummary?.customerName || '',
      action.orderSummary?.totalAmount !== undefined ? Number(action.orderSummary.totalAmount).toFixed(2) : '',
      action.nextStatus,
      action.branchId,
      action.status,
      action.retryCount || 0,
      action.createdAt,
      action.syncedAt || '',
      action.lastError || ''
    ]);

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-offline-actions-audit-${dateStr}.csv`;
    const content = this.buildCsv(headers, rows);

    return { filename, content, rowCount: rows.length };
  }
}
