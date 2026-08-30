import React, { useState, useMemo } from 'react';
import { 
  History, 
  Search, 
  Eye, 
  Truck, 
  ShoppingBag, 
  UtensilsCrossed, 
  CheckCircle2, 
  XCircle, 
  X, 
  FileText
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import type { Order } from '../types/restaurant';
import { format, isToday, isYesterday, subDays, isAfter } from 'date-fns';

export const OrderHistoryPage: React.FC = () => {
  const { historicalOrders, activeBranchName } = useManagerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedFulfillment, setSelectedFulfillment] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredOrders = useMemo(() => {
    return historicalOrders.filter((order) => {
      // Search
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        (order.orderNumber || '').toLowerCase().includes(query) ||
        (order.customerName || '').toLowerCase().includes(query) ||
        (order.contactPhone || '').includes(query);

      if (!matchesSearch) return false;

      // Status
      if (selectedStatus !== 'all' && order.status !== selectedStatus) {
        return false;
      }

      // Fulfillment
      if (selectedFulfillment !== 'all') {
        const orderFulfillment = (order.fulfillmentType || order.deliveryType || 'delivery').toLowerCase();
        if (orderFulfillment !== selectedFulfillment) return false;
      }

      // Date range
      if (order.createdAt) {
        const orderDate = new Date(order.createdAt);
        if (selectedDateRange === 'today') {
          if (!isToday(orderDate)) return false;
        } else if (selectedDateRange === 'yesterday') {
          if (!isYesterday(orderDate)) return false;
        } else if (selectedDateRange === '7days') {
          if (!isAfter(orderDate, subDays(new Date(), 7))) return false;
        }
      }

      return true;
    });
  }, [historicalOrders, searchQuery, selectedStatus, selectedFulfillment, selectedDateRange]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-[#c6a052]" />
            Restaurant Order History
          </h1>
          <p className="text-xs text-[#a4c29c] mt-0.5">
            Historical shift ledger for {activeBranchName}. Unaltered order snapshots and billing archives.
          </p>
        </div>

        <div className="text-xs text-[#7ba372] font-mono">
          Total Records: <strong>{filteredOrders.length}</strong>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#141b16] border border-[#26332a] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#7ba372] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by order #, phone, customer..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white focus:outline-none focus:border-[#c6a052]"
            >
              <option value="all">All Statuses</option>
              <option value="delivered">Delivered Only</option>
              <option value="cancelled">Cancelled Only</option>
              <option value="rejected">Rejected Only</option>
            </select>
          </div>

          {/* Fulfillment Filter */}
          <div className="relative">
            <select
              value={selectedFulfillment}
              onChange={(e) => {
                setSelectedFulfillment(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white focus:outline-none focus:border-[#c6a052]"
            >
              <option value="all">All Fulfillment Types</option>
              <option value="delivery">Delivery</option>
              <option value="takeaway">Takeaway / Pickup</option>
              <option value="dine_in">Dine-In</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="relative">
            <select
              value={selectedDateRange}
              onChange={(e) => {
                setSelectedDateRange(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-white focus:outline-none focus:border-[#c6a052]"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl bg-[#141b16] border border-[#26332a] overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d120f] text-[#7ba372] uppercase text-[10px] tracking-wider border-b border-[#26332a]">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Fulfillment</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#26332a] text-slate-200">
              {paginatedOrders.length > 0 ? (
                paginatedOrders.map((order) => {
                  const isDelivered = order.status === 'delivered';
                  const isCancelled = order.status === 'cancelled' || order.status === 'rejected';

                  return (
                    <tr key={order.id} className="hover:bg-[#18221b] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`}
                      </td>
                      <td className="py-3 px-4 text-[#a4c29c]">
                        {order.createdAt ? format(new Date(order.createdAt), 'dd MMM, HH:mm') : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <strong className="text-white block font-semibold">{order.customerName || 'Customer'}</strong>
                        <span className="text-[10px] text-[#7ba372]">{order.contactPhone || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize text-[#a4c29c] flex items-center gap-1.5">
                          {order.fulfillmentType === 'delivery' ? (
                            <Truck className="w-3.5 h-3.5 text-[#10b981]" />
                          ) : order.fulfillmentType === 'dine_in' ? (
                            <UtensilsCrossed className="w-3.5 h-3.5 text-[#57854d]" />
                          ) : (
                            <ShoppingBag className="w-3.5 h-3.5 text-[#c6a052]" />
                          )}
                          <span>{order.fulfillmentType || 'Delivery'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-[#c6a052]">
                        ₹{order.totalAmount}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 ${
                          isDelivered 
                            ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30' 
                            : isCancelled 
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30' 
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>
                          {isDelivered && <CheckCircle2 className="w-3 h-3" />}
                          {isCancelled && <XCircle className="w-3 h-3" />}
                          <span>{order.status.replace(/_/g, ' ')}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-3 py-1.5 rounded-lg bg-[#0d120f] hover:bg-[#222d26] border border-[#26332a] text-[#a4c29c] hover:text-white font-bold text-[11px] inline-flex items-center gap-1.5 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#c6a052]" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#7ba372]">
                    No historical orders match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#26332a] flex items-center justify-between text-xs text-[#a4c29c]">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg bg-[#0d120f] border border-[#26332a] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg bg-[#0d120f] border border-[#26332a] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historical Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#141b16] border border-[#26332a] w-full max-w-xl rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
              <div>
                <h3 className="text-base font-extrabold text-white font-mono flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#c6a052]" />
                  {selectedOrder.orderNumber || `#${selectedOrder.id.slice(0, 6).toUpperCase()}`}
                </h3>
                <span className="text-xs text-[#a4c29c]">
                  Archived Order Snapshot • {selectedOrder.createdAt ? format(new Date(selectedOrder.createdAt), 'dd MMM yyyy, HH:mm:ss') : ''}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 rounded-lg text-[#7ba372] hover:text-white hover:bg-[#1b241e]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer & Fulfillment Info */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1">
                <span className="text-[10px] text-[#7ba372] font-bold uppercase tracking-wider block">Customer</span>
                <strong className="text-white block font-semibold">{selectedOrder.customerName || 'Customer'}</strong>
                <p className="text-[#a4c29c]">Phone: {selectedOrder.contactPhone || 'N/A'}</p>
                {selectedOrder.deliveryAddress && (
                  <p className="text-[#7ba372] truncate">
                    {typeof selectedOrder.deliveryAddress === 'object' ? selectedOrder.deliveryAddress.addressLine : selectedOrder.deliveryAddress}
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1">
                <span className="text-[10px] text-[#7ba372] font-bold uppercase tracking-wider block">Order Meta</span>
                <p className="text-white">Channel: <strong className="capitalize">{selectedOrder.fulfillmentType || 'Delivery'}</strong></p>
                <p className="text-white">Payment: <strong className="uppercase">{selectedOrder.paymentStatus || 'COD'}</strong></p>
                {selectedOrder.deliveryPartnerName && (
                  <p className="text-[#10b981]">Rider: {selectedOrder.deliveryPartnerName}</p>
                )}
                {selectedOrder.cancellationReason && (
                  <p className="text-red-400">Reason: {selectedOrder.cancellationReason}</p>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-white block">Historical Bill Breakdown:</span>
              <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-2">
                {selectedOrder.items && selectedOrder.items.map((it, i) => (
                  <div key={i} className="flex justify-between items-center text-slate-200">
                    <div>
                      <span className="font-bold text-white">{it.quantity}x {it.name}</span>
                      {it.variant && <span className="text-[10px] text-[#a4c29c] block font-mono">({it.variant})</span>}
                    </div>
                    <span className="font-mono text-[#c6a052]">₹{(it.price * it.quantity).toFixed(0)}</span>
                  </div>
                ))}

                <div className="pt-3 border-t border-[#26332a] space-y-1 text-[#a4c29c]">
                  {selectedOrder.deliveryFee !== undefined && selectedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between">
                      <span>Delivery Fee:</span>
                      <span className="font-mono">₹{selectedOrder.deliveryFee}</span>
                    </div>
                  )}
                  {selectedOrder.taxes !== undefined && selectedOrder.taxes > 0 && (
                    <div className="flex justify-between">
                      <span>Taxes & GST:</span>
                      <span className="font-mono">₹{selectedOrder.taxes}</span>
                    </div>
                  )}
                  {selectedOrder.packagingCharge !== undefined && selectedOrder.packagingCharge > 0 && (
                    <div className="flex justify-between">
                      <span>Packaging:</span>
                      <span className="font-mono">₹{selectedOrder.packagingCharge}</span>
                    </div>
                  )}
                  {selectedOrder.discountAmount !== undefined && selectedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-[#10b981]">
                      <span>Discount:</span>
                      <span className="font-mono">-₹{selectedOrder.discountAmount}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#26332a] flex justify-between text-sm font-extrabold text-white">
                    <span>Total Paid:</span>
                    <span className="text-[#c6a052] font-mono">₹{selectedOrder.totalAmount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a]"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
