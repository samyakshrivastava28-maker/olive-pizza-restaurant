import React, { useState, useEffect } from 'react';
import { 
  Search, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Sliders, 
  Plus, 
  Check, 
  X
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';

export const MenuManagementPage: React.FC = () => {
  const { managerProfile } = useManagerStore();
  const branchId = managerProfile?.branchId || 'main_branch';
  const branchName = managerProfile?.branchName || 'Rajnandgaon (HQ)';
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isLocalProductModal, setIsLocalProductModal] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localCategory, setLocalCategory] = useState('Local Specials');
  const [localPrice, setLocalPrice] = useState('399');
  const [localDesc, setLocalDesc] = useState('');

  const loadMenuManagement = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/menu/branch/${branchId}/management`), {
        headers: { 'Authorization': 'Bearer test-manager-token' }
      });
      const data = await res.json();
      if (data.success && data.products) {
        setProducts(data.products);
      }
    } catch (err: any) {
      console.warn('[MenuManagementPage] Error loading management menu:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenuManagement();
  }, [branchId]);

  const handleToggleProduct = async (product: any) => {
    const nextState = !product.isEnabledForBranch;
    const toastId = toast.loading((nextState ? 'Enabling ' : 'Disabling ') + product.name + '...');
    try {
      const res = await fetch(getApiUrl(`/api/menu/branch/${branchId}/toggle`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-manager-token' },
        body: JSON.stringify({ productId: product.id, isEnabled: nextState })
      });
      const data = await res.json();
      if (data.success) {
        setProducts(products.map(p => p.id === product.id ? { ...p, isEnabledForBranch: nextState } : p));
        toast.success(product.name + ' is now ' + (nextState ? 'ENABLED' : 'DISABLED') + ' for ' + branchName, { id: toastId });
      } else {
        toast.error(data.error || 'Failed to update', { id: toastId });
      }
    } catch (err: any) {
      toast.error('Network error', { id: toastId });
    }
  };

  const handleSaveCustomizations = async () => {
    if (!selectedProduct) return;
    const toastId = toast.loading('Saving branch customization rules...');
    try {
      const res = await fetch(getApiUrl(`/api/menu/branch/${branchId}/customizations`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-manager-token' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          allowedSizes: selectedProduct.selectedSizes,
          allowedCrusts: selectedProduct.selectedCrusts,
          allowedAddons: selectedProduct.selectedAddons,
          channelAvailability: selectedProduct.channelAvailability
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Customization rules saved!', { id: toastId });
        setIsCustomizing(false);
        loadMenuManagement();
      } else {
        toast.error(data.error || 'Failed to save', { id: toastId });
      }
    } catch (err: any) {
      toast.error('Network error', { id: toastId });
    }
  };

  const handleCreateLocalProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Creating local physical-only item...');
    try {
      const res = await fetch(getApiUrl(`/api/menu/branch/${branchId}/local-product`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-manager-token' },
        body: JSON.stringify({
          name: localName.trim(),
          category: localCategory,
          price: Number(localPrice),
          description: localDesc.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Local item created (Dine-In/Takeaway only)!', { id: toastId });
        setIsLocalProductModal(false);
        setLocalName('');
        setLocalDesc('');
        loadMenuManagement();
      } else {
        toast.error(data.error || 'Failed to create', { id: toastId });
      }
    } catch (err: any) {
      toast.error('Network error', { id: toastId });
    }
  };

  const categories = ['ALL', ...Array.from(new Set(products.map(p => p.category)))];
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Branch Menu & Customization Management</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#57854d]/20 text-[#7ba372] border border-[#57854d]/40">
              {branchName}
            </span>
          </div>
          <p className="text-xs text-[#8a9e8f] mt-1">
            Select which Owner master products are enabled at this branch, configure supported sizes/crusts, and manage physical-only counter specials
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsLocalProductModal(true)}
            className="px-3.5 py-2 bg-[#57854d] hover:bg-[#689d5c] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Restaurant-Only Item</span>
          </button>
          <button
            onClick={loadMenuManagement}
            disabled={loading}
            className="p-2.5 bg-[#141b16] hover:bg-[#1c261f] border border-[#26332a] text-[#8a9e8f] rounded-xl text-xs transition"
          >
            <RefreshCw className={"w-3.5 h-3.5 text-[#7ba372] " + (loading ? 'animate-spin' : '')} />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={"px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap " + (categoryFilter === cat ? 'bg-[#57854d] text-white shadow-sm' : 'bg-[#141b16] text-[#8a9e8f] hover:text-white border border-[#26332a]')}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#8a9e8f] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#141b16] border border-[#26332a] rounded-xl text-xs text-white placeholder-[#8a9e8f]/60 focus:outline-none focus:border-[#57854d]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map(p => {
          const isEnabled = p.isEnabledForBranch;
          return (
            <div
              key={p.id}
              className={"p-4 rounded-2xl border transition-all space-y-3 " + (isEnabled ? 'bg-[#141b16] border-[#26332a] hover:border-[#57854d]/50' : 'bg-[#0f1411] border-[#1c261f] opacity-60')}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-white">{p.name}</h4>
                    {p.isLocalBranchProduct && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-bold">
                        PHYSICAL ONLY
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#7ba372] font-semibold">{p.category}</span>
                </div>
                <span className="font-mono font-black text-amber-400 text-sm">₹{p.basePrice}</span>
              </div>
              {p.description && <p className="text-xs text-[#8a9e8f] line-clamp-2">{p.description}</p>}
              <div className="flex items-center gap-1 text-[9px] font-bold">
                <span className={"px-1.5 py-0.5 rounded " + (p.channelAvailability?.online ? 'bg-sky-500/20 text-sky-400' : 'bg-zinc-800 text-zinc-500')}>
                  ONLINE: {p.channelAvailability?.online ? 'ON' : 'OFF'}
                </span>
                <span className={"px-1.5 py-0.5 rounded " + (p.channelAvailability?.dineIn ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500')}>
                  DINE-IN: {p.channelAvailability?.dineIn ? 'ON' : 'OFF'}
                </span>
                <span className={"px-1.5 py-0.5 rounded " + (p.channelAvailability?.takeaway ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500')}>
                  POS: {p.channelAvailability?.takeaway ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="pt-2 border-t border-[#26332a] flex items-center justify-between">
                <button
                  onClick={() => { setSelectedProduct(p); setIsCustomizing(true); }}
                  className="px-2.5 py-1.5 bg-[#1c261f] hover:bg-[#26332a] text-[#8a9e8f] hover:text-white rounded-xl text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#7ba372]" />
                  <span>Customize</span>
                </button>
                <button
                  onClick={() => handleToggleProduct(p)}
                  className={"px-3 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-1 transition cursor-pointer " + (isEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30')}
                >
                  {isEnabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  <span>{isEnabled ? 'ENABLED' : 'DISABLED'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {isCustomizing && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0d120f] border border-[#26332a] rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
              <div>
                <h3 className="font-bold text-white text-base">{selectedProduct.name}</h3>
                <span className="text-xs text-[#7ba372]">Branch Customization & Channel Rules</span>
              </div>
              <button onClick={() => setIsCustomizing(false)} className="text-[#8a9e8f] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="text-xs text-[#8a9e8f] block mb-2 font-bold uppercase">Supported Sizes</label>
              <div className="flex flex-wrap gap-2">
                {(selectedProduct.allSizes || []).map((sz: string) => {
                  const isChecked = (selectedProduct.selectedSizes || []).includes(sz);
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => {
                        const next = isChecked ? selectedProduct.selectedSizes.filter((s: string) => s !== sz) : [...(selectedProduct.selectedSizes || []), sz];
                        setSelectedProduct({ ...selectedProduct, selectedSizes: next });
                      }}
                      className={"px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer " + (isChecked ? 'bg-[#57854d] text-white' : 'bg-[#141b16] text-[#8a9e8f] border border-[#26332a]')}
                    >
                      {isChecked && <Check className="w-3 h-3" />}
                      <span>{sz}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8a9e8f] block mb-2 font-bold uppercase">Supported Crusts</label>
              <div className="flex flex-wrap gap-2">
                {(selectedProduct.allCrusts || []).map((cr: string) => {
                  const isChecked = (selectedProduct.selectedCrusts || []).includes(cr);
                  return (
                    <button
                      key={cr}
                      type="button"
                      onClick={() => {
                        const next = isChecked ? selectedProduct.selectedCrusts.filter((c: string) => c !== cr) : [...(selectedProduct.selectedCrusts || []), cr];
                        setSelectedProduct({ ...selectedProduct, selectedCrusts: next });
                      }}
                      className={"px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer " + (isChecked ? 'bg-[#57854d] text-white' : 'bg-[#141b16] text-[#8a9e8f] border border-[#26332a]')}
                    >
                      {isChecked && <Check className="w-3 h-3" />}
                      <span>{cr}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8a9e8f] block mb-2 font-bold uppercase">Channel Availability</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#141b16] border border-[#26332a] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProduct.channelAvailability?.online !== false}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, channelAvailability: { ...selectedProduct.channelAvailability, online: e.target.checked } })}
                    className="w-4 h-4 rounded text-[#57854d]"
                  />
                  <span className="text-slate-200 font-semibold">Online Customer App</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#141b16] border border-[#26332a] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProduct.channelAvailability?.dineIn !== false}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, channelAvailability: { ...selectedProduct.channelAvailability, dineIn: e.target.checked } })}
                    className="w-4 h-4 rounded text-[#57854d]"
                  />
                  <span className="text-slate-200 font-semibold">POS Dine-In</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#141b16] border border-[#26332a] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProduct.channelAvailability?.takeaway !== false}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, channelAvailability: { ...selectedProduct.channelAvailability, takeaway: e.target.checked } })}
                    className="w-4 h-4 rounded text-[#57854d]"
                  />
                  <span className="text-slate-200 font-semibold">POS Takeaway</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#141b16] border border-[#26332a] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProduct.channelAvailability?.posDelivery !== false}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, channelAvailability: { ...selectedProduct.channelAvailability, posDelivery: e.target.checked } })}
                    className="w-4 h-4 rounded text-[#57854d]"
                  />
                  <span className="text-slate-200 font-semibold">POS Delivery</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[#26332a]">
              <button type="button" onClick={() => setIsCustomizing(false)} className="px-4 py-2 bg-[#141b16] text-[#8a9e8f] rounded-xl text-xs">Cancel</button>
              <button type="button" onClick={handleSaveCustomizations} className="px-4 py-2 bg-[#57854d] text-white font-bold rounded-xl text-xs cursor-pointer">Save Customizations</button>
            </div>
          </div>
        </div>
      )}

      {isLocalProductModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0d120f] border border-[#26332a] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#26332a]">
              <h3 className="font-bold text-white text-base">Create Restaurant-Only Special</h3>
              <button onClick={() => setIsLocalProductModal(false)} className="text-[#8a9e8f] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-[#8a9e8f]">This product will be available <strong className="text-amber-400">only for Dine-In & Takeaway at {branchName}</strong>.</p>
            <form onSubmit={handleCreateLocalProduct} className="space-y-3">
              <div>
                <label className="text-xs text-[#8a9e8f] block mb-1">Product Name</label>
                <input type="text" placeholder="e.g. Counter Feast Platter" value={localName} onChange={(e) => setLocalName(e.target.value)} required className="w-full px-3 py-2 bg-[#141b16] border border-[#26332a] rounded-xl text-xs text-white placeholder-[#8a9e8f]/60 focus:outline-none focus:border-[#57854d]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8a9e8f] block mb-1">Category</label>
                  <input type="text" value={localCategory} onChange={(e) => setLocalCategory(e.target.value)} className="w-full px-3 py-2 bg-[#141b16] border border-[#26332a] rounded-xl text-xs text-white focus:outline-none focus:border-[#57854d]" />
                </div>
                <div>
                  <label className="text-xs text-[#8a9e8f] block mb-1">Base Price (₹)</label>
                  <input type="number" value={localPrice} onChange={(e) => setLocalPrice(e.target.value)} required className="w-full px-3 py-2 bg-[#141b16] border border-[#26332a] rounded-xl text-xs font-mono text-amber-400 focus:outline-none focus:border-[#57854d]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8a9e8f] block mb-1">Description</label>
                <textarea placeholder="Details..." value={localDesc} onChange={(e) => setLocalDesc(e.target.value)} rows={2} className="w-full px-3 py-2 bg-[#141b16] border border-[#26332a] rounded-xl text-xs text-white placeholder-[#8a9e8f]/60 focus:outline-none focus:border-[#57854d]" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#26332a]">
                <button type="button" onClick={() => setIsLocalProductModal(false)} className="px-4 py-2 bg-[#141b16] text-[#8a9e8f] rounded-xl text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#57854d] text-white font-bold rounded-xl text-xs cursor-pointer">Create Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};