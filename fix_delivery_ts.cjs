const fs = require('fs');
const path = require('path');

const targetDir = 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-delivery';
const mirrorDir = 'C:\\Users\\RYZEN\\Downloads\\olive pizza delivery app';

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function writeFile(relativePath, content) {
  const fullPath = path.join(targetDir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content.trim(), 'utf8');

  // Also write to mirror
  const mirrorPath = path.join(mirrorDir, relativePath);
  ensureDir(path.dirname(mirrorPath));
  fs.writeFileSync(mirrorPath, content.trim(), 'utf8');

  console.log(`Generated: ${relativePath}`);
}

// 0. src/vite-env.d.ts
writeFile('src/vite-env.d.ts', `/// <reference types="vite/client" />
`);

// 1. src/pages/DashboardPage.tsx
writeFile('src/pages/DashboardPage.tsx', `import React, { useEffect } from 'react';
import { 
  Package, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  TrendingUp, 
  IndianRupee, 
  Calendar,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Navigation
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDeliveryStore } from '../store/deliveryStore';
import type { MonthlyDeliverySummary } from '../types/delivery';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { 
    todayStats, 
    monthlyReports, 
    activeOrders, 
    isOnline, 
    toggleOnlineStatus, 
    fetchTodayStats, 
    fetchMonthlyReports 
  } = useDeliveryStore();

  useEffect(() => {
    fetchTodayStats();
    fetchMonthlyReports();
  }, []);

  return (
    <div className="space-y-4">
      {/* Active Delivery Notification Banner if order assigned */}
      {activeOrders.length > 0 && (
        <div 
          onClick={() => navigate('/live-orders')}
          className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 cursor-pointer shadow-lg shadow-amber-500/10 hover:border-amber-500 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center font-black animate-pulse">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wide">ACTIVE DELIVERY</span>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              </div>
              <strong className="text-sm font-extrabold text-white block">
                Order #{activeOrders[0].dailyOrderNumber || activeOrders[0].id.slice(-5)}
              </strong>
              <span className="text-[11px] text-slate-300">
                {activeOrders[0].status.replace(/_/g, ' ').toUpperCase()} • Tap to open navigation
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400" />
        </div>
      )}

      {/* Online / Offline Shift Status Card */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={'w-3 h-3 rounded-full ' + (isOnline ? 'bg-emerald-400 animate-ping' : 'bg-slate-600')} />
          <div>
            <strong className="text-xs font-extrabold text-white block">
              {isOnline ? 'You are ON-DUTY (Receiving Orders)' : 'You are OFF-DUTY'}
            </strong>
            <span className="text-[11px] text-slate-400">
              {isOnline ? 'Ready for automatic restaurant dispatch' : 'Go online to receive shift orders'}
            </span>
          </div>
        </div>
        <button
          onClick={() => toggleOnlineStatus()}
          className={'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ' + (
            isOnline ? 'bg-slate-800 text-slate-300 hover:text-white' : 'bg-emerald-500 text-black font-extrabold'
          )}
        >
          {isOnline ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {/* TODAY'S PERFORMANCE REPORT */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3.5 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <h2 className="text-xs font-extrabold uppercase text-white tracking-wider">
              Today's Delivery Report
            </h2>
          </div>
          <button 
            onClick={() => fetchTodayStats()}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 2x2 Grid Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Deliveries Completed */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <strong className="text-xl font-black text-white">{todayStats.completed}</strong>
              <span className="text-[11px] text-slate-400 font-medium">/ {todayStats.assigned} assigned</span>
            </div>
          </div>

          {/* Today's Earnings */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Today's Payout</span>
              <IndianRupee className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1">
              <strong className="text-xl font-black text-amber-400">₹{todayStats.earnings}</strong>
            </div>
          </div>

          {/* Total Distance */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Distance</span>
              <MapPin className="w-4 h-4 text-cyan-400" />
            </div>
            <strong className="text-lg font-black text-white">{todayStats.totalDistanceKm} km</strong>
          </div>

          {/* Average Delivery Time */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Avg Trip Time</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <strong className="text-lg font-black text-white">{todayStats.averageDeliveryTimeMin} min</strong>
          </div>
        </div>
      </div>

      {/* MONTHLY SUMMARY REPORTS (Current & Past Months) */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-extrabold uppercase text-white tracking-wider">
              Monthly Summary Reports
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Archived Ledgers</span>
        </div>

        <div className="space-y-2.5">
          {monthlyReports.map((report: MonthlyDeliverySummary) => (
            <div
              key={report.id}
              className="p-3.5 rounded-xl bg-[#131E35] border border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <strong className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" /> {report.monthName}
                </strong>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {report.onTimeRatePercent}% On-Time
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Deliveries</span>
                  <strong className="text-white font-extrabold">{report.completedDeliveries}</strong>
                  <span className="text-slate-500 text-[9px]"> / {report.totalDeliveries}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Distance</span>
                  <strong className="text-white font-extrabold">{report.totalDistanceKm} km</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Earnings</span>
                  <strong className="text-amber-400 font-extrabold">₹{report.totalEarnings}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
`);

// 2. src/pages/LiveOrdersPage.tsx
writeFile('src/pages/LiveOrdersPage.tsx', `import React, { useState } from 'react';
import { 
  Navigation, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Camera, 
  AlertCircle,
  IndianRupee,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';
import type { DeliveryOrder, OrderItem } from '../types/delivery';
import toast from 'react-hot-toast';

export default function LiveOrdersPage() {
  const { 
    activeOrders, 
    acceptDelivery, 
    confirmPickup, 
    completeDelivery,
    currentLocation 
  } = useDeliveryStore();

  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async (orderId: string) => {
    const ok = await acceptDelivery(orderId);
    if (ok) {
      toast.success('Order accepted! Proceed to restaurant for pickup.');
    } else {
      toast.error('Failed to accept order.');
    }
  };

  const handlePickup = async (orderId: string) => {
    const ok = await confirmPickup(orderId);
    if (ok) {
      toast.success('Order picked up! Now Out for Delivery to customer.');
    } else {
      toast.error('Failed to confirm pickup.');
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingOrderId) return;

    setIsSubmitting(true);
    const res = await completeDelivery(completingOrderId, { notes: proofNote || 'Handed directly to customer' });

    if (res.success) {
      toast.success('Delivery completed and verified within proximity!');
      setCompletingOrderId(null);
      setProofNote('');
    } else {
      toast.error(res.error || 'Failed to complete delivery.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-extrabold text-white flex items-center gap-2">
          <Navigation className="w-5 h-5 text-amber-400" /> Active Deliveries
        </h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {activeOrders.length} Running
        </span>
      </div>

      {activeOrders.length === 0 ? (
        <div className="p-8 rounded-3xl bg-[#0F172A] border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <strong className="text-sm font-bold text-white block">No Active Deliveries</strong>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            You are online and ready. New assigned deliveries from restaurant managers will ring here immediately.
          </p>
        </div>
      ) : (
        activeOrders.map((order: DeliveryOrder) => {
          const isAssigned = order.status === 'partner_assigned';
          const isAccepted = order.status === 'accepted' || order.status === 'preparing' || order.status === 'ready';
          const isOutForDelivery = order.status === 'out_for_delivery';

          const addressText = typeof order.deliveryAddress === 'string' 
            ? order.deliveryAddress 
            : order.deliveryAddress?.addressLine || order.deliveryAddress?.address || 'Rajnandgaon, Chhattisgarh';

          return (
            <div
              key={order.id}
              className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-4 shadow-2xl relative overflow-hidden"
            >
              {/* Status Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider block">
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <strong className="text-base font-black text-white">
                    Order #{order.dailyOrderNumber || order.id.slice(-5)}
                  </strong>
                </div>

                <div className="text-right">
                  <span className="text-xs font-extrabold text-amber-400 block">₹{order.totalAmount}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{order.paymentMethod || 'COD'}</span>
                </div>
              </div>

              {/* Pickup & Destination Timeline */}
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Pickup Location</span>
                    <strong className="text-white text-xs block">{order.branchName || 'Olive Pizza — Rajnandgaon'}</strong>
                    <span className="text-[11px] text-slate-400 block">Dongargaon Rd, near Saraswati school, Gokul Nagar</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Customer Destination</span>
                    <strong className="text-white text-xs block">{order.customerName || 'Customer'}</strong>
                    <span className="text-[11px] text-slate-300 block">{addressText}</span>
                  </div>
                </div>
              </div>

              {/* Order Items Summary */}
              <div className="p-3 rounded-2xl bg-[#131E35] border border-slate-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Items to deliver:</span>
                {order.items?.map((item: OrderItem, idx: number) => (
                  <div key={idx} className="flex justify-between text-slate-200">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="text-slate-400 font-mono">₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Quick Actions (Call & Maps) */}
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={'tel:' + (order.contactPhone || '9179944445')}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" /> Call Customer
                </a>

                <a
                  href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" /> Open Maps
                </a>
              </div>

              {/* Workflow Stepper Action Buttons */}
              {isAssigned && (
                <button
                  onClick={() => handleAccept(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Accept Delivery
                </button>
              )}

              {isAccepted && (
                <button
                  onClick={() => handlePickup(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Confirm Pickup & Start Trip
                </button>
              )}

              {isOutForDelivery && (
                <button
                  onClick={() => setCompletingOrderId(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" /> Mark Delivered (100m Proximity)
                </button>
              )}
            </div>
          );
        })
      )}

      {/* COMPLETE DELIVERY MODAL */}
      {completingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-[#0F172A] border border-slate-800 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <strong className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Verify & Complete Delivery
              </strong>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-1">
              <strong className="block text-[11px] font-bold">100m Geofence Verification Active</strong>
              <p className="text-[10px] leading-tight text-emerald-400/90">
                Your GPS coordinates will be verified against the customer delivery address on completion.
              </p>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">Proof Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Handed to customer at door"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingOrderId(null)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying...' : 'Confirm Delivered'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`);

// 3. src/pages/DeliveryHistoryPage.tsx
writeFile('src/pages/DeliveryHistoryPage.tsx', `import React, { useEffect, useState } from 'react';
import { 
  History, 
  Search, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  IndianRupee,
  Clock,
  Filter
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';
import type { DeliveryOrder } from '../types/delivery';

export default function DeliveryHistoryPage() {
  const { currentMonthHistory, isHistoryLoading, fetchCurrentMonthHistory } = useDeliveryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchCurrentMonthHistory();
  }, []);

  const filteredHistory = currentMonthHistory.filter((order: DeliveryOrder) => {
    const matchesSearch = 
      (order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (String(order.dailyOrderNumber || '')).includes(searchQuery);

    if (!matchesSearch) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'completed' && order.status !== 'delivered' && order.status !== 'completed') return false;
      if (statusFilter === 'cancelled' && order.status !== 'cancelled' && order.status !== 'rejected') return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" /> Delivery History
          </h1>
          <span className="text-xs text-amber-400 font-bold">
            August 2026 (Current Calendar Month)
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {filteredHistory.length} Trips
        </span>
      </div>

      <div className="p-3 rounded-2xl bg-[#0F172A] border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Detailed delivery ledger is preserved for the <strong>current month</strong>. Older months are archived into monthly summary reports on the Dashboard.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
        >
          <option value="all">All Trips</option>
          <option value="completed">Completed Only</option>
          <option value="cancelled">Cancelled Only</option>
        </select>
      </div>

      <div className="space-y-2.5">
        {isHistoryLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading current month delivery records...
          </div>
        ) : filteredHistory.length > 0 ? (
          filteredHistory.map((order: DeliveryOrder) => {
            const isCompleted = order.status === 'delivered' || order.status === 'completed';
            const addressText = typeof order.deliveryAddress === 'string'
              ? order.deliveryAddress
              : order.deliveryAddress?.addressLine || 'Rajnandgaon';

            return (
              <div
                key={order.id}
                className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <strong className="text-xs font-bold text-white">
                      Order #{order.dailyOrderNumber || order.id.slice(-5)}
                    </strong>
                  </div>

                  <span className="text-xs font-extrabold text-amber-400">
                    +₹{order.deliveryFee || 40}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 flex items-center gap-1.5 truncate">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{addressText}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
                  <span>
                    {order.deliveredAt 
                      ? new Date(order.deliveredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                  <span>{order.deliveryDistanceKm || 3.5} km • {order.deliveryDurationMin || 22} min</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            No completed delivery records found for this filter in the current month.
          </div>
        )}
      </div>
    </div>
  );
}
`);

// 4. src/pages/AccountPage.tsx
writeFile('src/pages/AccountPage.tsx', `import React from 'react';
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Truck, 
  ShieldCheck, 
  Calendar, 
  Star, 
  Award 
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';

export default function AccountPage() {
  const { riderProfile } = useDeliveryStore();

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#131E35] to-[#0F172A] border border-slate-800 text-center space-y-3 shadow-xl">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-xl mx-auto shadow-lg shadow-amber-500/10">
          {(riderProfile?.name || 'R').charAt(0).toUpperCase()}
        </div>

        <div>
          <strong className="text-base font-extrabold text-white block">{riderProfile?.name}</strong>
          <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block">
            OFFICIAL DELIVERY PARTNER
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Rider ID: {riderProfile?.id?.slice(0, 12) || 'RDR-08-9445'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <div className="p-2 rounded-xl bg-[#090E17]/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Rider Rating
            </span>
            <strong className="text-sm font-extrabold text-white">{riderProfile?.rating || 4.9} / 5.0</strong>
          </div>

          <div className="p-2 rounded-xl bg-[#090E17]/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Award className="w-3 h-3 text-emerald-400" /> Lifetime Trips
            </span>
            <strong className="text-sm font-extrabold text-white">{riderProfile?.totalDeliveriesLifetime || 842}</strong>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3 text-xs">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider pb-2 border-b border-slate-800">
          Operational Identity
        </h2>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-slate-500" /> Contact Phone
          </span>
          <strong className="text-white">{riderProfile?.phone}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-slate-500" /> Login Email
          </span>
          <strong className="text-white">{riderProfile?.email}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-slate-500" /> Vehicle
          </span>
          <strong className="text-white">{riderProfile?.vehicleNumber || 'CG-08-AB-1234'}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-500" /> Assigned Branch
          </span>
          <strong className="text-amber-400">{riderProfile?.branchName}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500" /> Member Since
          </span>
          <span className="text-slate-300 font-mono">
            {new Date(riderProfile?.joiningDate || '2026-01-15').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-2 text-xs">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
          Operations Helpline
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-white block">Olive Pizza Dispatch Support</strong>
            <span className="text-[11px] text-slate-400">+91 91799 44445</span>
          </div>
          <a
            href="tel:9179944445"
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs"
          >
            Call
          </a>
        </div>
      </div>
    </div>
  );
}
`);

// 5. src/pages/SettingsPage.tsx
writeFile('src/pages/SettingsPage.tsx', `import React from 'react';
import { 
  Clock, 
  ShieldCheck, 
  Bell, 
  Map, 
  LogOut, 
  Radio, 
  Info 
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';

export default function SettingsPage() {
  const { riderProfile, logout, isGpsActive } = useDeliveryStore();

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold text-white">App & Operational Settings</h1>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Restaurant Work Schedule
          </h2>
          <span className="text-[10px] text-amber-400/80 font-mono">Official Shift</span>
        </div>

        <div className="space-y-1.5 text-xs">
          {riderProfile?.workingSchedule?.map((sched: { day: string; hours: string; isOff: boolean }) => (
            <div key={sched.day} className="flex items-center justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-300 font-medium">{sched.day}</span>
              <span className={'font-mono font-bold ' + (sched.isOff ? 'text-rose-400' : 'text-slate-400')}>
                {sched.hours}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-2.5 text-xs text-slate-300">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Delivery Policies
        </h2>

        <div className="flex justify-between py-1 border-b border-slate-800/60">
          <span className="text-slate-400">Max Delivery Radius</span>
          <strong className="text-white">15 km from Branch</strong>
        </div>

        <div className="flex justify-between py-1 border-b border-slate-800/60">
          <span className="text-slate-400">Proximity Completion</span>
          <strong className="text-emerald-400">Within 100 meters</strong>
        </div>

        <div className="flex justify-between py-1">
          <span className="text-slate-400">Live GPS Telemetry</span>
          <span className={'font-bold ' + (isGpsActive ? 'text-emerald-400' : 'text-slate-400')}>
            {isGpsActive ? 'Active' : 'Standby'}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Application Version</span>
          <span className="font-mono text-white">v1.0.0 (in.olivepizza.delivery)</span>
        </div>

        <button
          onClick={() => logout()}
          className="w-full py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/20 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
`);

// 6. src/pages/AccessDeniedPage.tsx
writeFile('src/pages/AccessDeniedPage.tsx', `import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';

export default function AccessDeniedPage() {
  const { logout } = useDeliveryStore();

  return (
    <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4 text-center">
      <div className="w-full max-w-sm rounded-3xl bg-[#0F172A] border border-rose-900/40 p-6 shadow-2xl space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <strong className="text-base font-bold text-white block">Access Restricted</strong>
        <p className="text-xs text-slate-400">
          This application is strictly for authorized Olive Pizza delivery partners. Customer accounts cannot access delivery dispatch.
        </p>
        <button
          onClick={() => logout()}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Sign In as Different Account
        </button>
      </div>
    </div>
  );
}
`);

console.log('Successfully updated imports and types in delivery app');
