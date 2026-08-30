import React, { useState } from 'react';
import { 
  Bike, 
  Phone, 
  Navigation, 
  ShieldCheck, 
  Truck, 
  X,
  Radio
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import type { DeliveryPartner, Order } from '../types/restaurant';
import { formatDistanceToNow } from 'date-fns';

export const DeliveryManagementPage: React.FC = () => {
  const { 
    riders, 
    liveOrders, 
    activeBranchName, 
    isRidersLoading 
  } = useManagerStore();

  const [selectedRider, setSelectedRider] = useState<DeliveryPartner | null>(null);
  const [selectedDeliveryOrder, setSelectedDeliveryOrder] = useState<Order | null>(null);

  const activeDeliveries = liveOrders.filter((o) => 
    o.status === 'out_for_delivery' || o.status === 'partner_assigned'
  );

  const onlineRiders = riders.filter((r) => r.isOnline);
  const availableRiders = riders.filter((r) => r.isOnline && r.status === 'available');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Bike className="w-6 h-6 text-[#c6a052]" />
            Live Delivery Fleet & Map
          </h1>
          <p className="text-xs text-[#a4c29c] mt-0.5">
            Real-time GPS telemetry, active rider tracking, and dispatch monitoring for {activeBranchName}.
          </p>
        </div>

        {/* Telemetry quick counter */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-[#141b16] border border-[#26332a] text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
            <span className="text-[#a4c29c]">Online:</span>
            <strong className="text-white font-mono">{onlineRiders.length}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#141b16] border border-[#26332a] text-xs flex items-center gap-2">
            <span className="text-[#a4c29c]">Available:</span>
            <strong className="text-[#c6a052] font-mono">{availableRiders.length}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#141b16] border border-[#26332a] text-xs flex items-center gap-2">
            <span className="text-[#a4c29c]">Active Trips:</span>
            <strong className="text-[#57854d] font-mono">{activeDeliveries.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Map / Right Rider List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Map Container */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-xl flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#c6a052]" /> Fleet Radar Map
            </h2>
            <span className="text-[11px] text-[#7ba372] flex items-center gap-1.5 font-mono">
              <Radio className="w-3.5 h-3.5 text-[#10b981] animate-pulse" /> Live Telemetry
            </span>
          </div>

          {/* Map canvas simulation with OpenStreetMap tiles */}
          <div className="relative w-full h-[440px] rounded-xl overflow-hidden border border-[#26332a] bg-[#0b100d] flex items-center justify-center">
            {/* Tile background */}
            <div 
              className="absolute inset-0 opacity-40 bg-cover bg-center"
              style={{
                backgroundImage: `url('https://tile.openstreetmap.org/14/11889/7123.png')`,
                backgroundSize: 'cover'
              }}
            />
            <div className="absolute inset-0 bg-[#0d120f]/60 backdrop-blur-[1px]" />

            {/* Restaurant Outlet Pin */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer z-10">
              <div className="px-2.5 py-1 rounded-lg bg-[#57854d] text-white text-[10px] font-bold shadow-lg border border-[#c6a052]/40 whitespace-nowrap mb-1">
                🍕 {activeBranchName}
              </div>
              <div className="w-6 h-6 rounded-full bg-[#c6a052] border-2 border-white flex items-center justify-center text-black font-extrabold shadow-xl animate-bounce">
                ★
              </div>
              <div className="w-16 h-16 rounded-full bg-[#57854d]/20 border border-[#57854d]/40 absolute -inset-5 -z-10 animate-ping" />
            </div>

            {/* Simulated Live Riders Pins */}
            {riders.map((r, i) => {
              const offsets = [
                { top: '35%', left: '42%' },
                { top: '65%', left: '58%' },
                { top: '40%', left: '68%' },
                { top: '70%', left: '38%' },
              ];
              const pos = offsets[i % offsets.length];

              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRider(r)}
                  className="absolute cursor-pointer group z-20 transition-all hover:scale-110"
                  style={{ top: pos.top, left: pos.left }}
                >
                  <div className="px-2 py-0.5 rounded-md bg-[#141b16] text-white text-[9px] font-bold border border-[#26332a] shadow-md whitespace-nowrap mb-0.5 group-hover:border-[#c6a052]">
                    {r.name} ({r.isOnline ? 'Online' : 'Offline'})
                  </div>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg border ${
                    r.status === 'available'
                      ? 'bg-[#10b981] border-white text-white'
                      : r.status === 'busy'
                      ? 'bg-amber-500 border-white text-black'
                      : 'bg-slate-700 border-slate-500 text-slate-300'
                  }`}>
                    <Bike className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            })}

            {/* Map control legend overlay */}
            <div className="absolute bottom-3 left-3 p-2.5 rounded-xl bg-[#141b16]/90 border border-[#26332a] backdrop-blur-md text-[10px] space-y-1 text-[#a4c29c] z-20">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                <span>Available Rider</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Busy on Trip</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c6a052]" />
                <span>Restaurant Dispatch</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Riders Directory & Telemetry */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-xl flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#57854d]" /> Delivery Partners ({riders.length})
            </h2>
            <span className="text-xs text-[#7ba372] font-mono">{onlineRiders.length} Online</span>
          </div>

          <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
            {isRidersLoading ? (
              <div className="p-8 text-center text-xs text-[#a4c29c] animate-pulse">
                Fetching fleet telemetry...
              </div>
            ) : riders.length > 0 ? (
              riders.map((rider) => {
                const isOnline = rider.isOnline;
                const isAvailable = rider.status === 'available';

                return (
                  <div
                    key={rider.id}
                    onClick={() => setSelectedRider(rider)}
                    className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] hover:border-[#57854d]/60 cursor-pointer transition-all space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-[#10b981] animate-pulse' : 'bg-slate-600'}`} />
                        <div>
                          <strong className="text-white block font-bold">{rider.name}</strong>
                          <span className="text-[11px] text-[#a4c29c] flex items-center gap-1">
                            <Phone className="w-3 h-3 text-[#7ba372]" /> {rider.phone || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        isAvailable 
                          ? 'bg-[#10b981]/15 text-[#10b981]' 
                          : isOnline 
                          ? 'bg-amber-500/15 text-amber-400' 
                          : 'bg-slate-800 text-slate-500'
                      }`}>
                        {rider.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#7ba372] pt-1 border-t border-[#26332a]/50">
                      <span>Vehicle: {rider.vehicleType || 'Bike'}</span>
                      <span className="font-mono">
                        {rider.lastSeen ? formatDistanceToNow(new Date(rider.lastSeen), { addSuffix: true }) : 'Online'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-[#7ba372] space-y-1">
                <Bike className="w-8 h-8 text-[#7ba372]/30 mx-auto" />
                <p>No delivery partners registered for {activeBranchName}.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Running Deliveries Section */}
      <div className="p-6 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#c6a052]" />
            <h2 className="text-sm font-bold text-white">Active Doorstep Deliveries ({activeDeliveries.length})</h2>
          </div>
          <span className="text-xs text-[#a4c29c]">Live dispatch trips in progress</span>
        </div>

        {activeDeliveries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeDeliveries.map((order) => (
              <div key={order.id} className="p-4 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <strong className="text-white font-mono font-bold">
                    {order.orderNumber || `#${order.id.slice(0, 6).toUpperCase()}`}
                  </strong>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#10b981]/15 text-[#10b981]">
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="space-y-1 text-[#a4c29c]">
                  <p className="text-white font-semibold">Customer: {order.customerName || 'Customer'}</p>
                  <p className="text-[11px] truncate">
                    Destination: {typeof order.deliveryAddress === 'object' ? order.deliveryAddress.addressLine : order.deliveryAddress || 'Address'}
                  </p>
                  {order.deliveryPartnerName && (
                    <p className="text-[#c6a052] font-semibold flex items-center gap-1">
                      <Bike className="w-3.5 h-3.5" /> Assigned: {order.deliveryPartnerName}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#26332a] text-[11px]">
                  <span className="text-[#7ba372]">Bill: ₹{order.totalAmount}</span>
                  <button
                    onClick={() => setSelectedDeliveryOrder(order)}
                    className="text-[#c6a052] hover:underline font-bold"
                  >
                    View Trip Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#7ba372] italic p-4 text-center">
            No orders currently out for delivery.
          </p>
        )}
      </div>

      {/* Rider Detail Modal */}
      {selectedRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#141b16] border border-[#26332a] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#57854d]/20 text-[#57854d] flex items-center justify-center">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedRider.name}</h3>
                  <span className="text-xs text-[#a4c29c]">{selectedRider.phone || 'Phone not provided'}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRider(null)}
                className="p-1 rounded-lg text-[#7ba372] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#a4c29c]">Connection Status:</span>
                  <strong className={selectedRider.isOnline ? 'text-[#10b981]' : 'text-slate-400'}>
                    {selectedRider.isOnline ? 'ONLINE' : 'OFFLINE'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a4c29c]">Dispatch Availability:</span>
                  <strong className="capitalize text-white">{selectedRider.status}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a4c29c]">Vehicle Type:</span>
                  <strong className="text-white">{selectedRider.vehicleType || 'Bike'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a4c29c]">Vehicle Number:</span>
                  <strong className="text-white">{selectedRider.vehicleNumber || 'CG 08 XX 0000'}</strong>
                </div>
              </div>

              {selectedRider.currentLocation && (
                <div className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a] space-y-1">
                  <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">GPS Telemetry</span>
                  <p className="text-white font-mono text-[11px]">
                    Lat: {selectedRider.currentLocation.lat.toFixed(5)}, Lng: {selectedRider.currentLocation.lng.toFixed(5)}
                  </p>
                  <p className="text-[#a4c29c] text-[11px]">
                    Speed: {selectedRider.currentLocation.speed || 0} km/h • Heading: {selectedRider.currentLocation.heading || 0}°
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRider(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Order Modal */}
      {selectedDeliveryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#141b16] border border-[#26332a] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
              <h3 className="text-base font-extrabold text-white font-mono">
                {selectedDeliveryOrder.orderNumber || `#${selectedDeliveryOrder.id.slice(0, 6).toUpperCase()}`}
              </h3>
              <button
                onClick={() => setSelectedDeliveryOrder(null)}
                className="p-1 rounded-lg text-[#7ba372] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-white">Customer: <strong>{selectedDeliveryOrder.customerName}</strong></p>
              <p className="text-[#a4c29c]">Phone: <strong>{selectedDeliveryOrder.contactPhone}</strong></p>
              <p className="text-[#a4c29c]">
                Address: {typeof selectedDeliveryOrder.deliveryAddress === 'object' ? selectedDeliveryOrder.deliveryAddress.addressLine : selectedDeliveryOrder.deliveryAddress}
              </p>
              <p className="text-[#10b981]">Rider: <strong>{selectedDeliveryOrder.deliveryPartnerName || 'Assigned Rider'}</strong></p>
              <div className="pt-2 border-t border-[#26332a] flex justify-between font-bold text-white">
                <span>Bill Total:</span>
                <span className="text-[#c6a052] font-mono">₹{selectedDeliveryOrder.totalAmount}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDeliveryOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
