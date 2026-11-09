import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  Download, 
  FileSpreadsheet, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Wifi, 
  WifiOff, 
  HardDrive, 
  Search, 
  Clock, 
  Upload,
  Layers
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { 
  RestaurantIndexedDbService, 
  OfflineActionRecord, 
  BackupRecordMeta 
} from '../services/RestaurantIndexedDbService';
import { RestaurantCsvExportService } from '../services/RestaurantCsvExportService';
import { Order } from '../types/restaurant';
import toast from 'react-hot-toast';

export const LocalDataAndBackupsPage: React.FC = () => {
  const { 
    liveOrders, 
    historicalOrders, 
    activeBranchId, 
    activeBranchName, 
    managerProfile,
    pendingOfflineActionsCount,
    lastSyncTimestamp,
    syncOfflineActions 
  } = useManagerStore();

  const [activeTab, setActiveTab] = useState<'cache' | 'queue' | 'csv' | 'snapshot'>('cache');
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cachedOrders, setCachedOrders] = useState<Order[]>([]);
  const [offlineActions, setOfflineActions] = useState<OfflineActionRecord[]>([]);
  const [backupRecords, setBackupRecords] = useState<BackupRecordMeta[]>([]);
  // const [csvRecords, setCsvRecords] = useState<CsvExportRecordMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false);
  const [snapshotVerificationResult, setSnapshotVerificationResult] = useState<{
    valid: boolean;
    error?: string;
    summary?: any;
  } | null>(null);
  const [verifiedSnapshot, setVerifiedSnapshot] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Monitor network online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Reload local IndexedDB records
  const loadLocalData = async () => {
    try {
      const orders = await RestaurantIndexedDbService.getCachedOrders(activeBranchId);
      setCachedOrders(orders);

      const actions = await RestaurantIndexedDbService.getAllActions();
      setOfflineActions(actions);

      const backups = await RestaurantIndexedDbService.getAllBackupRecords();
      setBackupRecords(backups);

      // const csvs = await RestaurantIndexedDbService.getAllCsvExportRecords();
    } catch (err) {
      console.warn('Error loading local data from IndexedDB:', err);
    }
  };

  useEffect(() => {
    loadLocalData();
  }, [activeBranchId]);

  // Combine live + historical orders for complete reporting scope
  const allAvailableOrders: Order[] = React.useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of cachedOrders) if (o.id) map.set(o.id, o);
    for (const o of historicalOrders) if (o.id) map.set(o.id, o);
    for (const o of liveOrders) if (o.id) map.set(o.id, o);
    return Array.from(map.values());
  }, [cachedOrders, historicalOrders, liveOrders]);

  // Trigger manual sync
  const handleManualSync = async () => {
    if (!isOnline) {
      toast.error('Device is currently offline. Cannot reach server.');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await syncOfflineActions();
      if (res.success) {
        toast.success(`Sync completed: ${res.synced} actions confirmed`);
      } else {
        toast.error(`Sync finished with ${res.failed} issues or server unavailable`);
      }
      await loadLocalData();
    } catch {
      toast.error('Sync request failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // CSV Export Handlers
  const handleExportOrdersCsv = async () => {
    try {
      setIsExportingCsv(true);
      const branch = activeBranchId || 'branch_rjn_01';

      if (isOnline) {
        try {
          const res = await RestaurantCsvExportService.downloadServerCsv({
            endpoint: `/api/reports/export/orders?type=combined&branchId=${branch}&format=download`,
            fallbackFilename: `olive-pizza-orders-${branch}-${new Date().toISOString().split('T')[0]}.csv`,
            branchId: branch
          });

          RestaurantIndexedDbService.saveCsvExportRecord({
            id: `csv_${Date.now()}`,
            reportType: 'ORDERS_FULL_SERVER',
            filename: res.filename || 'orders.csv',
            createdAt: new Date().toISOString(),
            rowCount: res.rowCount || 0,
            scope: { branchId: branch, franchiseId: managerProfile?.franchiseId || 'all' },
            status: 'SUCCESS'
          });
          toast.success(`Authoritative export completed: ${res.rowCount} orders downloaded from PostgreSQL`);
          loadLocalData();
          return;
        } catch (serverErr: any) {
          console.warn('[CSV Export] Backend export failed, falling back to local dataset:', serverErr.message);
          toast('Server export unavailable. Using verified local cache...', { icon: '⚠️' });
        }
      }

      // Offline fallback
      const res = RestaurantCsvExportService.exportOrdersCsv(allAvailableOrders);
      RestaurantCsvExportService.downloadCsv(res.filename, res.content);

      RestaurantIndexedDbService.saveCsvExportRecord({
        id: `csv_${Date.now()}`,
        reportType: 'ORDERS_FULL_LOCAL',
        filename: res.filename,
        createdAt: new Date().toISOString(),
        rowCount: res.rowCount,
        scope: { branchId: activeBranchId || 'branch_rjn_01', franchiseId: managerProfile?.franchiseId || 'all' },
        status: 'SUCCESS'
      });
      toast.success(`Exported ${res.rowCount} cached orders to CSV (Offline local backup)`);
      loadLocalData();
    } catch (err: any) {
      toast.error('Failed to export orders CSV: ' + err.message);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportDailySalesCsv = async () => {
    try {
      setIsExportingCsv(true);
      const branch = activeBranchId || 'branch_rjn_01';

      if (isOnline) {
        try {
          const res = await RestaurantCsvExportService.downloadServerCsv({
            endpoint: `/api/reports/export/financial?branchId=${branch}&format=download`,
            fallbackFilename: `olive-pizza-financial-summary-${branch}-${new Date().toISOString().split('T')[0]}.csv`,
            branchId: branch
          });

          RestaurantIndexedDbService.saveCsvExportRecord({
            id: `csv_${Date.now()}`,
            reportType: 'DAILY_SALES_SERVER',
            filename: res.filename || 'financial-summary.csv',
            createdAt: new Date().toISOString(),
            rowCount: res.rowCount || 0,
            scope: { branchId: branch, franchiseId: managerProfile?.franchiseId || 'all' },
            status: 'SUCCESS'
          });
          toast.success(`Authoritative daily sales exported: ${res.rowCount} records from PostgreSQL`);
          loadLocalData();
          return;
        } catch (serverErr: any) {
          console.warn('[CSV Export] Backend financial export failed, falling back to local dataset:', serverErr.message);
          toast('Server export unavailable. Using verified local cache...', { icon: '⚠️' });
        }
      }

      // Offline fallback
      const res = RestaurantCsvExportService.exportDailySalesSummaryCsv(allAvailableOrders);
      RestaurantCsvExportService.downloadCsv(res.filename, res.content);

      RestaurantIndexedDbService.saveCsvExportRecord({
        id: `csv_${Date.now()}`,
        reportType: 'DAILY_SALES_SUMMARY_LOCAL',
        filename: res.filename,
        createdAt: new Date().toISOString(),
        rowCount: res.rowCount,
        scope: { branchId: activeBranchId || 'branch_rjn_01', franchiseId: managerProfile?.franchiseId || 'all' },
        status: 'SUCCESS'
      });
      toast.success(`Exported ${res.rowCount} daily summaries to CSV (Offline local backup)`);
      loadLocalData();
    } catch (err: any) {
      toast.error('Failed to export sales CSV: ' + err.message);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportLineItemsCsv = async () => {
    try {
      setIsExportingCsv(true);
      const branch = activeBranchId || 'branch_rjn_01';

      if (isOnline) {
        try {
          const res = await RestaurantCsvExportService.downloadServerCsv({
            endpoint: `/api/reports/export/items?branchId=${branch}&format=download`,
            fallbackFilename: `olive-pizza-order-items-${branch}-${new Date().toISOString().split('T')[0]}.csv`,
            branchId: branch
          });

          RestaurantIndexedDbService.saveCsvExportRecord({
            id: `csv_${Date.now()}`,
            reportType: 'LINE_ITEMS_SERVER',
            filename: res.filename || 'order-items.csv',
            createdAt: new Date().toISOString(),
            rowCount: res.rowCount || 0,
            scope: { branchId: branch, franchiseId: managerProfile?.franchiseId || 'all' },
            status: 'SUCCESS'
          });
          toast.success(`Authoritative line items exported: ${res.rowCount} items from PostgreSQL`);
          loadLocalData();
          return;
        } catch (serverErr: any) {
          console.warn('[CSV Export] Backend items export failed, falling back to local dataset:', serverErr.message);
          toast('Server export unavailable. Using verified local cache...', { icon: '⚠️' });
        }
      }

      // Offline fallback
      const res = RestaurantCsvExportService.exportLineItemsCsv(allAvailableOrders);
      RestaurantCsvExportService.downloadCsv(res.filename, res.content);

      RestaurantIndexedDbService.saveCsvExportRecord({
        id: `csv_${Date.now()}`,
        reportType: 'LINE_ITEMS_BREAKDOWN_LOCAL',
        filename: res.filename,
        createdAt: new Date().toISOString(),
        rowCount: res.rowCount,
        scope: { branchId: activeBranchId || 'branch_rjn_01', franchiseId: managerProfile?.franchiseId || 'all' },
        status: 'SUCCESS'
      });
      toast.success(`Exported ${res.rowCount} line items to CSV (Offline local backup)`);
      loadLocalData();
    } catch (err: any) {
      toast.error('Failed to export items CSV: ' + err.message);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportOfflineAuditCsv = () => {
    try {
      setIsExportingCsv(true);
      const res = RestaurantCsvExportService.exportOfflineActionsAuditCsv(offlineActions);
      RestaurantCsvExportService.downloadCsv(res.filename, res.content);

      toast.success(`Exported ${res.rowCount} audit records to CSV`);
    } catch (err: any) {
      toast.error('Failed to export audit CSV: ' + err.message);
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Database JSON Snapshot Handlers
  const handleGenerateSnapshot = async () => {
    try {
      setIsGeneratingSnapshot(true);
      const snapshot = await RestaurantIndexedDbService.exportLocalDatabaseSnapshot({
        branchId: activeBranchId || 'branch_rjn_01',
        franchiseId: managerProfile?.franchiseId || 'all'
      });

      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `olive-pizza-restaurant-backup-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Cryptographic backup snapshot generated with SHA-256 integrity hash!');
      loadLocalData();
    } catch (err: any) {
      toast.error('Failed to create snapshot: ' + err.message);
    } finally {
      setIsGeneratingSnapshot(false);
    }
  };

  const handleSnapshotFileVerify = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await RestaurantIndexedDbService.validateBackupSnapshot(parsed);
      setSnapshotVerificationResult(result);
      if (result.valid) setVerifiedSnapshot(parsed); else setVerifiedSnapshot(null);
      if (result.valid) {
        toast.success('Backup file verified! Cryptographic checksum is valid.');
      } else {
        toast.error('Backup verification failed: ' + result.error);
      }
    } catch {
      setSnapshotVerificationResult({
        valid: false,
        error: 'The uploaded file is not a valid JSON document.'
      });
      toast.error('Invalid JSON file');
    }
  };

  const handleExecuteRestore = async (mode: 'MERGE' | 'REPLACE') => {
    if (!verifiedSnapshot) return;
    setIsRestoring(true);
    try {
      const res = await RestaurantIndexedDbService.restoreLocalDatabaseSnapshot(verifiedSnapshot, { mode });
      if (res.success) {
        toast.success(`Database successfully restored! (${res.restoredOrders} orders, ${res.restoredActions} actions)`);
        await loadLocalData();
      } else {
        toast.error(`Restore failed: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Restore error: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Filter cached orders
  const filteredOrders = allAvailableOrders.filter(order => {
    const matchesSearch = !searchQuery || 
      (order.id && order.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.orderNumber && order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.contactPhone && order.contactPhone.includes(searchQuery));

    const matchesStatus = statusFilter === 'ALL' || (order.status || '').toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. Header & Operational Status Banner */}
      <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#57854d]/20 border border-[#57854d]/40 flex items-center justify-center text-[#10b981]">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">Local Data & Backups</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#141b16] border border-[#26332a] text-[#c6a052]">
                  {activeBranchName || 'Rajnandgaon HQ'}
                </span>
              </div>
              <p className="text-xs text-[#a4c29c]">
                Durable client storage, offline queue synchronization, and RFC 4180 CSV exports
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Live Connection Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
              isOnline 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>ONLINE</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>OFFLINE MODE</span>
                </>
              )}
            </div>

            {/* Pending Sync Badge */}
            {pendingOfflineActionsCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>{pendingOfflineActionsCount} Pending Sync</span>
              </div>
            )}

            {/* Sync Now Button */}
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#57854d] hover:bg-[#689f5c] disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-green-950/40 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        </div>

        {/* Sync Metadata Subheader */}
        <div className="mt-4 pt-3 border-t border-[#26332a]/60 flex flex-wrap items-center justify-between text-[11px] text-[#7ba372] gap-2">
          <div className="flex items-center gap-4">
            <span>Durable Store: <strong className="text-white font-mono">IndexedDB ({RestaurantIndexedDbService ? 'Active' : 'N/A'})</strong></span>
            <span>Cached Orders: <strong className="text-white">{allAvailableOrders.length}</strong></span>
            <span>Queued Actions: <strong className="text-white">{offlineActions.length}</strong></span>
          </div>
          <div>
            Last Server Sync: <strong className="text-[#c6a052] font-mono">{lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleTimeString() : 'Not yet synced'}</strong>
          </div>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex border-b border-[#26332a] gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('cache')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'cache'
              ? 'bg-[#57854d] text-white'
              : 'text-[#a4c29c] hover:text-white hover:bg-[#141b16]'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Local Orders Cache</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/40 font-mono">
            {allAvailableOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'queue'
              ? 'bg-[#57854d] text-white'
              : 'text-[#a4c29c] hover:text-white hover:bg-[#141b16]'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Offline Action Queue</span>
          {pendingOfflineActionsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-black font-mono font-bold">
              {pendingOfflineActionsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('csv')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'csv'
              ? 'bg-[#57854d] text-white'
              : 'text-[#a4c29c] hover:text-white hover:bg-[#141b16]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Readable CSV Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('snapshot')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'snapshot'
              ? 'bg-[#57854d] text-white'
              : 'text-[#a4c29c] hover:text-white hover:bg-[#141b16]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Database Snapshots & Integrity</span>
        </button>
      </div>

      {/* 3. Tab Contents */}

      {/* TAB A: LOCAL ORDERS CACHE */}
      {activeTab === 'cache' && (
        <div className="space-y-4">
          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0d120f] border border-[#26332a] p-3 rounded-xl">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search order no, customer, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#141b16] border border-[#26332a] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-[#57854d]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-[#7ba372]">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-[#141b16] border border-[#26332a] rounded-lg text-xs text-white focus:outline-hidden"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#141b16] text-[#7ba372] border-b border-[#26332a] uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Order Number</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Source / Type</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26332a]/50 text-zinc-300">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-zinc-500">
                        No cached orders found in local storage.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.slice(0, 50).map((order) => (
                      <tr key={order.id} className="hover:bg-[#141b16]/50 transition">
                        <td className="p-3 font-mono font-bold text-white">
                          {order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-white">{order.customerName || 'Walk-in Guest'}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{order.contactPhone || '—'}</div>
                        </td>
                        <td className="p-3">
                          <span className="text-zinc-400">
                            {Array.isArray(order.items) ? order.items.length : 0} items
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-[#10b981]">
                          ₹{Number(order.totalAmount || 0).toFixed(2)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            order.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            order.status === 'preparing' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            order.status === 'ready' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            order.status === 'cancelled' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            'bg-zinc-800 text-zinc-300'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-3 capitalize text-zinc-400">
                          {order.fulfillmentType || 'dine_in'}
                        </td>
                        <td className="p-3 text-[10px] text-zinc-500">
                          {order.createdAt instanceof Date ? order.createdAt.toLocaleTimeString() : String(order.createdAt || '').slice(11, 19)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB B: OFFLINE ACTIONS QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Durable Offline Actions Queue</h2>
                <p className="text-xs text-[#7ba372]">
                  Status transitions created while offline are securely queued in IndexedDB and sent automatically when connectivity resumes.
                </p>
              </div>

              {offlineActions.length > 0 && (
                <button
                  onClick={handleExportOfflineAuditCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141b16] border border-[#26332a] text-xs font-bold text-amber-400 hover:text-amber-300 hover:border-amber-500/50 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Audit CSV</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#141b16] text-[#7ba372] border-b border-[#26332a] uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Idempotency Key</th>
                    <th className="p-3">Order ID / No</th>
                    <th className="p-3">Target Status</th>
                    <th className="p-3">Sync Status</th>
                    <th className="p-3">Retries</th>
                    <th className="p-3">Enqueued At</th>
                    <th className="p-3">Synced At / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26332a]/50 text-zinc-300">
                  {offlineActions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-zinc-500">
                        No offline actions currently queued. All actions are synchronized with the central database.
                      </td>
                    </tr>
                  ) : (
                    offlineActions.map((act) => (
                      <tr key={act.idempotencyKey} className="hover:bg-[#141b16]/50 transition">
                        <td className="p-3 font-mono text-[10px] text-zinc-400">
                          {act.idempotencyKey}
                        </td>
                        <td className="p-3 font-mono font-bold text-white">
                          {act.orderSummary?.orderNumber || act.orderId}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold uppercase text-[10px]">
                            {act.nextStatus}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            act.status === 'SYNCED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            act.status === 'PENDING_SYNC' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' :
                            act.status === 'REVIEW_REQUIRED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            'bg-zinc-800 text-zinc-400'
                          }`}>
                            {act.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-center">
                          {act.retryCount || 0}
                        </td>
                        <td className="p-3 text-[10px] text-zinc-500 font-mono">
                          {new Date(act.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-[10px]">
                          {act.syncedAt ? (
                            <span className="text-emerald-400 font-mono">{new Date(act.syncedAt).toLocaleTimeString()}</span>
                          ) : act.lastError ? (
                            <span className="text-rose-400 truncate max-w-xs block" title={act.lastError}>{act.lastError}</span>
                          ) : (
                            <span className="text-zinc-500">Awaiting sync</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB C: READABLE CSV REPORTS */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Full Orders CSV */}
            <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-[#57854d]/50 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Full Orders Export</h3>
                <p className="text-xs text-[#7ba372]">
                  Complete order transactions including customer info, item summaries, financial totals, taxes, delivery fees, and order statuses.
                </p>
              </div>
              <div className="pt-2 border-t border-[#26332a]">
                <button
                  onClick={handleExportOrdersCsv}
                  disabled={isExportingCsv}
                  className="w-full py-2.5 rounded-xl bg-[#57854d] hover:bg-[#689f5c] text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Orders CSV ({allAvailableOrders.length})</span>
                </button>
              </div>
            </div>

            {/* 2. Daily Sales Summary CSV */}
            <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-[#57854d]/50 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Daily Sales Summary</h3>
                <p className="text-xs text-[#7ba372]">
                  Aggregated daily sales figures: total orders, delivered vs cancelled, gross revenue, collected taxes, delivery fees, and average ticket size.
                </p>
              </div>
              <div className="pt-2 border-t border-[#26332a]">
                <button
                  onClick={handleExportDailySalesCsv}
                  disabled={isExportingCsv}
                  className="w-full py-2.5 rounded-xl bg-[#57854d] hover:bg-[#689f5c] text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Daily Sales CSV</span>
                </button>
              </div>
            </div>

            {/* 3. Detailed Line Items CSV */}
            <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-[#57854d]/50 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Item-Level Breakdown</h3>
                <p className="text-xs text-[#7ba372]">
                  Granular item-level reporting with pizza sizes, crust selections, paid addons, unit prices, quantities, and line item totals.
                </p>
              </div>
              <div className="pt-2 border-t border-[#26332a]">
                <button
                  onClick={handleExportLineItemsCsv}
                  disabled={isExportingCsv}
                  className="w-full py-2.5 rounded-xl bg-[#57854d] hover:bg-[#689f5c] text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Line Items CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* RFC 4180 & CWE-1236 Security Guarantee Callout */}
          <div className="p-4 rounded-xl bg-[#141b16] border border-[#26332a] text-xs text-[#a4c29c] space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Spreadsheet Compatibility & Formula Injection Safety (CWE-1236)</span>
            </div>
            <p>
              All exported CSV files strictly follow RFC 4180 specifications with standard CRLF record terminators. Dangerous spreadsheet macro execution triggers (starting with =, @, +, -) are sanitized with defensive single-quote prefixes while preserving negative currency literals and pure numbers.
            </p>
          </div>
        </div>
      )}

      {/* TAB D: DATABASE SNAPSHOTS & INTEGRITY */}
      {activeTab === 'snapshot' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Generate Snapshot Card */}
            <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Export Local Database Snapshot</h3>
                  <p className="text-xs text-[#7ba372]">
                    Generates a complete JSON backup containing all cached orders, offline actions, and audit records with a SHA-256 cryptographic checksum.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[#26332a]">
                <button
                  onClick={handleGenerateSnapshot}
                  disabled={isGeneratingSnapshot}
                  className="w-full py-2.5 rounded-xl bg-[#57854d] hover:bg-[#689f5c] text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isGeneratingSnapshot ? 'Generating...' : 'Create & Download Backup Snapshot'}</span>
                </button>
              </div>
            </div>

            {/* Verify Backup File Card */}
            <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Verify Backup Snapshot Integrity</h3>
                  <p className="text-xs text-[#7ba372]">
                    Upload an existing backup file to inspect its integrity, verify cryptographic signatures, and detect any file tampering before recovery.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[#26332a]">
                <label className="w-full py-2.5 px-4 rounded-xl bg-[#141b16] hover:bg-[#1a231d] border border-[#26332a] text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition">
                  <Search className="w-4 h-4 text-[#c6a052]" />
                  <span>Select Backup File to Verify</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleSnapshotFileVerify}
                    className="hidden"
                  />
                </label>
              </div>

              {snapshotVerificationResult && (
                <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                  snapshotVerificationResult.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {snapshotVerificationResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>{snapshotVerificationResult.valid ? 'Cryptographic Integrity Passed' : 'Verification Failed'}</span>
                  </div>

                  {snapshotVerificationResult.valid ? (
                    <>
                      <div className="text-[11px] space-y-1 font-mono text-zinc-300">
                        <div>Total Orders: <strong>{snapshotVerificationResult.summary?.totalOrders}</strong></div>
                        <div>Queued Actions: <strong>{snapshotVerificationResult.summary?.totalOfflineActions}</strong></div>
                        <div>Branch ID: <strong>{snapshotVerificationResult.summary?.branchId}</strong></div>
                        <div className="truncate text-zinc-500">Hash: {snapshotVerificationResult.summary?.checksum}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-500/20">
                        <button
                          onClick={() => handleExecuteRestore('MERGE')}
                          disabled={isRestoring}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                          <span>Restore & Merge</span>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('WARNING: Replace mode will clear existing orders and offline queue before restoring. Are you sure you want to proceed?')) {
                              handleExecuteRestore('REPLACE');
                            }
                          }}
                          disabled={isRestoring}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-300 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 border border-zinc-700 cursor-pointer"
                        >
                          <HardDrive className="w-3.5 h-3.5 text-rose-400" />
                          <span>Replace All Records</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs">{snapshotVerificationResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Backup History Table */}
          <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3">Recent Backup Audit Registry</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#141b16] text-[#7ba372] border-b border-[#26332a] uppercase font-bold text-[10px]">
                  <tr>
                    <th className="p-3">Filename</th>
                    <th className="p-3">Record Count</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">SHA-256 Checksum</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26332a]/50 text-zinc-300">
                  {backupRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-zinc-500">
                        No backup records registered yet. Generate a snapshot above to record your first backup.
                      </td>
                    </tr>
                  ) : (
                    backupRecords.map((bkp) => (
                      <tr key={bkp.id} className="hover:bg-[#141b16]/50 transition">
                        <td className="p-3 font-mono font-bold text-white">{bkp.filename}</td>
                        <td className="p-3 font-mono">{bkp.recordCount} records</td>
                        <td className="p-3 font-mono">{(bkp.sizeBytes / 1024).toFixed(1)} KB</td>
                        <td className="p-3 font-mono text-[10px] text-zinc-500 truncate max-w-xs">{bkp.checksumSha256}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {bkp.status}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-zinc-500">{new Date(bkp.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
