import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bike, 
  Phone, 
  AlertCircle, 
  Loader2, 
  Navigation, 
  ShieldCheck,
  Send
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useManagerStore } from '../../store/managerStore';
import { useLiveRiderStore } from '../../store/liveRiderStore';
import type { Order } from '../../types/restaurant';
import toast from 'react-hot-toast';

interface AssignRiderModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onAssigned?: (riderName: string) => void;
}

interface EligibleRiderItem {
  uid: string;
  name: string;
  phone: string;
  distanceMeters?: number;
  latitude?: number;
  longitude?: number;
  isOnline?: boolean;
  status?: string;
  vehicleType?: string;
  vehicleNumber?: string;
}

export const AssignRiderModal: React.FC<AssignRiderModalProps> = ({
  isOpen,
  order,
  onClose,
  onAssigned
}) => {
  const activeBranchId = useManagerStore((s) => s.activeBranchId || 'main_branch');
  const activeBranchName = useManagerStore((s) => s.activeBranchName || 'Current Branch');
  const updateOrderStatus = useManagerStore((s) => s.updateOrderStatus);
  const fleetRiders = useLiveRiderStore((s) => s.riders);

  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [eligibleRiders, setEligibleRiders] = useState<EligibleRiderItem[]>([]);
  const [selectedRiderUid, setSelectedRiderUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !order) {
      setEligibleRiders([]);
      setSelectedRiderUid(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    // 1. Fetch eligible riders from authoritative backend endpoint
    fetchApi(`/api/orders/${order.id}/eligible-riders`)
      .then(async (res) => {
        if (!res) return { riders: [] };
        return res;
      })
      .then((data) => {
        if (!isMounted) return;
        const apiRiders = Array.isArray(data?.riders) ? data.riders : [];
        
        // Merge with client live store riders strictly for current branch to ensure fresh roster
        const branchFleet = (fleetRiders || []).filter(
          (r) => !r.branchId || r.branchId === activeBranchId || activeBranchId === 'all'
        );

        const mergedMap = new Map<string, EligibleRiderItem>();

        // First populate from live fleet store
        branchFleet.forEach((r) => {
          mergedMap.set(r.id, {
            uid: r.id,
            name: r.name || 'Rider',
            phone: r.phone || '',
            distanceMeters: undefined,
            isOnline: Boolean(r.isOnline),
            status: r.status || (r.isOnline ? 'available' : 'offline'),
            vehicleType: r.vehicleType || 'Bike',
            vehicleNumber: r.vehicleNumber || ''
          });
        });

        // Then overlay API eligible riders with scored distances & coordinates
        apiRiders.forEach((ar: any) => {
          const uid = ar.uid || ar.id;
          const existing = mergedMap.get(uid);
          mergedMap.set(uid, {
            uid,
            name: ar.name || existing?.name || 'Rider',
            phone: ar.phone || existing?.phone || '',
            distanceMeters: ar.distanceMeters,
            latitude: ar.latitude,
            longitude: ar.longitude,
            isOnline: true,
            status: 'available',
            vehicleType: existing?.vehicleType || 'Bike',
            vehicleNumber: existing?.vehicleNumber || ''
          });
        });

        const list = Array.from(mergedMap.values());
        // Sort: available and online first, then by closest distance
        list.sort((a, b) => {
          const aOnline = a.isOnline ? 1 : 0;
          const bOnline = b.isOnline ? 1 : 0;
          if (aOnline !== bOnline) return bOnline - aOnline;
          return (a.distanceMeters ?? 99999) - (b.distanceMeters ?? 99999);
        });

        setEligibleRiders(list);
        if (list.length > 0 && list[0].isOnline) {
          setSelectedRiderUid(list[0].uid);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[AssignRiderModal] Error loading eligible riders:', err);
        // Fallback to local fleet store
        const branchFleet = (fleetRiders || [])
          .filter((r) => !r.branchId || r.branchId === activeBranchId)
          .map((r) => ({
            uid: r.id,
            name: r.name || 'Rider',
            phone: r.phone || '',
            isOnline: Boolean(r.isOnline),
            status: r.status || 'available',
            vehicleType: r.vehicleType || 'Bike',
            vehicleNumber: r.vehicleNumber || ''
          }));
        setEligibleRiders(branchFleet);
        if (branchFleet.length > 0) {
          setSelectedRiderUid(branchFleet[0].uid);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, order, activeBranchId, fleetRiders]);

  if (!isOpen || !order) return null;

  const handleAssign = async () => {
    if (!selectedRiderUid) {
      toast.error('Please select an active delivery rider to assign');
      return;
    }

    const selectedRider = eligibleRiders.find((r) => r.uid === selectedRiderUid);
    setAssigning(true);
    setError(null);

    try {
      const res = await fetchApi(`/api/orders/${order.id}/assign-rider`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Target': 'RESTAURANT_MANAGER',
          'X-App-Source': 'RESTAURANT_MANAGER'
        },
        body: JSON.stringify({ riderId: selectedRiderUid })
      });

      if (res && res.success) {
        toast.success(`🛵 Order assigned to ${selectedRider?.name || 'Rider'} successfully!`);
        if (onAssigned) onAssigned(selectedRider?.name || 'Rider');
        onClose();
      } else {
        const errorMsg = res?.error || 'Failed to assign rider to order';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err: any) {
      console.error('[AssignRiderModal] Error:', err);
      const errorMsg = err?.message || 'Server error while assigning rider';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setAssigning(false);
    }
  };

  const handleQuickAutoDispatch = async () => {
    setAssigning(true);
    setError(null);
    try {
      const res = await updateOrderStatus(order.id, 'out_for_delivery');
      if (res && res.success) {
        toast.success('Order marked as Out for Delivery!');
        if (onAssigned) onAssigned('Dispatched Partner');
        onClose();
      } else {
        const errorMsg = res?.error || 'Failed to dispatch order';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-lg rounded-2xl bg-[#141b16] border border-[#26332a] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#26332a] bg-[#0d120f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#c6a052]/10 border border-[#c6a052]/30 flex items-center justify-center text-[#c6a052]">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Assign Delivery Partner</span>
                <span className="px-2 py-0.5 rounded-full bg-[#1b241e] text-[#c6a052] font-mono text-[10px] border border-[#26332a]">
                  {order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`}
                </span>
              </h2>
              <p className="text-xs text-[#a4c29c]">
                Branch: <strong className="text-white">{activeBranchName}</strong> • Delivery Fulfillment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={assigning}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Order Delivery Preview Box */}
        <div className="p-4 bg-[#18221b] border-b border-[#26332a] text-xs space-y-1.5">
          <div className="flex justify-between items-center text-white">
            <span className="text-[#a4c29c]">Customer:</span>
            <span className="font-bold">{order.customerName} {order.contactPhone ? `(${order.contactPhone})` : ''}</span>
          </div>
          <div className="flex items-start justify-between text-white gap-2">
            <span className="text-[#a4c29c] shrink-0">Address:</span>
            <span className="text-right text-slate-300 truncate max-w-[280px]">
              {typeof order.deliveryAddress === 'object' 
                ? order.deliveryAddress?.addressLine || order.deliveryAddress?.city 
                : order.deliveryAddress || 'Standard Delivery Location'}
            </span>
          </div>
        </div>

        {/* Riders List Section */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-[#c6a052] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Eligible Riders for {activeBranchName}
            </span>
            <span className="text-[11px] text-[#7ba372] font-mono">
              {eligibleRiders.filter((r) => r.isOnline).length} Active Online
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-[#a4c29c] space-y-2">
              <Loader2 className="w-6 h-6 text-[#c6a052] animate-spin mx-auto" />
              <p>Scanning active fleet and location telemetry...</p>
            </div>
          ) : eligibleRiders.length === 0 ? (
            <div className="py-10 text-center rounded-xl bg-[#0d120f] border border-[#26332a] p-6 space-y-2">
              <Bike className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-white">No Active Riders Available</p>
              <p className="text-xs text-[#7ba372] max-w-xs mx-auto">
                No delivery partners are currently online in {activeBranchName}. You can self-dispatch or notify partners to come online.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {eligibleRiders.map((rider) => {
                const isSelected = selectedRiderUid === rider.uid;
                const isOnline = Boolean(rider.isOnline);

                return (
                  <div
                    key={rider.uid}
                    onClick={() => setSelectedRiderUid(rider.uid)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#57854d]/20 border-[#57854d] shadow-md shadow-green-950/20'
                        : 'bg-[#0d120f] border-[#26332a] hover:border-[#3d5242]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                        isOnline 
                          ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40' 
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {rider.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-bold text-white">{rider.name}</strong>
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#10b981] animate-pulse' : 'bg-slate-600'}`} />
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#a4c29c] mt-0.5">
                          {rider.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-[#7ba372]" /> {rider.phone}
                            </span>
                          )}
                          <span>• {rider.vehicleType || 'Bike'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      {rider.distanceMeters !== undefined ? (
                        <div className="text-xs font-mono font-bold text-[#c6a052] flex items-center gap-1 justify-end">
                          <Navigation className="w-3 h-3" />
                          <span>
                            {rider.distanceMeters < 500
                              ? 'At Store'
                              : `${(rider.distanceMeters / 1000).toFixed(1)} km away`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-mono text-[#7ba372]">
                          {isOnline ? 'Ready for Dispatch' : 'Offline'}
                        </span>
                      )}
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isOnline 
                          ? 'bg-[#10b981]/15 text-[#10b981]' 
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {rider.status || (isOnline ? 'available' : 'offline')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#26332a] bg-[#0d120f] flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleQuickAutoDispatch}
            disabled={assigning}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1b241e] hover:bg-[#26332a] border border-[#26332a] text-xs font-bold text-[#a4c29c] hover:text-white transition-all disabled:opacity-50"
            title="Dispatch without binding a specific rider ID"
          >
            Quick Self-Dispatch
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={assigning}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleAssign}
              disabled={assigning || !selectedRiderUid || eligibleRiders.length === 0}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[#57854d] hover:bg-[#446c3b] disabled:opacity-50 text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg shadow-green-950/40 transition-all cursor-pointer"
            >
              {assigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Assigning & Notifying...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Assign Rider & Dispatch</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
