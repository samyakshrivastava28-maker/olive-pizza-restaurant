const fs = require('fs');
const path = require('path');

const targetPath = 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-owner\\frontend\\src\\pages\\RestaurantManagers.tsx';

const code = `import React, { useState, useEffect } from 'react';
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
  Power
} from 'lucide-react';
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
      const res = await fetchApi<any>('/restaurant-managers');
      if (res.success && res.managers) {
        setManagers(res.managers);
      } else {
        setManagers([]);
      }
    } catch (err) {
      console.error('Error fetching managers:', err);
      toast.error('Failed to load manager accounts');
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
    try {
      const branchObj = AVAILABLE_BRANCHES.find(b => b.id === formBranchId);
      const res = await fetchApi<any>('/restaurant-managers', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword.trim(),
          phone: formPhone.trim(),
          branchId: formBranchId,
          branchName: branchObj?.name,
          permissions: formPermissions
        })
      });

      if (res.success) {
        toast.success('Restaurant Manager account provisioned successfully!');
        setIsAddModalOpen(false);
        resetForm();
        fetchManagers();
      } else {
        toast.error(res.error || 'Failed to create manager account');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create manager account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (manager: ManagerItem) => {
    const newStatus = !manager.isActive;
    try {
      const res = await fetchApi<any>('/restaurant-managers/' + manager.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newStatus })
      });

      if (res.success) {
        toast.success('Account ' + (newStatus ? 'activated' : 'disabled'));
        setManagers((prev) => prev.map((m) => m.id === manager.id ? { ...m, isActive: newStatus } : m));
      } else {
        toast.error(res.error || 'Failed to update account status');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error updating status');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingManager) return;

    setIsSubmitting(true);
    try {
      const branchObj = AVAILABLE_BRANCHES.find(b => b.id === editingManager.branchId);
      const res = await fetchApi<any>('/restaurant-managers/' + editingManager.id, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingManager.name,
          phone: editingManager.phone,
          branchId: editingManager.branchId,
          branchName: branchObj?.name,
          permissions: editingManager.permissions
        })
      });

      if (res.success) {
        toast.success('Manager permissions & branch updated');
        setEditingManager(null);
        fetchManagers();
      } else {
        toast.error(res.error || 'Failed to update manager');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error saving changes');
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
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
                          {mgr.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong className="text-white font-bold block">{mgr.name}</strong>
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
                        {mgr.permissions?.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-orange-400">
                            +{mgr.permissions.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ' + (
                        mgr.isActive 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      )}>
                        {mgr.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{mgr.isActive ? 'Active' : 'Disabled'}</span>
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
                          mgr.isActive 
                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20' 
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                        )}
                        title={mgr.isActive ? 'Disable Account' : 'Enable Account'}
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
                  <label className="font-bold text-slate-300 block">Initial Temporary Password *</label>
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
                  <span className="text-[11px] text-slate-500 block">Manager will use this password on first login.</span>
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

fs.writeFileSync(targetPath, code, 'utf8');
console.log('Successfully wrote RestaurantManagers.tsx');
