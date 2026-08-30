import React, { useState } from 'react';
import { 
  Flame, 
  Clock, 
  Phone, 
  MapPin, 
  ShoppingBag, 
  Truck, 
  UtensilsCrossed, 
  Check, 
  X, 
  BellRing, 
  Eye, 
  Search, 
  AlertCircle
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import type { Order, OrderStatus } from '../types/restaurant';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

export const LiveOrdersPage: React.FC = () => {
  const { 
    liveOrders, 
    isOrdersLoading, 
    isActionLoading, 
    updateOrderStatus 
  } = useManagerStore();

  const [selectedStatusTab, setSelectedStatusTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);

  // Reject modal state
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filteredOrders = liveOrders.filter((order) => {
    const matchesSearch = 
      (order.orderNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.contactPhone || '').includes(searchQuery);

    if (!matchesSearch) return false;

    if (selectedStatusTab === 'all') return true;
    if (selectedStatusTab === 'pending') return order.status === 'pending' || order.status === 'pending_acceptance';
    if (selectedStatusTab === 'preparing') return order.status === 'preparing' || order.status === 'accepted';
    if (selectedStatusTab === 'ready') return order.status === 'ready';
    if (selectedStatusTab === 'out_for_delivery') return order.status === 'out_for_delivery' || order.status === 'partner_assigned';
    return true;
  });

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    const success = await updateOrderStatus(orderId, nextStatus);
    if (success) {
      toast.success(`Order moved to ${nextStatus.toUpperCase().replace(/_/g, ' ')}`);
      if (selectedOrderDetails?.id === orderId) {
        setSelectedOrderDetails(null);
      }
    } else {
      toast.error('Failed to update order status');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectOrderId) return;
    const success = await updateOrderStatus(rejectOrderId, 'cancelled', rejectReason.trim() || 'Rejected by restaurant manager');
    if (success) {
      toast.success('Order cancelled/rejected');
      setRejectOrderId(null);
      setRejectReason('');
    } else {
      toast.error('Failed to reject order');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Flame className="w-6 h-6 text-[#c6a052]" />
            Live Restaurant Orders
          </h1>
          <p className="text-xs text-[#a4c29c] mt-0.5">
            Real-time live queue for accepting, preparing, packing, and dispatching customer orders.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#7ba372] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order #, name, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#141b16] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'All Live', count: liveOrders.length },
          { id: 'pending', label: 'Pending', count: liveOrders.filter((o) => o.status === 'pending' || o.status === 'pending_acceptance').length },
          { id: 'preparing', label: 'In Kitchen', count: liveOrders.filter((o) => o.status === 'preparing' || o.status === 'accepted').length },
          { id: 'ready', label: 'Ready for Dispatch', count: liveOrders.filter((o) => o.status === 'ready').length },
          { id: 'out_for_delivery', label: 'Out for Delivery', count: liveOrders.filter((o) => o.status === 'out_for_delivery' || o.status === 'partner_assigned').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedStatusTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              selectedStatusTab === tab.id
                ? 'bg-[#57854d] text-white shadow-md shadow-green-950/40'
                : 'bg-[#141b16] text-[#a4c29c] hover:text-white hover:bg-[#1b241e] border border-[#26332a]'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              selectedStatusTab === tab.id ? 'bg-white/20 text-white' : 'bg-[#0d120f] text-[#c6a052]'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Live Orders Grid */}
      {isOrdersLoading ? (
        <div className="p-12 text-center text-xs text-[#a4c29c] animate-pulse">
          Connecting to live order stream...
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isPending = order.status === 'pending' || order.status === 'pending_acceptance';
            const isPreparing = order.status === 'preparing' || order.status === 'accepted';
            const isReady = order.status === 'ready';
            const isOut = order.status === 'out_for_delivery' || order.status === 'partner_assigned';

            const formattedTime = order.createdAt ? format(new Date(order.createdAt), 'HH:mm') : '';
            const relativeTime = order.createdAt ? formatDistanceToNow(new Date(order.createdAt), { addSuffix: true }) : '';

            return (
              <div
                key={order.id}
                className={`p-5 rounded-2xl bg-[#141b16] border transition-all flex flex-col justify-between ${
                  isPending 
                    ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' 
                    : isPreparing 
                    ? 'border-[#57854d]/50' 
                    : isReady 
                    ? 'border-[#c6a052]/50' 
                    : 'border-[#26332a]'
                }`}
              >
                <div>
                  {/* Top order meta */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#26332a] mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-base font-extrabold text-white font-mono">
                          {order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`}
                        </strong>
                        {order.dailyOrderNumber && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#c6a052]/20 text-[#c6a052]">
                            #{order.dailyOrderNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#7ba372] mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{formattedTime} • {relativeTime}</span>
                      </div>
                    </div>

                    {/* Fulfillment Badge */}
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 ${
                      order.fulfillmentType === 'delivery'
                        ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                        : order.fulfillmentType === 'dine_in'
                        ? 'bg-[#57854d]/15 text-[#57854d] border border-[#57854d]/30'
                        : 'bg-[#c6a052]/15 text-[#c6a052] border border-[#c6a052]/30'
                    }`}>
                      {order.fulfillmentType === 'delivery' ? (
                        <Truck className="w-3 h-3" />
                      ) : order.fulfillmentType === 'dine_in' ? (
                        <UtensilsCrossed className="w-3 h-3" />
                      ) : (
                        <ShoppingBag className="w-3 h-3" />
                      )}
                      <span>{order.fulfillmentType || 'Delivery'}</span>
                    </span>
                  </div>

                  {/* Customer details */}
                  <div className="text-xs space-y-1 mb-3">
                    <span className="font-bold text-white block">{order.customerName || 'Customer'}</span>
                    {order.contactPhone && (
                      <div className="flex items-center gap-1 text-[#a4c29c]">
                        <Phone className="w-3 h-3 text-[#7ba372]" />
                        <span>{order.contactPhone}</span>
                      </div>
                    )}
                    {order.deliveryAddress && order.fulfillmentType === 'delivery' && (
                      <div className="flex items-start gap-1 text-[11px] text-[#7ba372] truncate">
                        <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                        <span className="truncate">
                          {typeof order.deliveryAddress === 'object' ? order.deliveryAddress.addressLine : order.deliveryAddress}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Order items snippet */}
                  <div className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1.5 mb-3 text-xs">
                    {order.items && order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[#e8eee9]">
                        <span className="font-semibold">
                          <strong className="text-[#c6a052]">{item.quantity}x</strong> {item.name}
                        </span>
                        <span className="font-mono text-[#a4c29c]">₹{(item.price * item.quantity).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total & Payment */}
                  <div className="flex items-center justify-between text-xs pb-3 mb-3 border-b border-[#26332a]">
                    <span className="text-[#a4c29c]">Total Amount:</span>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-extrabold text-[#c6a052] font-mono">₹{order.totalAmount}</strong>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        order.paymentStatus === 'paid' 
                          ? 'bg-[#10b981]/15 text-[#10b981]' 
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {order.paymentStatus || 'COD'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="space-y-2 pt-1">
                  {isPending && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleStatusChange(order.id, 'preparing')}
                        disabled={isActionLoading}
                        className="py-2.5 rounded-xl bg-[#57854d] hover:bg-[#426939] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Accept Order
                      </button>
                      <button
                        onClick={() => setRejectOrderId(order.id)}
                        disabled={isActionLoading}
                        className="py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  )}

                  {isPreparing && (
                    <button
                      onClick={() => handleStatusChange(order.id, 'ready')}
                      disabled={isActionLoading}
                      className="w-full py-2.5 rounded-xl bg-[#c6a052] hover:bg-[#d8b264] text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      Mark Food as READY
                    </button>
                  )}

                  {isReady && (
                    <div className="grid grid-cols-2 gap-2">
                      {order.fulfillmentType === 'delivery' ? (
                        <button
                          onClick={() => handleStatusChange(order.id, 'out_for_delivery')}
                          disabled={isActionLoading}
                          className="py-2.5 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Out for Delivery
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(order.id, 'delivered')}
                          disabled={isActionLoading}
                          className="py-2.5 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Complete Pickup
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedOrderDetails(order)}
                        className="py-2.5 rounded-xl bg-[#1b241e] hover:bg-[#222d26] text-[#a4c29c] hover:text-white border border-[#26332a] font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </div>
                  )}

                  {isOut && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleStatusChange(order.id, 'delivered')}
                        disabled={isActionLoading}
                        className="py-2.5 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Delivered
                      </button>
                      <button
                        onClick={() => setSelectedOrderDetails(order)}
                        className="py-2.5 rounded-xl bg-[#1b241e] hover:bg-[#222d26] text-[#a4c29c] hover:text-white border border-[#26332a] font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-16 text-center rounded-2xl bg-[#141b16] border border-[#26332a] space-y-2">
          <ShoppingBag className="w-10 h-10 text-[#7ba372]/40 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Active Orders</h3>
          <p className="text-xs text-[#a4c29c]">
            New customer orders will appear here automatically in real-time.
          </p>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#141b16] border border-[#26332a] w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
              <div>
                <h3 className="text-base font-extrabold text-white font-mono">
                  {selectedOrderDetails.orderNumber || `#${selectedOrderDetails.id.slice(0, 6).toUpperCase()}`}
                </h3>
                <span className="text-xs text-[#a4c29c]">
                  {selectedOrderDetails.createdAt ? format(new Date(selectedOrderDetails.createdAt), 'dd MMM yyyy, HH:mm:ss') : ''}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="p-1 rounded-lg text-[#7ba372] hover:text-white hover:bg-[#1b241e]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer info */}
            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs space-y-1">
              <strong className="text-white block">{selectedOrderDetails.customerName || 'Customer'}</strong>
              <p className="text-[#a4c29c]">Phone: {selectedOrderDetails.contactPhone || 'N/A'}</p>
              {selectedOrderDetails.deliveryAddress && (
                <p className="text-[#7ba372]">
                  Address: {typeof selectedOrderDetails.deliveryAddress === 'object' ? selectedOrderDetails.deliveryAddress.addressLine : selectedOrderDetails.deliveryAddress}
                </p>
              )}
            </div>

            {/* Items list */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-white block">Order Items Snapshot:</span>
              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-2">
                {selectedOrderDetails.items.map((it, i) => (
                  <div key={i} className="flex justify-between items-start text-[#e8eee9]">
                    <div>
                      <span className="font-bold text-white">{it.quantity}x {it.name}</span>
                      {it.variant && <span className="text-[11px] text-[#a4c29c] block font-mono">({it.variant})</span>}
                    </div>
                    <span className="font-mono text-[#c6a052]">₹{(it.price * it.quantity).toFixed(0)}</span>
                  </div>
                ))}

                <div className="pt-2 border-t border-[#26332a] flex justify-between font-extrabold text-sm text-white">
                  <span>Total Bill:</span>
                  <span className="text-[#c6a052] font-mono">₹{selectedOrderDetails.totalAmount}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#141b16] border border-[#26332a] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" /> Reject / Cancel Order
            </h3>
            <p className="text-xs text-[#a4c29c]">
              Please provide an operational reason for rejecting this customer order.
            </p>

            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Item out of stock, Kitchen at full capacity, Delivery address unreachable"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white focus:outline-none focus:border-red-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectOrderId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#a4c29c] hover:text-white bg-[#0d120f] border border-[#26332a]"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isActionLoading}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 shadow-lg"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
