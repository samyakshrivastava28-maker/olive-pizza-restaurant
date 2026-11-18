import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  ArrowRight, 
  X, 
  ShoppingBag, 
  Clock, 
  Minimize2,
  Maximize2,
  CheckCircle2
} from 'lucide-react';
import { SoundAlertEngine } from '../../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../../lib/NotificationDeduplicator';
import { useManagerStore } from '../../store/managerStore';
import toast from 'react-hot-toast';

export interface AliveOrderData {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  amount?: number;
  itemCount?: number;
  orderType?: string;
  createdAt?: string;
}

interface AliveOrderAlarmModalProps {
  order: AliveOrderData | null;
  onAcknowledge: (orderId: string) => void;
  onDismiss: () => void;
}

export const AliveOrderAlarmModal: React.FC<AliveOrderAlarmModalProps> = ({
  order,
  onAcknowledge,
  onDismiss
}) => {
  const navigate = useNavigate();
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [prepMinutes, setPrepMinutes] = useState(20);

  const { updateOrderStatus } = useManagerStore();

  useEffect(() => {
    if (!order) {
      setSecondsElapsed(0);
      setIsMinimized(false);
      return;
    }

    const timer = setInterval(() => {
      setSecondsElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [order]);

  if (!order) return null;

  const handleMute = () => {
    SoundAlertEngine.stopAlarm();
    setIsMuted(true);
    if (order?.orderId) {
      NotificationDeduplicator.silenceOrder(order.orderId);
    }
  };

  const handleViewOrder = () => {
    SoundAlertEngine.stopAlarm();
    onAcknowledge(order.orderId);
    navigate(`/orders`);
  };

  const handleQuickAccept = async () => {
    if (isAccepting) return;
    setIsAccepting(true);
    SoundAlertEngine.stopAlarm();
    try {
      const res = await updateOrderStatus(order.orderId, 'preparing', undefined, prepMinutes);
      if (res && res.success !== false) {
        SoundAlertEngine.playSound('order_accepted');
        toast.success(`Order #${order.orderNumber || order.orderId.slice(-6).toUpperCase()} Accepted (${prepMinutes}m prep)`);
        onAcknowledge(order.orderId);
      } else {
        toast.error(res?.error || 'Could not accept order');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error accepting order');
    } finally {
      setIsAccepting(false);
    }
  };

  const formattedAmount = order.amount ? `₹${Number(order.amount).toFixed(0)}` : '₹---';
  const orderNum = order.orderNumber || `#${order.orderId.slice(-6).toUpperCase()}`;

  // ── MINIMIZED HEADS-UP CALL PILL ──
  if (isMinimized) {
    return (
      <div className="fixed top-3 inset-x-0 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
        <div 
          className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 bg-[#0d140e]/95 backdrop-blur-2xl border-2 border-[#57854d] rounded-full shadow-[0_15px_35px_rgba(16,185,129,0.35)] text-white max-w-md w-full"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-mono font-black text-white leading-tight truncate">
                {orderNum} • {formattedAmount}
              </p>
              <p className="text-[10px] text-[#86a77d] truncate">
                {order.customerName || 'Online Order'} ({secondsElapsed}s)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleQuickAccept}
              disabled={isAccepting}
              className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 active:scale-95 text-white font-bold text-xs rounded-full shadow transition-all flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isAccepting ? '...' : 'Accept'}</span>
            </button>

            <button
              type="button"
              onClick={handleMute}
              className="p-1.5 rounded-full hover:bg-white/10 text-[#c6a052] transition cursor-pointer"
              title={isMuted ? 'Muted' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="p-1.5 rounded-full hover:bg-white/10 text-white transition cursor-pointer"
              title="Expand Details"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FULL 3D HALF-SCREEN CALL OVERLAY CARD ──
  return (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-6 duration-300">
      {/* 3D Floating Glassmorphic Notification Card */}
      <div 
        className="pointer-events-auto w-full max-w-lg bg-[#0d140e]/95 backdrop-blur-2xl border-2 border-[#57854d]/80 rounded-3xl p-5 shadow-[0_20px_50px_rgba(16,185,129,0.25)] text-white relative overflow-hidden transform hover:scale-[1.005] transition-transform duration-200"
        style={{
          boxShadow: '0 25px 50px -12px rgba(87, 133, 77, 0.45), 0 0 30px rgba(87, 133, 77, 0.35)'
        }}
      >
        {/* Animated Sonic Glowing Rings (Alive breathing aura) */}
        <div className="absolute -top-12 -left-12 w-36 h-36 bg-[#57854d]/30 rounded-full blur-2xl animate-pulse pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-36 h-36 bg-[#c6a052]/20 rounded-full blur-2xl pointer-events-none" />

        {/* Top Header: Live Badge + Elapsed Timer + Minimize + Dismiss */}
        <div className="flex items-center justify-between gap-3 relative z-10 pb-3 border-b border-[#213024]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
              New Kitchen Order Incoming
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#18231a] border border-[#26372a] text-[11px] font-mono font-bold text-[#c6a052]">
              <Clock className="w-3 h-3 text-[#c6a052]" />
              <span>{secondsElapsed}s ago</span>
            </div>

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-xl text-[#86a77d] hover:text-white hover:bg-[#1a261c] transition cursor-pointer"
              title="Minimize to floating pill"
            >
              <Minimize2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                SoundAlertEngine.stopAlarm();
                if (order?.orderId) {
                  NotificationDeduplicator.silenceOrder(order.orderId);
                }
                onDismiss();
              }}
              className="p-1 rounded-xl text-[#86a77d] hover:text-white hover:bg-[#1a261c] transition cursor-pointer"
              aria-label="Dismiss banner"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body: 3D Animated Siren Icon + Order Details */}
        <div className="py-4 flex items-center gap-4 relative z-10">
          {/* 3D Pulsing Siren Container */}
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#57854d] to-[#2d4d25] border-2 border-[#86a77d]/60 flex items-center justify-center text-white shadow-xl shadow-emerald-950/60 transform hover:rotate-6 transition-transform">
              <Bell className="w-7 h-7 text-white animate-bounce" />
            </div>
            {/* Sonic Wave Particle Ring */}
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400 animate-ping opacity-40 pointer-events-none" />
          </div>

          {/* Order Snapshot */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xl font-black font-mono text-white tracking-tight truncate">
                {orderNum}
              </h3>
              <span className="text-xl font-black text-[#c6a052] font-mono shrink-0">
                {formattedAmount}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#a4c29c] mt-0.5 truncate">
              <span className="font-semibold text-white truncate">
                {order.customerName || 'Online Customer'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-mono shrink-0">
                <ShoppingBag className="w-3 h-3 text-[#86a77d]" />
                {order.itemCount || 1} items
              </span>
              <span>•</span>
              <span className="capitalize px-1.5 py-0.2 rounded-md bg-[#18231a] border border-[#2a3c2e] text-[10px] text-emerald-400 shrink-0">
                {order.orderType || 'Delivery'}
              </span>
            </div>
          </div>
        </div>

        {/* Prep Time Selection Chips */}
        <div className="py-2.5 px-3 bg-[#131c15] rounded-2xl border border-[#213024] flex items-center justify-between gap-2 mb-3 relative z-10">
          <span className="text-[11px] font-bold text-[#86a77d] uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#c6a052]" /> Prep Time:
          </span>
          <div className="flex gap-1.5">
            {[15, 20, 25, 30].map(mins => (
              <button
                key={mins}
                type="button"
                onClick={() => setPrepMinutes(mins)}
                className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  prepMinutes === mins
                    ? 'bg-[#57854d] text-white shadow-xs'
                    : 'bg-[#1b271d] text-[#86a77d] hover:text-white border border-[#253627]'
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>

        {/* Action Controls: Quick Accept + View Order + Mute Siren */}
        <div className="flex items-center gap-2.5 relative z-10 pt-1">
          {/* Mute Siren Button */}
          <button
            type="button"
            onClick={handleMute}
            disabled={isMuted}
            className={`px-3 py-3 rounded-2xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isMuted
                ? 'bg-[#141d16] border-[#223024] text-[#63806a] cursor-not-allowed'
                : 'bg-[#18231a] hover:bg-[#202e23] border-[#2a3c2e] text-[#c6a052] hover:text-white'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#c6a052]" />}
            <span>{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          {/* Quick Accept Directly */}
          <button
            type="button"
            onClick={handleQuickAccept}
            disabled={isAccepting}
            className="flex-1 py-3 px-3 bg-gradient-to-r from-[#57854d] to-[#36592e] hover:from-[#659959] hover:to-[#436e37] active:scale-[0.98] border border-[#86a77d]/50 text-white font-black text-xs sm:text-sm rounded-2xl transition-all shadow-lg shadow-[#57854d]/30 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-[#d9f5d0]" />
            <span>{isAccepting ? 'Accepting...' : `Accept (${prepMinutes}m)`}</span>
          </button>

          {/* Open Kitchen Ticket */}
          <button
            type="button"
            onClick={handleViewOrder}
            className="p-3 bg-[#18231a] hover:bg-[#223325] border border-[#2a3c2e] text-white rounded-2xl transition cursor-pointer"
            title="Open Details"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
