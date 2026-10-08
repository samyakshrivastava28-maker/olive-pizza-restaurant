import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  ChevronUp, 
  ChevronDown, 
  Maximize2, 
  Minimize2, 
  X, 
  Check, 
  Clock, 
  Flame, 
  BellRing, 
  Truck, 
  UtensilsCrossed, 
  ShoppingBag, 
  Phone, 
  MapPin, 
  CreditCard, 
  Printer, 
  AlertTriangle, 
  VolumeX, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  Bike, 
  AlertCircle,
  PackageCheck
} from 'lucide-react';
import { useManagerStore } from '../../store/managerStore';
import { SoundAlertEngine } from '../../lib/SoundAlertEngine';
import type { Order, OrderStatus } from '../../types/restaurant';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

export type SheetMode = 'minimized' | 'half' | 'expanded';

const ACTIVE_STATUS_FLOW: OrderStatus[] = [
  'pending',
  'pending_acceptance',
  'accepted',
  'preparing',
  'ready',
  'partner_assigned',
  'picked_up',
  'out_for_delivery'
];

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function printOrderReceipt(order: Order, branchName?: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const itemsHtml = (order.items || []).map((it) => `
    <tr>
      <td style="padding: 4px 0; font-size: 13px;">
        <strong>${escapeHtml(it.quantity)}x</strong> ${escapeHtml(it.name)}
        ${it.variant || it.size ? `<br><small style="color: #666;">Size: ${escapeHtml(it.variant || it.size)}</small>` : ''}
        ${it.crust ? `<br><small style="color: #666;">Crust: ${escapeHtml(it.crust)}</small>` : ''}
        ${it.addons && it.addons.length ? `<br><small style="color: #444;">+ ${it.addons.map(a => escapeHtml(a.name)).join(', ')}</small>` : ''}
      </td>
      <td style="padding: 4px 0; text-align: right; vertical-align: top; font-size: 13px;">
        ₹${((it.price || 0) * (it.quantity || 1)).toFixed(0)}
      </td>
    </tr>
  `).join('');

  const safeOrderNumber = escapeHtml(order.orderNumber || '#' + order.id.slice(0, 6).toUpperCase());
  const safeDailyOrder = order.dailyOrderNumber ? escapeHtml(order.dailyOrderNumber) : '';
  const safeBranch = escapeHtml(branchName || 'Kitchen Operations');
  const safeType = escapeHtml((order.fulfillmentType || order.deliveryType || 'DELIVERY').toUpperCase());
  const safeTable = order.tableNumber ? escapeHtml(order.tableNumber) : '';
  const safeCustomerName = escapeHtml(order.customerName || 'Walk-in');
  const safePhone = order.contactPhone ? escapeHtml(order.contactPhone) : '';
  const rawAddress = typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.addressLine : order.deliveryAddress;
  const safeAddress = rawAddress ? escapeHtml(rawAddress) : '';
  const safePaymentMethod = escapeHtml((order.paymentMethod || 'COD').toUpperCase());
  const safePaymentStatus = escapeHtml((order.paymentStatus || 'PENDING').toUpperCase());

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Order Receipt - ${safeOrderNumber}</title>
        <style>
          @page { margin: 4mm; }
          body {
            font-family: 'Courier New', Courier, monospace, -apple-system;
            font-size: 12px;
            color: #000;
            line-height: 1.3;
            padding: 8px;
            width: 78mm;
            margin: 0 auto;
          }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <h2 style="margin: 0; font-size: 18px;">🍕 OLIVE PIZZA</h2>
          <div style="font-size: 11px;">${safeBranch}</div>
          <div style="font-size: 10px; margin-top: 2px;">*** KITCHEN ORDER TICKET ***</div>
        </div>
        <div class="divider"></div>
        <div>
          <strong>Order:</strong> ${safeOrderNumber}
          ${safeDailyOrder ? `<span style="float: right;"><strong>Daily #${safeDailyOrder}</strong></span>` : ''}
        </div>
        <div><strong>Type:</strong> ${safeType} ${safeTable ? `(Table ${safeTable})` : ''}</div>
        <div><strong>Date:</strong> ${escapeHtml(new Date(order.createdAt).toLocaleString())}</div>
        <div class="divider"></div>
        <div>
          <strong>Customer:</strong> ${safeCustomerName}<br>
          ${safePhone ? `<strong>Phone:</strong> ${safePhone}<br>` : ''}
          ${safeAddress ? `<strong>Address:</strong> ${safeAddress}<br>` : ''}
        </div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding-bottom: 4px;">Item</th>
              <th style="text-align: right; padding-bottom: 4px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <table>
          <tr><td>Subtotal</td><td style="text-align: right;">₹${order.subtotal || order.totalAmount}</td></tr>
          ${Number(order.deliveryFee || 0) > 0 ? `<tr><td>Delivery Fee</td><td style="text-align: right;">₹${order.deliveryFee}</td></tr>` : ''}
          ${Number(order.packagingCharge || 0) > 0 ? `<tr><td>Packaging</td><td style="text-align: right;">₹${order.packagingCharge}</td></tr>` : ''}
          ${Number(order.taxes || 0) > 0 ? `<tr><td>Taxes (GST)</td><td style="text-align: right;">₹${order.taxes}</td></tr>` : ''}
          ${Number(order.discountAmount || 0) > 0 ? `<tr><td>Discount</td><td style="text-align: right;">-₹${order.discountAmount}</td></tr>` : ''}
          <tr style="font-size: 14px; font-weight: bold; border-top: 1px dashed #000;">
            <td style="padding-top: 4px;">Total</td>
            <td style="text-align: right; padding-top: 4px;">₹${order.totalAmount}</td>
          </tr>
        </table>
        <div class="divider"></div>
        <div class="text-center" style="font-size: 11px;">
          <strong>Payment:</strong> ${safePaymentMethod} • <strong>${safePaymentStatus}</strong>
        </div>
        <div class="text-center" style="font-size: 10px; margin-top: 8px;">
          Thank you for choosing Olive Pizza!<br>
          Freshly baked with love.
        </div>
      </body>
    </html>
  `;

  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1000);
  }, 250);
}

export const PersistentActiveOrderSheet: React.FC = () => {
  const { 
    liveOrders, 
    updateOrderStatus, 
    isActionLoading, 
    activeBranchName 
  } = useManagerStore();

  const [sheetMode, setSheetMode] = useState<SheetMode>('minimized');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reject / Cancel modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Swipe support on mobile/touch screens
  const touchStartX = useRef<number | null>(null);

  // Filter only active orders in the kitchen pipeline
  const activeOrders = useMemo(() => {
    return liveOrders.filter((order) => ACTIVE_STATUS_FLOW.includes(order.status));
  }, [liveOrders]);

  // Keep selected index valid
  useEffect(() => {
    if (selectedIndex >= activeOrders.length && activeOrders.length > 0) {
      setSelectedIndex(activeOrders.length - 1);
    }
  }, [activeOrders.length, selectedIndex]);

  // If a new pending order lands while sheet is active, auto-focus to it if needed
  useEffect(() => {
    const pendingIdx = activeOrders.findIndex(
      (o) => o.status === 'pending' || o.status === 'pending_acceptance'
    );
    if (pendingIdx !== -1 && activeOrders[selectedIndex]?.status !== 'pending' && activeOrders[selectedIndex]?.status !== 'pending_acceptance') {
      setSelectedIndex(pendingIdx);
    }
  }, [activeOrders]);

  const currentOrder: Order | undefined = activeOrders[selectedIndex];

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 50 && selectedIndex > 0) {
      setSelectedIndex((prev) => prev - 1);
    } else if (diff < -50 && selectedIndex < activeOrders.length - 1) {
      setSelectedIndex((prev) => prev + 1);
    }
    touchStartX.current = null;
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (sheetMode === 'minimized') return;
    if (e.key === 'ArrowLeft' && selectedIndex > 0) {
      setSelectedIndex((i) => i - 1);
    } else if (e.key === 'ArrowRight' && selectedIndex < activeOrders.length - 1) {
      setSelectedIndex((i) => i + 1);
    } else if (e.key === 'Escape') {
      if (sheetMode === 'expanded') setSheetMode('half');
      else if (sheetMode === 'half') setSheetMode('minimized');
    }
  }, [sheetMode, selectedIndex, activeOrders.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (activeOrders.length === 0 || !currentOrder) {
    return null;
  }

  const isPending = currentOrder.status === 'pending' || currentOrder.status === 'pending_acceptance';
  const isAccepted = currentOrder.status === 'accepted';
  const isPreparing = currentOrder.status === 'preparing';
  const isReady = currentOrder.status === 'ready';
  const isDeliveryInTransit = ['partner_assigned', 'picked_up', 'out_for_delivery'].includes(currentOrder.status);

  const totalItemsCount = (currentOrder.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);
  const timeElapsed = currentOrder.createdAt 
    ? formatDistanceToNow(new Date(currentOrder.createdAt), { addSuffix: true }) 
    : 'Just now';

  // Primary action button dispatcher
  const handlePrimaryAction = async () => {
    if (!currentOrder || isDeliveryInTransit) return;

    if (isPending) {
      SoundAlertEngine.stopAlarm();
      const res = await updateOrderStatus(currentOrder.id, 'accepted');
      if (res && res.success) {
        SoundAlertEngine.playSound('order_accepted');
        toast.success(`Order #${currentOrder.dailyOrderNumber || currentOrder.id.slice(-6).toUpperCase()} Accepted!`);
      } else {
        toast.error(res?.error || 'Failed to accept order');
      }
    } else if (isAccepted) {
      const res = await updateOrderStatus(currentOrder.id, 'preparing');
      if (res && res.success) {
        toast.success('Baking & preparation started!');
      } else {
        toast.error(res?.error || 'Failed to update order status');
      }
    } else if (isPreparing) {
      const res = await updateOrderStatus(currentOrder.id, 'ready');
      if (res && res.success) {
        SoundAlertEngine.playSound('order_ready');
        toast.success('Food marked as READY for dispatch!');
      } else {
        toast.error(res?.error || 'Failed to update order status');
      }
    } else if (isReady) {
      if (currentOrder.fulfillmentType === 'delivery') {
        const res = await updateOrderStatus(currentOrder.id, 'out_for_delivery');
        if (res && res.success) {
          toast.success('Order dispatched with delivery partner!');
        } else {
          toast.error(res?.error || 'Failed to dispatch order');
        }
      } else {
        const res = await updateOrderStatus(currentOrder.id, 'delivered');
        if (res && res.success) {
          SoundAlertEngine.playOrderDelivered();
          toast.success('Pickup / Handover completed!');
        } else {
          toast.error(res?.error || 'Failed to complete order');
        }
      }
    }
  };

  const handleConfirmReject = async () => {
    if (!currentOrder) return;
    SoundAlertEngine.stopAlarm();
    const reasonText = rejectReason.trim() || 'Rejected by restaurant manager';
    const res = await updateOrderStatus(currentOrder.id, 'cancelled', reasonText);
    if (res && res.success) {
      SoundAlertEngine.playSound('order_cancelled');
      toast.success('Order rejected and cancelled.');
      setRejectModalOpen(false);
      setRejectReason('');
    } else {
      toast.error(res?.error || 'Failed to reject order');
    }
  };

  const handleSilenceAlarm = () => {
    SoundAlertEngine.stopAlarm();
    toast('Alert siren silenced', { icon: '🔇' });
  };

  // Helper formatting for timestamps
  const formatTime = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? '—' : format(d, 'hh:mm a');
    } catch {
      return '—';
    }
  };

  return (
    <>
      {/* Dimmed backdrop when in Half or Expanded view */}
      {sheetMode !== 'minimized' && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setSheetMode('minimized')}
        />
      )}

      {/* Main Sheet Container */}
      <aside
        aria-label="Active order management sheet"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`fixed left-0 lg:left-64 right-0 bottom-0 z-40 bg-[#0e1511] border-t border-[#26332a] text-[#e8eee9] shadow-2xl transition-all duration-300 ease-in-out flex flex-col ${
          sheetMode === 'minimized' 
            ? 'h-16' 
            : sheetMode === 'half' 
            ? 'h-[54vh] rounded-t-3xl border-[#57854d]/40 shadow-green-950/40' 
            : 'h-[92vh] rounded-t-3xl border-[#c6a052]/40 shadow-amber-950/40'
        }`}
      >
        {/* ============================================================== */}
        {/* VIEW 1: MINIMIZED VIEW (BOTTOM BAR ~64px)                      */}
        {/* ============================================================== */}
        {sheetMode === 'minimized' && (
          <div 
            onClick={() => setSheetMode('half')}
            className={`w-full h-full px-4 sm:px-6 flex items-center justify-between cursor-pointer select-none transition-colors ${
              isPending 
                ? 'bg-gradient-to-r from-amber-500/15 via-[#0e1511] to-amber-500/10 hover:from-amber-500/20' 
                : 'hover:bg-[#141d17]'
            }`}
          >
            {/* Left: Queue switcher + Order identifier + Status Badge */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Multi-Order queue controls */}
              {activeOrders.length > 1 && (
                <div 
                  className="flex items-center gap-1 bg-[#151f18] border border-[#26332a] rounded-xl px-1.5 py-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                    disabled={selectedIndex === 0}
                    className="p-1 rounded text-[#a4c29c] hover:text-white disabled:opacity-30 transition"
                    title="Previous active order"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-[#c6a052] px-1">
                    {selectedIndex + 1}/{activeOrders.length}
                  </span>
                  <button
                    onClick={() => setSelectedIndex((i) => Math.min(activeOrders.length - 1, i + 1))}
                    disabled={selectedIndex === activeOrders.length - 1}
                    className="p-1 rounded text-[#a4c29c] hover:text-white disabled:opacity-30 transition"
                    title="Next active order"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Order Number */}
              <div className="flex items-baseline gap-1.5 truncate">
                <span className="text-xs font-bold text-[#7ba372] uppercase hidden sm:inline">Order</span>
                <strong className="text-sm sm:text-base font-extrabold text-white font-mono tracking-tight">
                  {currentOrder.orderNumber || `#${currentOrder.id.slice(0, 6).toUpperCase()}`}
                </strong>
                {currentOrder.dailyOrderNumber && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#c6a052]/20 text-[#c6a052] font-mono">
                    #{currentOrder.dailyOrderNumber}
                  </span>
                )}
              </div>

              {/* Status Badge */}
              <div className="shrink-0">
                {isPending ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                    ACTION NEEDED
                  </span>
                ) : isAccepted ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#57854d]/20 text-[#a4c29c] border border-[#57854d]/30">
                    ACCEPTED
                  </span>
                ) : isPreparing ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-400 animate-bounce" />
                    PREPARING
                  </span>
                ) : currentOrder.status === 'partner_assigned' ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                    <Bike className="w-3 h-3 text-sky-400" />
                    RIDER ASSIGNED
                  </span>
                ) : currentOrder.status === 'picked_up' ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                    <PackageCheck className="w-3 h-3 text-cyan-400" />
                    PICKED UP
                  </span>
                ) : currentOrder.status === 'out_for_delivery' ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                    <Truck className="w-3 h-3 text-indigo-400" />
                    ON THE WAY
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <BellRing className="w-3 h-3 text-emerald-400" />
                    FOOD READY
                  </span>
                )}
              </div>
            </div>

            {/* Center/Info: Items count + Total + Elapsed */}
            <div className="hidden md:flex items-center gap-4 text-xs">
              <span className="text-[#a4c29c]">
                <strong className="text-white font-bold">{totalItemsCount}</strong> items
              </span>
              <span className="text-[#26332a]">•</span>
              <span className="font-extrabold text-[#c6a052] font-mono text-sm">
                ₹{currentOrder.totalAmount}
              </span>
              <span className="text-[#26332a]">•</span>
              <span className="text-[#7ba372] text-[11px] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeElapsed}
              </span>
            </div>

            {/* Right: Quick Action / Tap to open */}
            <div className="flex items-center gap-2">
              {isPending && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrimaryAction();
                  }}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>ACCEPT</span>
                </button>
              )}

              <div className="flex items-center gap-1 text-[#7ba372] hover:text-white transition pl-1">
                <span className="text-[11px] font-bold hidden sm:inline">Details</span>
                <ChevronUp className="w-5 h-5 text-[#c6a052] animate-bounce" />
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2 & 3: HALF-SCREEN OR EXPANDED MODAL SHEET               */}
        {/* ============================================================== */}
        {sheetMode !== 'minimized' && (
          <div className="w-full h-full flex flex-col overflow-hidden">
            {/* Top Drag Handle & Control Header */}
            <div className="shrink-0 pt-3 px-4 sm:px-6 pb-3 border-b border-[#26332a] bg-[#121a15]">
              {/* Drag Pill Handle */}
              <div 
                className="w-12 h-1.5 rounded-full bg-slate-600/60 mx-auto mb-3 cursor-grab hover:bg-slate-500 transition"
                onClick={() => setSheetMode(sheetMode === 'half' ? 'minimized' : 'half')}
              />

              {/* Queue Switcher + Header Toolbar */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                      {currentOrder.orderNumber || `#${currentOrder.id.slice(0, 6).toUpperCase()}`}
                    </h3>
                    {currentOrder.dailyOrderNumber && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#c6a052]/20 text-[#c6a052] font-mono">
                        #{currentOrder.dailyOrderNumber}
                      </span>
                    )}
                  </div>

                  {/* Status Indicator */}
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                    isPending 
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' 
                      : isAccepted 
                      ? 'bg-[#57854d]/20 text-[#a4c29c] border border-[#57854d]/40' 
                      : isPreparing 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                      : currentOrder.status === 'partner_assigned'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : currentOrder.status === 'picked_up'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : currentOrder.status === 'out_for_delivery'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}>
                    {currentOrder.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Right controls: View toggle + Minimize + Print + Silence */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {SoundAlertEngine.isAlarming() && isPending && (
                    <button
                      onClick={handleSilenceAlarm}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/30 transition flex items-center gap-1"
                      title="Silence active siren loop"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Silence</span>
                    </button>
                  )}

                  <button
                    onClick={() => printOrderReceipt(currentOrder, activeBranchName)}
                    className="p-2 rounded-xl bg-[#1b251d] hover:bg-[#232f26] border border-[#26332a] text-[#a4c29c] hover:text-white transition"
                    title="Print kitchen order receipt"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  {sheetMode === 'half' ? (
                    <button
                      onClick={() => setSheetMode('expanded')}
                      className="p-2 rounded-xl bg-[#1b251d] hover:bg-[#232f26] border border-[#26332a] text-[#a4c29c] hover:text-white transition"
                      title="Expand to full screen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setSheetMode('half')}
                      className="p-2 rounded-xl bg-[#1b251d] hover:bg-[#232f26] border border-[#26332a] text-[#a4c29c] hover:text-white transition"
                      title="Collapse to half sheet"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => setSheetMode('minimized')}
                    className="p-2 rounded-xl bg-[#1b251d] hover:bg-[#232f26] border border-[#26332a] text-[#a4c29c] hover:text-white transition"
                    title="Minimize order bar"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Multi-Order queue scrollable tab pills */}
              {activeOrders.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pt-2.5 pb-0.5 no-scrollbar">
                  {activeOrders.map((ord, idx) => {
                    const isSelected = idx === selectedIndex;
                    const ordPending = ord.status === 'pending' || ord.status === 'pending_acceptance';
                    return (
                      <button
                        key={ord.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`px-3 py-1 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#57854d] text-white shadow-md'
                            : ordPending
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : 'bg-[#151f18] text-[#a4c29c] hover:text-white border border-[#26332a]'
                        }`}
                      >
                        <span>{ord.orderNumber || `#${ord.id.slice(0, 5)}`}</span>
                        <span className="text-[10px] opacity-80 uppercase">
                          • {ord.status === 'preparing' ? 'Baking' : ord.status === 'partner_assigned' ? 'Assigned' : ord.status === 'picked_up' ? 'Picked Up' : ord.status === 'out_for_delivery' ? 'On Way' : ord.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scrollable Sheet Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {/* Customer & Fulfillment Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Customer card */}
                <div className="p-3.5 rounded-2xl bg-[#121a15] border border-[#26332a] space-y-1.5">
                  <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">
                    Customer Information
                  </span>
                  <div className="flex items-center justify-between">
                    <strong className="text-white text-sm block">
                      {currentOrder.customerName || 'Customer'}
                    </strong>
                    {currentOrder.contactPhone && (
                      <a
                        href={`tel:${currentOrder.contactPhone}`}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-500/30 transition"
                      >
                        <Phone className="w-3 h-3" /> Call {currentOrder.contactPhone}
                      </a>
                    )}
                  </div>
                  {currentOrder.customerEmail && (
                    <span className="text-[#a4c29c] block truncate">{currentOrder.customerEmail}</span>
                  )}
                </div>

                {/* Destination & Fulfillment card */}
                <div className="p-3.5 rounded-2xl bg-[#121a15] border border-[#26332a] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider">
                      Fulfillment Destination
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                      currentOrder.fulfillmentType === 'delivery'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : currentOrder.fulfillmentType === 'dine_in'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    }`}>
                      {currentOrder.fulfillmentType === 'delivery' ? (
                        <Truck className="w-3 h-3" />
                      ) : currentOrder.fulfillmentType === 'dine_in' ? (
                        <UtensilsCrossed className="w-3 h-3" />
                      ) : (
                        <ShoppingBag className="w-3 h-3" />
                      )}
                      <span>{currentOrder.fulfillmentType || 'Delivery'}</span>
                    </span>
                  </div>

                  {currentOrder.tableNumber && (
                    <div className="text-white font-bold font-mono text-sm">
                      Dine-in Table #{currentOrder.tableNumber}
                    </div>
                  )}

                  {currentOrder.deliveryAddress && (
                    <div className="flex items-start gap-1.5 text-[#a4c29c]">
                      <MapPin className="w-3.5 h-3.5 text-[#7ba372] shrink-0 mt-0.5" />
                      <span className="text-[11px] leading-snug">
                        {typeof currentOrder.deliveryAddress === 'object'
                          ? [currentOrder.deliveryAddress.addressLine, currentOrder.deliveryAddress.city].filter(Boolean).join(', ')
                          : currentOrder.deliveryAddress}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Partner Dispatch / Tracking Card */}
              {(isDeliveryInTransit || currentOrder.deliveryPartnerName || currentOrder.fulfillmentType === 'delivery') && (
                <div className={`p-3.5 rounded-2xl border space-y-2.5 text-xs ${
                  isDeliveryInTransit
                    ? 'bg-[#15231c] border-sky-500/40 shadow-lg shadow-sky-950/20'
                    : 'bg-[#121a15] border-[#26332a]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">
                      Delivery Tracking & Dispatch
                    </span>
                    {isDeliveryInTransit && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40">
                        {currentOrder.status === 'out_for_delivery'
                          ? '🚀 En Route to Customer'
                          : currentOrder.status === 'picked_up'
                          ? '📦 Picked Up by Partner'
                          : '🛵 Partner En Route to Restaurant'}
                      </span>
                    )}
                  </div>

                  {currentOrder.deliveryPartnerName ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          currentOrder.status === 'out_for_delivery'
                            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                            : currentOrder.status === 'picked_up'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        }`}>
                          <Bike className="w-4 h-4" />
                        </div>
                        <div>
                          <strong className="text-white text-sm block">{currentOrder.deliveryPartnerName}</strong>
                          <span className="text-[11px] text-[#a4c29c]">
                            {currentOrder.deliveryPartnerPhone ? `Phone: ${currentOrder.deliveryPartnerPhone}` : 'Assigned Delivery Partner'}
                          </span>
                        </div>
                      </div>
                      {currentOrder.deliveryPartnerPhone && (
                        <a
                          href={`tel:${currentOrder.deliveryPartnerPhone}`}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1.5 transition text-xs"
                        >
                          <Phone className="w-3.5 h-3.5" /> Call Partner
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[#a4c29c]">
                      <span>No delivery partner assigned yet</span>
                      {currentOrder.fulfillmentType === 'delivery' && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                          Awaiting Dispatch
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Special Instructions / Notes Banner */}
              {((currentOrder as any).deliveryInstructions || (currentOrder as any).customerNotes || (currentOrder as any).notes || (currentOrder as any).instructions) && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-300 font-bold mb-0.5">⚠️ Special Instructions:</strong>
                    <span>
                      {(currentOrder as any).deliveryInstructions || (currentOrder as any).customerNotes || (currentOrder as any).notes || (currentOrder as any).instructions}
                    </span>
                  </div>
                </div>
              )}

              {/* Itemized Order List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-[#c6a052]" />
                    <span>Ordered Items ({totalItemsCount})</span>
                  </span>
                  <span className="text-[10px] text-[#7ba372] uppercase font-bold">Kitchen Spec</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#121a15] border border-[#26332a] divide-y divide-[#26332a]/60 space-y-2.5">
                  {(currentOrder.items || []).map((it, idx) => (
                    <div key={idx} className={idx > 0 ? 'pt-2.5 flex justify-between items-start text-xs' : 'flex justify-between items-start text-xs'}>
                      <div className="space-y-1">
                        <div className="font-bold text-white text-sm">
                          <span className="text-[#c6a052] font-mono">{it.quantity}×</span> {it.name}
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {(it.variant || it.size) && (
                            <span className="px-2 py-0.5 rounded bg-[#1a241c] text-[#a4c29c] border border-[#26332a]">
                              Size: {it.variant || it.size}
                            </span>
                          )}
                          {it.crust && (
                            <span className="px-2 py-0.5 rounded bg-[#1a241c] text-[#a4c29c] border border-[#26332a]">
                              Crust: {it.crust}
                            </span>
                          )}
                        </div>
                        {it.addons && it.addons.length > 0 && (
                          <div className="text-[11px] text-emerald-400 font-medium">
                            + {it.addons.map((a) => `${a.name} (+₹${a.price})`).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-white font-bold text-sm">
                          ₹{((it.price || 0) * (it.quantity || 1)).toFixed(0)}
                        </span>
                        <span className="block text-[10px] text-[#7ba372] font-mono">
                          ₹{it.price} each
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ============================================================== */}
              {/* EXTRA DETAILS IN EXPANDED VIEW                                 */}
              {/* ============================================================== */}
              {sheetMode === 'expanded' && (
                <>
                  {/* Financial Breakdown & Payment Info */}
                  <div className="p-4 rounded-2xl bg-[#121a15] border border-[#26332a] space-y-2 text-xs">
                    <div className="flex justify-between text-[#a4c29c]">
                      <span>Items Subtotal</span>
                      <span className="font-mono text-white">₹{currentOrder.subtotal || currentOrder.totalAmount}</span>
                    </div>
                    {Number(currentOrder.deliveryFee || 0) > 0 && (
                      <div className="flex justify-between text-[#a4c29c]">
                        <span>Delivery Fee</span>
                        <span className="font-mono text-white">₹{currentOrder.deliveryFee}</span>
                      </div>
                    )}
                    {Number(currentOrder.taxes || 0) > 0 && (
                      <div className="flex justify-between text-[#a4c29c]">
                        <span>Taxes (GST)</span>
                        <span className="font-mono text-white">₹{currentOrder.taxes}</span>
                      </div>
                    )}
                    {Number(currentOrder.packagingCharge || 0) > 0 && (
                      <div className="flex justify-between text-[#a4c29c]">
                        <span>Packaging Charge</span>
                        <span className="font-mono text-white">₹{currentOrder.packagingCharge}</span>
                      </div>
                    )}
                    {Number(currentOrder.discountAmount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount {currentOrder.appliedCouponCode ? `(${currentOrder.appliedCouponCode})` : ''}</span>
                        <span className="font-mono">-₹{currentOrder.discountAmount}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[#26332a] flex justify-between items-center text-sm font-extrabold text-white">
                      <span>Grand Total</span>
                      <span className="text-[#c6a052] font-mono text-base">₹{currentOrder.totalAmount}</span>
                    </div>

                    {/* Payment Status Bar */}
                    <div className="pt-2 flex items-center justify-between text-[11px] border-t border-[#26332a]/60">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#7ba372]" />
                        <span className="text-[#a4c29c]">Payment:</span>
                        <strong className="text-white uppercase font-mono">{currentOrder.paymentMethod || 'COD'}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[#a4c29c]">Status:</span>
                        <span className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${
                          currentOrder.paymentStatus === 'paid' 
                            ? 'bg-emerald-500/20 text-emerald-300' 
                            : 'bg-amber-500/20 text-amber-300 animate-pulse'
                        }`}>
                          {currentOrder.paymentStatus || 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lifecycle Timeline */}
                  <div className="p-3.5 rounded-2xl bg-[#121a15] border border-[#26332a] space-y-2 text-xs">
                    <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">
                      Kitchen Lifecycle Timeline
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#7ba372] block">Placed:</span>
                        <span className="text-white font-mono">{formatTime(currentOrder.createdAt)}</span>
                      </div>
                      <div>
                        <span className="text-[#7ba372] block">Accepted:</span>
                        <span className="text-white font-mono">{formatTime(currentOrder.acceptedAt)}</span>
                      </div>
                      <div>
                        <span className="text-[#7ba372] block">Baking:</span>
                        <span className="text-[#c6a052] font-mono">{formatTime(currentOrder.preparingAt)}</span>
                      </div>
                      <div>
                        <span className="text-[#7ba372] block">Food Ready:</span>
                        <span className="text-emerald-400 font-mono">{formatTime(currentOrder.readyAt)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Bottom Primary Action Bar */}
            <div className="shrink-0 p-4 border-t border-[#26332a] bg-[#121a15] space-y-2">
              {isDeliveryInTransit ? (
                /* Read-Only Delivery Tracking View (No kitchen action buttons) */
                <div className="p-3.5 rounded-2xl bg-[#162118] border border-sky-500/30 flex items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      currentOrder.status === 'out_for_delivery'
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        : currentOrder.status === 'picked_up'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    }`}>
                      {currentOrder.status === 'out_for_delivery' ? (
                        <Truck className="w-5 h-5 animate-pulse" />
                      ) : currentOrder.status === 'picked_up' ? (
                        <PackageCheck className="w-5 h-5" />
                      ) : (
                        <Bike className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-white">
                          {currentOrder.status === 'out_for_delivery'
                            ? 'Out for Delivery'
                            : currentOrder.status === 'picked_up'
                            ? 'Order Picked Up'
                            : 'Rider Assigned'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase">
                          In Transit (Read-Only)
                        </span>
                      </div>
                      <p className="text-[11px] text-[#a4c29c] truncate mt-0.5">
                        {currentOrder.deliveryPartnerName
                          ? `Rider: ${currentOrder.deliveryPartnerName}${currentOrder.deliveryPartnerPhone ? ` • ${currentOrder.deliveryPartnerPhone}` : ''}`
                          : 'Delivery partner coordinating with customer'}
                      </p>
                    </div>
                  </div>
                  {currentOrder.deliveryPartnerPhone && (
                    <a
                      href={`tel:${currentOrder.deliveryPartnerPhone}`}
                      className="px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center gap-1.5 shrink-0 transition"
                    >
                      <Phone className="w-3.5 h-3.5" /> Call Rider
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {/* Primary Transition Action */}
                  <button
                    onClick={handlePrimaryAction}
                    disabled={isActionLoading}
                    className={`flex-1 py-3 px-4 rounded-2xl font-black text-sm tracking-wide transition shadow-lg flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 ${
                      isPending
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                        : isAccepted
                        ? 'bg-[#57854d] hover:bg-[#436b3b] text-white shadow-green-950/40'
                        : isPreparing
                        ? 'bg-[#c6a052] hover:bg-[#d8b264] text-black shadow-amber-950/40'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                    }`}
                  >
                    {isPending ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>ACCEPT ORDER</span>
                      </>
                    ) : isAccepted ? (
                      <>
                        <Flame className="w-4 h-4" />
                        <span>START PREPARING (SEND TO OVEN)</span>
                      </>
                    ) : isPreparing ? (
                      <>
                        <BellRing className="w-4 h-4" />
                        <span>MARK FOOD AS READY</span>
                      </>
                    ) : currentOrder.fulfillmentType === 'delivery' ? (
                      <>
                        <Truck className="w-4 h-4" />
                        <span>DISPATCH / OUT FOR DELIVERY</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>COMPLETE ORDER / HANDOVER</span>
                      </>
                    )}
                  </button>

                  {/* Reject / Cancel Trigger */}
                  <button
                    onClick={() => setRejectModalOpen(true)}
                    disabled={isActionLoading}
                    className="py-3 px-4 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs transition active:scale-98 disabled:opacity-50"
                    title="Reject or cancel order"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* View mode toggle prompt */}
              <div className="flex justify-between items-center text-[11px] text-[#7ba372] pt-1">
                <span>
                  Swipe left/right or use arrows to navigate orders ({selectedIndex + 1}/{activeOrders.length})
                </span>
                <button
                  onClick={() => setSheetMode(sheetMode === 'half' ? 'expanded' : 'half')}
                  className="text-[#c6a052] hover:underline font-bold"
                >
                  {sheetMode === 'half' ? 'View Full Sheet ↑' : 'Collapse to Half ↓'}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ============================================================== */}
      {/* REJECT / CANCEL REASON MODAL                                    */}
      {/* ============================================================== */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#121814] border border-[#26332a] rounded-3xl p-6 shadow-2xl text-[#e8eee9] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>Reject / Cancel Order #{currentOrder?.dailyOrderNumber || currentOrder?.orderNumber}</span>
              </h3>
              <button
                onClick={() => setRejectModalOpen(false)}
                className="p-1 rounded-lg text-[#7ba372] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#a4c29c]">
              Please specify the operational reason for rejecting this order:
            </p>

            {/* Quick Reason Buttons */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                'Item out of stock',
                'Kitchen overload / peak rush',
                'Customer requested cancellation',
                'Delivery address outside range',
                'Store closing soon',
                'Duplicate order'
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectReason(reason)}
                  className={`p-2 rounded-xl text-left border text-[11px] font-semibold transition ${
                    rejectReason === reason
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-[#1b251d] text-[#a4c29c] border-[#26332a] hover:text-white'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            {/* Custom Reason Input */}
            <textarea
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Or enter custom cancellation explanation..."
              className="w-full p-3 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-rose-500"
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#26332a]">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#a4c29c] hover:text-white bg-[#1b251d] border border-[#26332a]"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isActionLoading}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
