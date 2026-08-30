const fs = require('fs');

// 1. Update RestaurantManagers.tsx with safe response handling and dual-sync
const mgrPath = 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-owner\\frontend\\src\\pages\\RestaurantManagers.tsx';
const mgrCode = `import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  MapPin,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Search,
  Lock,
  X,
  Edit2,
  Power,
  RefreshCw
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import toast from 'react-hot-toast';

interface ManagerItem {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  branchId: string;
  branchName?: string;
  isActive: boolean;
  permissions: string[];
  createdAt?: string;
  lastLogin?: string;
}

const AVAILABLE_BRANCHES = [
  { id: 'main_branch', name: 'Olive Pizza — Rajnandgaon (Main Branch)' },
  { id: 'durg_branch', name: 'Olive Pizza — Durg (Branch 2)' },
  { id: 'bhilai_branch', name: 'Olive Pizza — Bhilai (Branch 3)' },
  { id: 'raipur_branch', name: 'Olive Pizza — Raipur (Branch 4)' },
];

const PERMISSION_OPTIONS = [
  { id: 'dashboard.view', label: 'Dashboard', desc: 'View live shift operations & KPIs' },
  { id: 'orders.live', label: 'Live Orders', desc: 'Accept, prepare, and reject active orders' },
  { id: 'orders.history', label: 'Order History', desc: 'Search and inspect historical order ledger' },
  { id: 'notifications.send', label: 'Notifications', desc: 'Send operational push broadcasts' },
  { id: 'email.send', label: 'Email Dispatch', desc: 'Send operational customer & staff emails' },
  { id: 'delivery.view', label: 'Delivery Radar', desc: 'Live map tracking and rider telemetry' },
];

export default function RestaurantManagers() {
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('OlivePizza@2026');
  const [formPhone, setFormPhone] = useState('');
  const [formBranchId, setFormBranchId] = useState('main_branch');
  const [formPermissions, setFormPermissions] = useState<string[]>([
    'dashboard.view',
    'orders.live',
    'orders.history',
    'notifications.send',
    'email.send',
    'delivery.view'
  ]);

  // Edit Modal State
  const [editingManager, setEditingManager] = useState<ManagerItem | null>(null);

  const fetchManagers = async () => {
    setLoading(true);
    try {
      // 1. Try Backend API
      const res = await fetchApi('/api/restaurant-managers');
      const data = await res.json().catch(() => null);

      if (res.ok && data?.managers) {
        setManagers(data.managers);
      } else {
        // 2. Direct Firestore fallback
        const snap = await getDocs(collection(db, 'restaurant_managers')).catch(() => ({ docs: [] } as any));
        if (snap.docs && snap.docs.length > 0) {
          const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          setManagers(list);
        } else {
          // Check users collection
          const userSnap = await getDocs(collection(db, 'users')).catch(() => ({ docs: [] } as any));
          const mgrList: ManagerItem[] = [];
          userSnap.docs?.forEach((d: any) => {
            const u = d.data();
            if (u.role === 'restaurant_manager' || u.role === 'manager') {
              mgrList.push({ id: d.id, uid: d.id, ...u });
            }
          });
          setManagers(mgrList);
        }
      }
    } catch (err) {
      console.warn('Error fetching managers via API, checked Firestore fallback:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  const handleTogglePermission = (permId: string) => {
    setFormPermissions((prev) => 
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      toast.error('Name and email are required');
      return;
    }

    setIsSubmitting(true);
    const branchObj = AVAILABLE_BRANCHES.find(b => b.id === formBranchId);
    const normalizedEmail = formEmail.trim().toLowerCase();

    try {
      // 1. Send to Backend API
      const res = await fetchApi('/api/restaurant-managers', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          email: normalizedEmail,
          password: formPassword.trim(),
          phone: formPhone.trim(),
          branchId: formBranchId,
          branchName: branchObj?.name,
          permissions: formPermissions
        })
      });

      const data = await res.json().catch(() => null);

      if (res.ok || data?.success) {
        toast.success('Restaurant Manager account provisioned successfully!');
        setIsAddModalOpen(false);
        resetForm();
        fetchManagers();
      } else {
        // Firestore direct fallback if offline / standalone
        const targetId = 'mgr_' + Date.now().toString();
        const managerDoc = {
          uid: targetId,
          id: targetId,
          name: formName.trim(),
          displayName: formName.trim(),
          email: normalizedEmail,
          phone: formPhone.trim(),
          role: 'restaurant_manager',
          branchId: formBranchId,
          branchName: branchObj?.name || 'Olive Pizza — Rajnandgaon',
          permissions: formPermissions,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'restaurant_managers', targetId), managerDoc, { merge: true });
        await setDoc(doc(db, 'users', targetId), managerDoc, { merge: true });

        toast.success('Restaurant Manager account created and saved to Firestore');
        setIsAddModalOpen(false);
        resetForm();
        fetchManagers();
      }
    } catch (err: any) {
      console.warn('Backend create notice, applied Firestore write:', err);
      const targetId = 'mgr_' + Date.now().toString();
      const managerDoc = {
        uid: targetId,
        id: targetId,
        name: formName.trim(),
        displayName: formName.trim(),
        email: normalizedEmail,
        phone: formPhone.trim(),
        role: 'restaurant_manager',
        branchId: formBranchId,
        branchName: branchObj?.name || 'Olive Pizza — Rajnandgaon',
        permissions: formPermissions,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'restaurant_managers', targetId), managerDoc, { merge: true });
        await setDoc(doc(db, 'users', targetId), managerDoc, { merge: true });
        toast.success('Restaurant Manager account created successfully');
        setIsAddModalOpen(false);
        resetForm();
        fetchManagers();
      } catch (dbErr: any) {
        toast.error('Failed to create manager account: ' + (dbErr?.message || err?.message));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (manager: ManagerItem) => {
    const newStatus = !manager.isActive;
    try {
      const res = await fetchApi('/api/restaurant-managers/' + manager.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newStatus })
      });
      const data = await res.json().catch(() => null);

      if (res.ok || data?.success) {
        toast.success('Account ' + (newStatus ? 'activated' : 'disabled'));
      }
    } catch (e) {}

    // Also update direct in Firestore
    try {
      await updateDoc(doc(db, 'restaurant_managers', manager.id), { isActive: newStatus }).catch(() => {});
      await updateDoc(doc(db, 'users', manager.id), { isActive: newStatus }).catch(() => {});
    } catch (e) {}

    setManagers((prev) => prev.map((m) => m.id === manager.id ? { ...m, isActive: newStatus } : m));
    toast.success('Account status updated');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingManager) return;

    setIsSubmitting(true);
    const branchObj = AVAILABLE_BRANCHES.find(b => b.id === editingManager.branchId);

    try {
      await fetchApi('/api/restaurant-managers/' + editingManager.id, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingManager.name,
          phone: editingManager.phone,
          branchId: editingManager.branchId,
          branchName: branchObj?.name,
          permissions: editingManager.permissions
        })
      });
    } catch (e) {}

    try {
      await setDoc(doc(db, 'restaurant_managers', editingManager.id), {
        name: editingManager.name,
        displayName: editingManager.name,
        phone: editingManager.phone || '',
        branchId: editingManager.branchId,
        branchName: branchObj?.name,
        permissions: editingManager.permissions,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await setDoc(doc(db, 'users', editingManager.id), {
        name: editingManager.name,
        displayName: editingManager.name,
        phone: editingManager.phone || '',
        branchId: editingManager.branchId,
        branchName: branchObj?.name,
        permissions: editingManager.permissions,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      toast.success('Manager permissions & branch updated successfully');
      setEditingManager(null);
      fetchManagers();
    } catch (err: any) {
      toast.error('Error saving changes: ' + err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('OlivePizza@2026');
    setFormPhone('');
    setFormBranchId('main_branch');
    setFormPermissions([
      'dashboard.view',
      'orders.live',
      'orders.history',
      'notifications.send',
      'email.send',
      'delivery.view'
    ]);
    setCurrentStep(1);
  };

  const filteredManagers = managers.filter((m) => {
    const matchesSearch = 
      (m.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.phone && m.phone.includes(searchQuery));

    if (!matchesSearch) return false;
    if (selectedBranchFilter !== 'all' && m.branchId !== selectedBranchFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 text-slate-100 font-sans">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0E1524] via-[#141d33] to-[#0E1524] border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
              OWNER RBAC CONSOLE
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-orange-400" /> Restaurant Managers
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage authorized accounts that can operate Olive Pizza restaurant branches and live shift consoles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchManagers}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Refresh List"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Restaurant Manager</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0E1524] border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search managers by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 shrink-0">Branch:</span>
          <select
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Branches</option>
            {AVAILABLE_BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Managers Directory Table */}
      <div className="rounded-2xl bg-[#0E1524] border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090D16] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Manager</th>
                <th className="py-3.5 px-4">Assigned Branch</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Permissions</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-500 animate-pulse">
                    Loading manager accounts directory...
                  </td>
                </tr>
              ) : filteredManagers.length > 0 ? (
                filteredManagers.map((mgr) => (
                  <tr key={mgr.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {(mgr.name || 'M').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong className="text-white font-bold block">{mgr.name || 'Manager'}</strong>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-500" /> {mgr.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-orange-400 border border-slate-700">
                        <MapPin className="w-3 h-3" />
                        {mgr.branchName || mgr.branchId}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-300">
                      {mgr.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-500" /> {mgr.phone}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {mgr.permissions?.slice(0, 3).map((p) => (
                          <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700">
                            {p.split('.')[0]}
                          </span>
                        ))}
                        {mgr.permissions && mgr.permissions.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-orange-400">
                            +{mgr.permissions.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ' + (
                        mgr.isActive !== false
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      )}>
                        {mgr.isActive !== false ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{mgr.isActive !== false ? 'Active' : 'Disabled'}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setEditingManager(mgr)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Edit Permissions & Branch"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleToggleStatus(mgr)}
                        className={'p-1.5 rounded-lg border transition-colors ' + (
                          mgr.isActive !== false
                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20' 
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                        )}
                        title={mgr.isActive !== false ? 'Disable Account' : 'Enable Account'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-500">
                    No restaurant managers registered yet. Click "Add Restaurant Manager" to provision one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MANAGER MULTI-STEP MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0E1524] border border-slate-800 w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create Restaurant Manager</h3>
                  <span className="text-xs text-slate-400">Step {currentStep} of 4</span>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div className="grid grid-cols-4 gap-2">
              {['Details', 'Branch', 'Permissions', 'Review'].map((stepName, i) => (
                <div
                  key={stepName}
                  className={'h-1.5 rounded-full transition-all ' + (
                    currentStep >= i + 1 ? 'bg-orange-500' : 'bg-slate-800'
                  )}
                />
              ))}
            </div>

            {/* Step 1: Manager Details */}
            {currentStep === 1 && (
              <div className="space-y-4 text-xs">
                <h4 className="font-bold text-white text-sm">Step 1: Account Credentials & Identity</h4>
                
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">Email Address (Login Username) *</label>
                  <input
                    type="email"
                    placeholder="manager@olivepizza.in"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">Initial Password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 block">Manager will use this password to sign in.</span>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Branch Assignment */}
            {currentStep === 2 && (
              <div className="space-y-4 text-xs">
                <h4 className="font-bold text-white text-sm">Step 2: Assign Operational Branch</h4>
                <p className="text-slate-400">
                  The manager's queries, live orders, rider maps, and notifications will be strictly isolated to this branch.
                </p>

                <div className="space-y-2">
                  {AVAILABLE_BRANCHES.map((b) => (
                    <label
                      key={b.id}
                      className={'p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ' + (
                        formBranchId === b.id
                          ? 'bg-orange-500/15 border-orange-500 text-white'
                          : 'bg-[#090D16] border-slate-800 text-slate-300 hover:border-slate-700'
                      )}
                    >
                      <input
                        type="radio"
                        name="branch"
                        value={b.id}
                        checked={formBranchId === b.id}
                        onChange={() => setFormBranchId(b.id)}
                        className="accent-orange-500"
                      />
                      <div>
                        <strong className="block text-white font-bold">{b.name}</strong>
                        <span className="text-[11px] text-slate-400 font-mono">Branch ID: {b.id}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Permissions */}
            {currentStep === 3 && (
              <div className="space-y-4 text-xs">
                <h4 className="font-bold text-white text-sm">Step 3: Define Manager Capabilities</h4>
                <p className="text-slate-400">
                  Select what operational tools this manager is authorized to access in the Restaurant Manager application.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PERMISSION_OPTIONS.map((p) => {
                    const isChecked = formPermissions.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        onClick={() => handleTogglePermission(p.id)}
                        className={'p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ' + (
                          isChecked
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                            : 'bg-[#090D16] border-slate-800 text-slate-400'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="mt-0.5 accent-emerald-500"
                        />
                        <div>
                          <strong className="text-white block font-bold">{p.label}</strong>
                          <span className="text-[11px] text-slate-400 leading-tight block">{p.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {currentStep === 4 && (
              <div className="space-y-4 text-xs">
                <h4 className="font-bold text-white text-sm">Step 4: Review Account Summary</h4>

                <div className="p-4 rounded-2xl bg-[#090D16] border border-slate-800 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Full Name:</span>
                    <strong className="text-white">{formName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Email:</span>
                    <strong className="text-white">{formEmail}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Branch:</span>
                    <strong className="text-orange-400">
                      {AVAILABLE_BRANCHES.find(b => b.id === formBranchId)?.name}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Role:</span>
                    <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold uppercase text-[10px]">
                      restaurant_manager
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-slate-400 block mb-1.5">Granted Permissions:</span>
                    <div className="flex flex-wrap gap-1">
                      {formPermissions.map((p) => (
                        <span key={p} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          ✓ {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Controls */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="px-4 py-2 rounded-xl bg-[#090D16] text-slate-300 hover:text-white border border-slate-700 text-xs font-bold"
                >
                  Back
                </button>
              ) : <div />}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep === 1 && (!formName || !formEmail)) {
                      toast.error('Please enter name and email');
                      return;
                    }
                    setCurrentStep((s) => s + 1);
                  }}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-lg shadow-orange-500/20"
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateManager}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Provisioning Account...' : 'Create Manager Account'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT MANAGER MODAL */}
      {editingManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0E1524] border border-slate-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Edit Manager: {editingManager.name}</h3>
              <button
                onClick={() => setEditingManager(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">Full Name</label>
                <input
                  type="text"
                  value={editingManager.name}
                  onChange={(e) => setEditingManager({ ...editingManager, name: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">Phone</label>
                <input
                  type="tel"
                  value={editingManager.phone || ''}
                  onChange={(e) => setEditingManager({ ...editingManager, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">Assigned Branch</label>
                <select
                  value={editingManager.branchId}
                  onChange={(e) => setEditingManager({ ...editingManager, branchId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                >
                  {AVAILABLE_BRANCHES.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-slate-300 block">Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((p) => {
                    const isChecked = editingManager.permissions?.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={'p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer ' + (
                          isChecked ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-[#090D16] border-slate-800 text-slate-400'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const newPerms = isChecked
                              ? editingManager.permissions.filter((x) => x !== p.id)
                              : [...(editingManager.permissions || []), p.id];
                            setEditingManager({ ...editingManager, permissions: newPerms });
                          }}
                          className="accent-emerald-500"
                        />
                        <span>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingManager(null)}
                  className="px-4 py-2 rounded-xl bg-[#090D16] text-slate-300 hover:text-white border border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-lg"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(mgrPath, mgrCode, 'utf8');
console.log('Successfully updated RestaurantManagers.tsx');

// 2. Create FranchiseManager.tsx
const franchisePath = 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-owner\\frontend\\src\\pages\\FranchiseManager.tsx';
const franchiseCode = `import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Mail,
  Clock,
  Navigation,
  ShieldCheck,
  Power,
  Edit2,
  X,
  Search,
  CheckCircle2,
  XCircle,
  Truck,
  RefreshCw
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import toast from 'react-hot-toast';

export interface FranchiseBranch {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  maxDeliveryRadiusKm: number;
  openingTime: string;
  closingTime: string;
  isActive: boolean;
  isHeadquarters?: boolean;
  createdAt?: string;
}

const DEFAULT_BRANCHES: FranchiseBranch[] = [
  {
    id: 'main_branch',
    name: 'Olive Pizza — Rajnandgaon (Main Branch)',
    code: 'OP-RJN-01',
    city: 'Rajnandgaon',
    state: 'Chhattisgarh',
    address: 'Dongargaon Rd, near Saraswati school, Gokul Nagar, Rajnandgaon, CG 491441',
    lat: 21.0810244,
    lng: 81.0123793,
    phone: '+91 91799 44445',
    email: 'olivepizzarjn@gmail.com',
    maxDeliveryRadiusKm: 15,
    openingTime: '12:00',
    closingTime: '23:59',
    isActive: true,
    isHeadquarters: true
  },
  {
    id: 'durg_branch',
    name: 'Olive Pizza — Durg (Branch 2)',
    code: 'OP-DURG-02',
    city: 'Durg',
    state: 'Chhattisgarh',
    address: 'Station Road, Durg, CG 491001',
    lat: 21.190449,
    lng: 81.284920,
    phone: '+91 91799 44446',
    email: 'durg@olivepizza.in',
    maxDeliveryRadiusKm: 12,
    openingTime: '12:00',
    closingTime: '23:59',
    isActive: true,
    isHeadquarters: false
  },
  {
    id: 'bhilai_branch',
    name: 'Olive Pizza — Bhilai (Branch 3)',
    code: 'OP-BHL-03',
    city: 'Bhilai',
    state: 'Chhattisgarh',
    address: 'Civic Centre, Sector 5, Bhilai, CG 490006',
    lat: 21.193848,
    lng: 81.350941,
    phone: '+91 91799 44447',
    email: 'bhilai@olivepizza.in',
    maxDeliveryRadiusKm: 12,
    openingTime: '12:00',
    closingTime: '23:59',
    isActive: true,
    isHeadquarters: false
  },
  {
    id: 'raipur_branch',
    name: 'Olive Pizza — Raipur (Branch 4)',
    code: 'OP-RPR-04',
    city: 'Raipur',
    state: 'Chhattisgarh',
    address: 'VIP Road, Telibandha, Raipur, CG 492006',
    lat: 21.237944,
    lng: 81.667427,
    phone: '+91 91799 44448',
    email: 'raipur@olivepizza.in',
    maxDeliveryRadiusKm: 15,
    openingTime: '12:00',
    closingTime: '23:59',
    isActive: true,
    isHeadquarters: false
  }
];

export default function FranchiseManager() {
  const [branches, setBranches] = useState<FranchiseBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Chhattisgarh');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('21.0810244');
  const [lng, setLng] = useState('81.0123793');
  const [phone, setPhone] = useState('+91 91799 44445');
  const [email, setEmail] = useState('');
  const [maxRadius, setMaxRadius] = useState(15);
  const [openTime, setOpenTime] = useState('12:00');
  const [closeTime, setCloseTime] = useState('23:59');

  // Edit Modal
  const [editingBranch, setEditingBranch] = useState<FranchiseBranch | null>(null);

  const loadBranches = async () => {
    setLoading(true);
    try {
      // 1. Try Backend API
      const res = await fetchApi('/api/franchises');
      const data = await res.json().catch(() => null);

      if (res.ok && data?.branches && data.branches.length > 0) {
        setBranches(data.branches);
      } else {
        // 2. Firestore fallback
        const snap = await getDocs(collection(db, 'franchises')).catch(() => ({ docs: [] } as any));
        if (snap.docs && snap.docs.length > 0) {
          setBranches(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
        } else {
          setBranches(DEFAULT_BRANCHES);
          // Seed defaults
          for (const b of DEFAULT_BRANCHES) {
            await setDoc(doc(db, 'franchises', b.id), b, { merge: true }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('Franchises API fallback to defaults:', err);
      setBranches(DEFAULT_BRANCHES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim()) {
      toast.error('Branch name and city are required');
      return;
    }

    setIsSubmitting(true);
    const branchId = (code ? code.toLowerCase().replace(/[^a-z0-9]/g, '_') : city.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_branch');

    const newBranch: FranchiseBranch = {
      id: branchId,
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : 'OP-' + city.slice(0, 3).toUpperCase() + '-00',
      city: city.trim(),
      state: state.trim(),
      address: address.trim() || (city + ', Chhattisgarh'),
      lat: Number(lat) || 21.0810244,
      lng: Number(lng) || 81.0123793,
      phone: phone.trim() || '+91 91799 44445',
      email: email.trim() || ('branch.' + city.toLowerCase() + '@olivepizza.in'),
      maxDeliveryRadiusKm: Number(maxRadius) || 12,
      openingTime: openTime || '12:00',
      closingTime: closeTime || '23:59',
      isActive: true,
      isHeadquarters: false,
      createdAt: new Date().toISOString()
    };

    try {
      // Backend API
      await fetchApi('/api/franchises', {
        method: 'POST',
        body: JSON.stringify(newBranch)
      }).catch(() => {});

      // Firestore
      await setDoc(doc(db, 'franchises', branchId), newBranch, { merge: true });

      toast.success('Franchise branch created successfully!');
      setIsAddOpen(false);
      setName('');
      setCode('');
      setCity('');
      setAddress('');
      loadBranches();
    } catch (err: any) {
      toast.error('Error creating branch: ' + err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (branch: FranchiseBranch) => {
    const nextStatus = !branch.isActive;
    try {
      await fetchApi('/api/franchises/' + branch.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextStatus })
      }).catch(() => {});

      await updateDoc(doc(db, 'franchises', branch.id), {
        isActive: nextStatus,
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      setBranches(prev => prev.map(b => b.id === branch.id ? { ...b, isActive: nextStatus } : b));
      toast.success('Branch ' + (nextStatus ? 'activated' : 'deactivated'));
    } catch (e: any) {
      toast.error('Failed to update status');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;

    setIsSubmitting(true);
    try {
      await fetchApi('/api/franchises/' + editingBranch.id, {
        method: 'PATCH',
        body: JSON.stringify(editingBranch)
      }).catch(() => {});

      await setDoc(doc(db, 'franchises', editingBranch.id), editingBranch, { merge: true });

      toast.success('Branch details updated');
      setEditingBranch(null);
      loadBranches();
    } catch (err: any) {
      toast.error('Failed to update branch: ' + err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 text-slate-100 font-sans">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0E1524] via-[#141d33] to-[#0E1524] border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
              ORGANIZATION & LOCATIONS
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-orange-400" /> Franchise & Branch Manager
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure multi-outlet restaurant branches, delivery boundaries, operating hours, and dispatch hubs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBranches}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsAddOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Branch</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0E1524] border border-slate-800 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search branches by city, name, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Active Outlets: <strong className="text-emerald-400">{branches.filter(b => b.isActive).length}</strong> / {branches.length}
        </div>
      </div>

      {/* Franchise Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {loading ? (
          <div className="col-span-2 py-12 text-center text-xs text-slate-500 animate-pulse">
            Loading franchise branches...
          </div>
        ) : filteredBranches.length > 0 ? (
          filteredBranches.map((branch) => (
            <div
              key={branch.id}
              className={'p-5 rounded-2xl bg-[#0E1524] border transition-all space-y-4 ' + (
                branch.isActive ? 'border-slate-800 hover:border-slate-700' : 'border-rose-900/40 opacity-75'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ' + (
                    branch.isHeadquarters ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'bg-slate-800 text-slate-200 border border-slate-700'
                  )}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-white font-bold text-sm">{branch.name}</strong>
                      {branch.isHeadquarters && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          HQ
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{branch.code} • {branch.city}, {branch.state}</span>
                  </div>
                </div>

                <span className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ' + (
                  branch.isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                )}>
                  {branch.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  <span>{branch.isActive ? 'Active' : 'Closed'}</span>
                </span>
              </div>

              {/* Details & Specs */}
              <div className="p-3 rounded-xl bg-[#090D16] border border-slate-800 text-xs space-y-2 text-slate-300">
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span className="text-slate-400 line-clamp-1">{branch.address}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    <span>{branch.openingTime} - {branch.closingTime}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Truck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Radius: {branch.maxDeliveryRadiusKm} km</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400 truncate">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{branch.phone}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{branch.email}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500 font-mono">
                  GPS: {branch.lat.toFixed(4)}, {branch.lng.toFixed(4)}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingBranch(branch)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>

                  {!branch.isHeadquarters && (
                    <button
                      onClick={() => handleToggleActive(branch)}
                      className={'p-1.5 rounded-lg border transition-colors ' + (
                        branch.isActive 
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20' 
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                      )}
                      title={branch.isActive ? 'Deactivate Branch' : 'Activate Branch'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 py-12 text-center text-xs text-slate-500">
            No franchise branches found.
          </div>
        )}
      </div>

      {/* ADD BRANCH MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0E1524] border border-slate-800 w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-orange-400" /> Add New Franchise Branch
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Branch Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Olive Pizza — Bilaspur"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Branch Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. OP-BIL-05"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">City *</label>
                  <input
                    type="text"
                    placeholder="e.g. Bilaspur"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">Address</label>
                <input
                  type="text"
                  placeholder="Main Road, Commercial Complex..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Email</label>
                  <input
                    type="email"
                    placeholder="branch@olivepizza.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Delivery Radius (km)</label>
                  <input
                    type="number"
                    value={maxRadius}
                    onChange={(e) => setMaxRadius(Number(e.target.value))}
                    min={1}
                    max={50}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Opening Time</label>
                  <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Closing Time</label>
                  <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Latitude (GPS)</label>
                  <input
                    type="text"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Longitude (GPS)</label>
                  <input
                    type="text"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#090D16] text-slate-300 hover:text-white border border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Franchise Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT BRANCH MODAL */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0E1524] border border-slate-800 w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Edit Branch: {editingBranch.name}</h3>
              <button
                onClick={() => setEditingBranch(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">Branch Name</label>
                <input
                  type="text"
                  value={editingBranch.name}
                  onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">Address</label>
                <input
                  type="text"
                  value={editingBranch.address}
                  onChange={(e) => setEditingBranch({ ...editingBranch, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Phone</label>
                  <input
                    type="tel"
                    value={editingBranch.phone}
                    onChange={(e) => setEditingBranch({ ...editingBranch, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Delivery Radius (km)</label>
                  <input
                    type="number"
                    value={editingBranch.maxDeliveryRadiusKm}
                    onChange={(e) => setEditingBranch({ ...editingBranch, maxDeliveryRadiusKm: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Opening Time</label>
                  <input
                    type="time"
                    value={editingBranch.openingTime}
                    onChange={(e) => setEditingBranch({ ...editingBranch, openingTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">Closing Time</label>
                  <input
                    type="time"
                    value={editingBranch.closingTime}
                    onChange={(e) => setEditingBranch({ ...editingBranch, closingTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D16] border border-slate-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  className="px-4 py-2 rounded-xl bg-[#090D16] text-slate-300 hover:text-white border border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(franchisePath, franchiseCode, 'utf8');
console.log('Successfully created FranchiseManager.tsx');
