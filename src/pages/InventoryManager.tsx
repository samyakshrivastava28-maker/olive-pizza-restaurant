import React, { useState, useEffect } from 'react';
import {
  Boxes,
  AlertTriangle,
  Plus,
  Search,
  RefreshCw,
  PackageCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchApi } from '../lib/api';
import { useManagerStore } from '../store/managerStore';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentQuantity: number;
  minThreshold: number;
  costPerUnit?: number;
  supplierName?: string;
  supplierPhone?: string;
  notes?: string;
  isActive: boolean;
  branchId: string;
  updatedAt?: string;
}

export function InventoryManager() {
  const { activeBranchId, activeBranchName } = useManagerStore();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'RESTOCK' | 'USAGE' | 'WASTAGE'>('RESTOCK');
  const [adjustReason, setAdjustReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New Item Form State
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'dairy',
    unit: 'kg',
    currentQuantity: '',
    minThreshold: '10',
    costPerUnit: '',
    supplierName: '',
    supplierPhone: '',
    notes: '',
  });

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`/api/inventory?branchId=${activeBranchId || 'main_branch'}`);
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (err: any) {
      console.warn('[Inventory] Load error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [activeBranchId]);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !adjustQty) return;

    const qtyNumber = Number(adjustQty);
    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      toast.error('Please enter a valid positive quantity');
      return;
    }

    const delta = adjustType === 'RESTOCK' ? qtyNumber : -qtyNumber;
    setSubmitting(true);
    const toastId = toast.loading('Recording stock adjustment...');

    try {
      const res = await fetchApi('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selectedItem.id,
          branchId: activeBranchId || 'main_branch',
          adjustmentType: adjustType,
          quantityChanged: delta,
          reason: adjustReason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(
          `Stock updated! New quantity: ${data.item?.currentQuantity} ${selectedItem.unit}`,
          { id: toastId }
        );
        setShowAdjustModal(false);
        setAdjustQty('');
        setAdjustReason('');
        loadInventory();
      } else {
        toast.error('Failed: ' + (data.error || 'Server error'), { id: toastId });
      }
    } catch (err: any) {
      toast.error('Adjustment failed: ' + err.message, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) {
      toast.error('Item name is required');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Adding inventory item...');

    try {
      const res = await fetchApi('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          currentQuantity: Number(newItem.currentQuantity) || 0,
          minThreshold: Number(newItem.minThreshold) || 10,
          costPerUnit: Number(newItem.costPerUnit) || 0,
          branchId: activeBranchId || 'main_branch',
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`"${data.item.name}" added to inventory!`, { id: toastId });
        setShowAddModal(false);
        setNewItem({
          name: '',
          category: 'dairy',
          unit: 'kg',
          currentQuantity: '',
          minThreshold: '10',
          costPerUnit: '',
          supplierName: '',
          supplierPhone: '',
          notes: '',
        });
        loadInventory();
      } else {
        toast.error('Failed: ' + (data.error || 'Server error'), { id: toastId });
      }
    } catch (err: any) {
      toast.error('Failed to create: ' + err.message, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || item.category === filterCat;
    const matchLow = !onlyLowStock || item.currentQuantity <= item.minThreshold;
    return matchSearch && matchCat && matchLow;
  });

  const lowStockCount = items.filter((i) => i.currentQuantity <= i.minThreshold).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d120f] p-5 rounded-2xl border border-[#26332a] shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Raw Materials & Kitchen Inventory
            </h1>
            {lowStockCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" /> {lowStockCount} Low Stock
              </span>
            )}
          </div>
          <p className="text-xs text-[#a4c29c] mt-0.5">
            Pantry supplies, real-time stock levels, and automated replenishment alerts for branch operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadInventory}
            disabled={loading}
            className="p-2.5 rounded-xl bg-[#141b16] hover:bg-[#1a241e] border border-[#26332a] text-[#a4c29c] hover:text-white text-xs transition-all"
            title="Refresh Inventory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#57854d] hover:bg-[#689e5c] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-green-950/40 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-4 shadow-md">
          <div className="text-[11px] font-bold text-[#7ba372] uppercase">Total Tracked Items</div>
          <div className="text-2xl font-extrabold text-white font-mono mt-2">{items.length}</div>
          <div className="text-[10px] text-[#a4c29c] mt-1">Active pantry catalog</div>
        </div>

        <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-4 shadow-md">
          <div className="text-[11px] font-bold text-[#7ba372] uppercase">Low-Stock Warnings</div>
          <div className={`text-2xl font-extrabold font-mono mt-2 ${lowStockCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {lowStockCount}
          </div>
          <div className="text-[10px] text-[#a4c29c] mt-1">Below minimum threshold</div>
        </div>

        <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-4 shadow-md">
          <div className="text-[11px] font-bold text-[#7ba372] uppercase">Operating Branch</div>
          <div className="text-sm font-extrabold text-white font-mono mt-2 truncate">
            {activeBranchName || activeBranchId || 'Rajnandgaon HQ'}
          </div>
          <div className="text-[10px] text-[#c6a052] mt-1">Isolated branch pantry</div>
        </div>

        <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl p-4 shadow-md">
          <div className="text-[11px] font-bold text-[#7ba372] uppercase">Alert Dispatch</div>
          <div className="text-sm font-extrabold text-emerald-400 mt-2 flex items-center gap-1.5">
            <PackageCheck className="w-4 h-4" /> Live Auto-Trigger
          </div>
          <div className="text-[10px] text-[#a4c29c] mt-1">Sent to Store & Franchise</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0d120f] p-3.5 rounded-2xl border border-[#26332a]">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7ba372]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search raw materials by name..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#141b16] border border-[#26332a] text-xs text-white placeholder-[#7ba372] focus:outline-none focus:border-[#57854d]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#141b16] border border-[#26332a] text-xs text-[#a4c29c] font-bold focus:outline-none focus:border-[#57854d]"
          >
            <option value="all">All Categories</option>
            <option value="dairy">Dairy & Cheese</option>
            <option value="flour_dough">Flour & Dough</option>
            <option value="sauces_seasonings">Sauces & Seasonings</option>
            <option value="toppings_produce">Toppings & Produce</option>
            <option value="packaging">Packaging Boxes</option>
            <option value="beverages_mix">Beverages & Mixes</option>
          </select>

          <button
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              onlyLowStock
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-[#141b16] text-[#a4c29c] border border-[#26332a] hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Stock Only</span>
          </button>
        </div>
      </div>

      <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="text-center py-16 text-[#a4c29c] text-xs space-y-2">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-[#57854d]" />
            <p>Loading pantry inventory levels...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-[#7ba372] text-xs space-y-2">
            <Boxes className="w-8 h-8 mx-auto opacity-50" />
            <p>No inventory items match your search filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#a4c29c]">
              <thead className="bg-[#141b16] border-b border-[#26332a] text-[#7ba372] uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Item Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4 text-right">In Stock</th>
                  <th className="py-3.5 px-4 text-right">Min Threshold</th>
                  <th className="py-3.5 px-4">Supplier / Contact</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#26332a]">
                {filteredItems.map((item) => {
                  const isLow = item.currentQuantity <= item.minThreshold;
                  return (
                    <tr key={item.id} className="hover:bg-[#141b16]/60 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">
                        <div>{item.name}</div>
                        {item.notes && <div className="text-[10px] text-[#7ba372]">{item.notes}</div>}
                      </td>
                      <td className="py-3.5 px-4 capitalize font-mono text-[11px] text-[#7ba372]">
                        {item.category.replace('_', ' ')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-sm text-white">
                        {item.currentQuantity} <span className="text-[10px] text-[#7ba372] font-normal">{item.unit}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-[11px] text-[#7ba372]">
                        {item.minThreshold} {item.unit}
                      </td>
                      <td className="py-3.5 px-4 text-[11px]">
                        {item.supplierName ? (
                          <div>
                            <div className="font-bold text-white">{item.supplierName}</div>
                            <div className="text-[10px] text-[#7ba372]">{item.supplierPhone || '-'}</div>
                          </div>
                        ) : (
                          <span className="text-[#7ba372]">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isLow ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 border border-rose-500/40 text-rose-400">
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                            OPTIMAL
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setShowAdjustModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#141b16] hover:bg-[#57854d] text-white text-[11px] font-bold border border-[#26332a] hover:border-[#57854d] transition-all"
                        >
                          Adjust Stock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdjustModal && selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#26332a] pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">Adjust Stock: {selectedItem.name}</h3>
                <p className="text-[11px] text-[#a4c29c]">
                  Current on-hand: <strong className="text-white font-mono">{selectedItem.currentQuantity} {selectedItem.unit}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-[#7ba372] hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#a4c29c] mb-1.5">Action Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['RESTOCK', 'USAGE', 'WASTAGE'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAdjustType(t)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        adjustType === t
                          ? t === 'RESTOCK'
                            ? 'bg-[#57854d] text-white border-[#7ba372]'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-[#141b16] text-[#7ba372] border-[#26332a] hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#a4c29c] mb-1">
                  Quantity ({selectedItem.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder={`e.g. 5 ${selectedItem.unit}`}
                  className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#57854d] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#a4c29c] mb-1">Reason / Shift Notes</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Supplier delivery or shift usage"
                  className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#57854d]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#26332a]">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 bg-[#141b16] hover:bg-[#1a241e] text-[#a4c29c] rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#57854d] hover:bg-[#689e5c] text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d120f] border border-[#26332a] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#26332a] pb-3">
              <h3 className="text-sm font-extrabold text-white">Add Raw Material to Pantry</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#7ba372] hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#a4c29c] mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Fresh Basil Leaves"
                  className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#57854d]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#a4c29c] mb-1">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#57854d]"
                  >
                    <option value="dairy">Dairy & Cheese</option>
                    <option value="flour_dough">Flour & Dough</option>
                    <option value="sauces_seasonings">Sauces & Seasonings</option>
                    <option value="toppings_produce">Toppings & Produce</option>
                    <option value="packaging">Packaging</option>
                    <option value="beverages_mix">Beverages</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#a4c29c] mb-1">Unit of Measure</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#57854d]"
                  >
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                    <option value="L">Liters (L)</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="boxes">Boxes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#a4c29c] mb-1">Initial Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newItem.currentQuantity}
                    onChange={(e) => setNewItem({ ...newItem, currentQuantity: e.target.value })}
                    placeholder="0"
                    className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#57854d] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#a4c29c] mb-1">Low-Stock Warning *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newItem.minThreshold}
                    onChange={(e) => setNewItem({ ...newItem, minThreshold: e.target.value })}
                    placeholder="10"
                    className="w-full bg-[#141b16] border border-[#26332a] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#57854d] font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#26332a]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[#141b16] hover:bg-[#1a241e] text-[#a4c29c] rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#57854d] hover:bg-[#689e5c] text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
