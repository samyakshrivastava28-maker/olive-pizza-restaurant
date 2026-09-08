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
  AlertCircle,
  ShieldCheck,
  CreditCard,
  Calendar
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

  // Filter orders by search & tab
  const filteredOrders = liveOrders.filter((order) => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNumber = (order.orderNumber || '').toLowerCase().includes(q) || String(order.dailyOrderNumber || '').includes(q);
      const matchCustomer = (order.customerName || '').toLowerCase().includes(q);
      const matchPhone = (order.contactPhone || '').toLowerCase().includes(q);
      if (!matchNumber && !matchCustomer && !matchPhone) return false;
    }

    // Status tabs filter
    if (selectedStatusTab === 'pending') return order.status === 'pending' || order.status === 'pending_acceptance';
    if (selectedStatusTab === 'preparing') return order.status === 'preparing' || order.status === 'accepted';
    if (selectedStatusTab === 'ready') return order.status === 'ready';
    if (selectedStatusTab === 'out_for_delivery') return order.status === 'out_for_delivery' || order.status === 'partner_assigned';
    return true;
  });

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    const res = await updateOrderStatus(orderId, nextStatus);
    if (res && res.success) {
      toast.success(`Order moved to ${nextStatus.toUpperCase().replace(/_/g, ' ')}`);
      if (selectedOrderDetails?.id === orderId) {
        setSelectedOrderDetails(null);
      }
    } else {
      toast.error(res?.error || 'Failed to update order status');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectOrderId) return;
    const res = await updateOrderStatus(rejectOrderId, 'cancelled', rejectReason.trim() || 'Rejected by restaurant manager');
    if (res && res.success) {
      toast.success('Order cancelled/rejected');
      setRejectOrderId(null);
      setRejectReason('');
    } else {
      toast.error(res?.error || 'Failed to reject order');
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

                  {/* Preparation countdown banner if preparing */}
                  {isPreparing && (
                    <div className="mb-3 p-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-[#a4c29c]">
                        <Clock className="w-3.5 h-3.5 text-[#c6a052] animate-pulse" />
                        <span>Kitchen Prep:</span>
                      </div>
                      {(() => {
                        const targetMs = order.expectedReadyAt ? new Date(order.expectedReadyAt).getTime() : NaN;
                        if (!isNaN(targetMs)) {
                          const diffMin = Math.round((targetMs - Date.now()) / (60 * 1000));
                          const isOverdue = diffMin < 0;
                          const text = diffMin > 0 ? `~${diffMin} mins left` : diffMin === 0 ? 'Ready any second' : `Overdue by ${Math.abs(diffMin)}m`;
                          return (
                            <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                              isOverdue 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' 
                                : 'bg-[#c6a052]/20 text-[#c6a052] border border-[#c6a052]/30'
                            }`}>
                              {text}
                            </span>
                          );
                        }
                        return (
                          <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-[#c6a052]/20 text-[#c6a052] border border-[#c6a052]/30">
                            {order.estimatedPreparationMinutes || 20}m target
                          </span>
                        );
                      })()}
                    </div>
                  )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141b16] border border-[#26332a] w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-[#26332a]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-extrabold text-white font-mono">
                    {selectedOrderDetails.orderNumber || `#${selectedOrderDetails.id.slice(0, 6).toUpperCase()}`}
                  </h3>
                  {selectedOrderDetails.dailyOrderNumber && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#c6a052]/20 text-[#c6a052] font-mono">
                      #{selectedOrderDetails.dailyOrderNumber}
                    </span>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    selectedOrderDetails.status === 'delivered' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' :
                    selectedOrderDetails.status === 'cancelled' || selectedOrderDetails.status === 'rejected' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    selectedOrderDetails.status === 'ready' ? 'bg-[#c6a052]/20 text-[#c6a052] border border-[#c6a052]/30' :
                    'bg-[#57854d]/20 text-[#a4c29c] border border-[#57854d]/30'
                  }`}>
                    {selectedOrderDetails.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#a4c29c] mt-1">
                  <Calendar className="w-3.5 h-3.5 text-[#7ba372]" />
                  <span>{selectedOrderDetails.createdAt ? format(new Date(selectedOrderDetails.createdAt), 'dd MMMM yyyy, hh:mm:ss a') : 'Recently'}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="p-1.5 rounded-xl text-[#7ba372] hover:text-white hover:bg-[#1b241e] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer & Fulfillment Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1.5 text-xs">
                <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">Customer Details</span>
                <strong className="text-white text-sm block">{selectedOrderDetails.customerName || 'Customer'}</strong>
                {selectedOrderDetails.contactPhone && (
                  <div className="flex items-center gap-1.5 text-[#a4c29c]">
                    <Phone className="w-3.5 h-3.5 text-[#7ba372]" />
                    <a href={`tel:${selectedOrderDetails.contactPhone}`} className="hover:text-[#c6a052] font-mono">
                      {selectedOrderDetails.contactPhone}
                    </a>
                  </div>
                )}
                {selectedOrderDetails.customerEmail && (
                  <p className="text-[#a4c29c] truncate">{selectedOrderDetails.customerEmail}</p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1.5 text-xs">
                <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">Fulfillment & Destination</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#57854d]/20 text-[#a4c29c] border border-[#57854d]/30">
                    {selectedOrderDetails.fulfillmentType || selectedOrderDetails.deliveryType || 'Delivery'}
                  </span>
                  {selectedOrderDetails.tableNumber && (
                    <span className="text-white font-bold font-mono">Table #{selectedOrderDetails.tableNumber}</span>
                  )}
                </div>
                {selectedOrderDetails.deliveryAddress && (
                  <div className="flex items-start gap-1.5 text-[#a4c29c] pt-1">
                    <MapPin className="w-3.5 h-3.5 text-[#7ba372] shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-relaxed">
                      {typeof selectedOrderDetails.deliveryAddress === 'object' 
                        ? [selectedOrderDetails.deliveryAddress.addressLine, selectedOrderDetails.deliveryAddress.city, selectedOrderDetails.deliveryAddress.pincode].filter(Boolean).join(', ')
                        : selectedOrderDetails.deliveryAddress}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Items Breakdown */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-white block">Itemized Kitchen Breakdown:</span>
              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] divide-y divide-[#26332a]/60 space-y-2.5">
                {selectedOrderDetails.items.map((it, i) => (
                  <div key={i} className={i > 0 ? 'pt-2.5 flex justify-between items-start text-xs' : 'flex justify-between items-start text-xs'}>
                    <div className="space-y-1">
                      <div className="font-bold text-white text-sm">
                        <span className="text-[#c6a052] font-mono">{it.quantity}x</span> {it.name}
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {(it.variant || it.size) && (
                          <span className="px-1.5 py-0.5 rounded bg-[#1b241e] text-[#a4c29c] border border-[#26332a]">
                            Size: {it.variant || it.size}
                          </span>
                        )}
                        {it.crust && (
                          <span className="px-1.5 py-0.5 rounded bg-[#1b241e] text-[#a4c29c] border border-[#26332a]">
                            Crust: {it.crust}
                          </span>
                        )}
                      </div>
                      {it.addons && it.addons.length > 0 && (
                        <div className="text-[11px] text-[#7ba372]">
                          + {it.addons.map((a) => `${a.name} (₹${a.price})`).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-white font-bold">₹{(it.price * it.quantity).toFixed(0)}</span>
                      <span className="block text-[10px] text-[#7ba372] font-mono">₹{it.price} each</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary & Verified Payment Status */}
            <div className="p-4 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-2 text-xs">
              <div className="flex justify-between text-[#a4c29c]">
                <span>Items Subtotal:</span>
                <span className="font-mono text-white">₹{selectedOrderDetails.subtotal || selectedOrderDetails.totalAmount}</span>
              </div>
              {Number(selectedOrderDetails.deliveryFee || 0) > 0 && (
                <div className="flex justify-between text-[#a4c29c]">
                  <span>Delivery Fee:</span>
                  <span className="font-mono text-white">₹{selectedOrderDetails.deliveryFee}</span>
                </div>
              )}
              {Number(selectedOrderDetails.taxes || 0) > 0 && (
                <div className="flex justify-between text-[#a4c29c]">
                  <span>Taxes (GST):</span>
                  <span className="font-mono text-white">₹{selectedOrderDetails.taxes}</span>
                </div>
              )}
              {Number(selectedOrderDetails.packagingCharge || 0) > 0 && (
                <div className="flex justify-between text-[#a4c29c]">
                  <span>Packaging Charge:</span>
                  <span className="font-mono text-white">₹{selectedOrderDetails.packagingCharge}</span>
                </div>
              )}
              {Number(selectedOrderDetails.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-[#10b981]">
                  <span>Discount {selectedOrderDetails.appliedCouponCode ? `(${selectedOrderDetails.appliedCouponCode})` : ''}:</span>
                  <span className="font-mono">-₹{selectedOrderDetails.discountAmount}</span>
                </div>
              )}
              <div className="pt-2 border-t border-[#26332a] flex justify-between items-center text-sm font-extrabold text-white">
                <span>Final Total:</span>
                <span className="text-[#c6a052] font-mono text-base">₹{selectedOrderDetails.totalAmount}</span>
              </div>

              {/* Payment Status Bar */}
              <div className="pt-2 flex items-center justify-between text-[11px] border-t border-[#26332a]/60">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#7ba372]" />
                  <span className="text-[#a4c29c]">Payment Method:</span>
                  <strong className="text-white uppercase font-mono">{selectedOrderDetails.paymentMethod || 'COD'}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
                  <span className="text-[#a4c29c]">Status:</span>
                  <span className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${
                    selectedOrderDetails.paymentStatus === 'paid' 
                      ? 'bg-[#10b981]/20 text-[#10b981]' 
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {selectedOrderDetails.paymentStatus || 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* Assigned Delivery Partner (if any) */}
            {selectedOrderDetails.deliveryPartnerName && (
              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs space-y-1">
                <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">Assigned Delivery Partner</span>
                <div className="flex justify-between items-center">
                  <strong className="text-white text-sm">{selectedOrderDetails.deliveryPartnerName}</strong>
                  {selectedOrderDetails.deliveryPartnerPhone && (
                    <a href={`tel:${selectedOrderDetails.deliveryPartnerPhone}`} className="text-[#c6a052] font-mono hover:underline">
                      {selectedOrderDetails.deliveryPartnerPhone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Server-Authoritative Timestamps Timeline */}
            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-2 text-xs">
              <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">Order Lifecycle Timeline</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                {selectedOrderDetails.createdAt && (
                  <div>
                    <span className="text-[#7ba372] block">Placed:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.createdAt), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {selectedOrderDetails.acceptedAt && (
                  <div>
                    <span className="text-[#7ba372] block">Accepted:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.acceptedAt), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {selectedOrderDetails.preparingAt && (
                  <div>
                    <span className="text-[#7ba372] block">Baking:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.preparingAt), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {selectedOrderDetails.readyAt && (
                  <div>
                    <span className="text-[#7ba372] block">Food Ready:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.readyAt), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {selectedOrderDetails.partnerAssignedAt && (
                  <div>
                    <span className="text-[#7ba372] block">Rider Assigned:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.partnerAssignedAt), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {(selectedOrderDetails.outForDeliveryAt || selectedOrderDetails.pickedUpAt) && (
                  <div>
                    <span className="text-[#7ba372] block">Out for Delivery:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.outForDeliveryAt || selectedOrderDetails.pickedUpAt!), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {selectedOrderDetails.deliveredAt && (
                  <div>
                    <span className="text-[#10b981] block">Delivered:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.deliveredAt), 'hh:mm:ss a')}</span>
                  </div>
                )}
                {selectedOrderDetails.cancelledAt && (
                  <div className="col-span-2">
                    <span className="text-red-400 block">Cancelled:</span>
                    <span className="text-white font-mono">{format(new Date(selectedOrderDetails.cancelledAt), 'hh:mm:ss a')} ({selectedOrderDetails.cancellationReason || 'No reason specified'})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#26332a]">
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] transition-all"
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
