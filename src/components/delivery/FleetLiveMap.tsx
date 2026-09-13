import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DeliveryPartner } from '../../types/restaurant';

interface FleetLiveMapProps {
  branchName: string;
  restaurantLat?: number;
  restaurantLng?: number;
  riders: DeliveryPartner[];
  selectedRider: DeliveryPartner | null;
  onSelectRider: (rider: DeliveryPartner) => void;
}

// Fix default leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function getFreshnessBadge(isoDate?: string | null): { label: string; colorClass: string } {
  if (!isoDate) return { label: 'OFFLINE', colorClass: 'bg-slate-700 text-slate-300' };
  const ageMs = Date.now() - new Date(isoDate).getTime();
  if (isNaN(ageMs) || ageMs < 0) return { label: 'OFFLINE', colorClass: 'bg-slate-700 text-slate-300' };
  if (ageMs <= 30 * 1000) return { label: 'LIVE (<30s)', colorClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
  if (ageMs <= 2 * 60 * 1000) return { label: 'RECENT (<2m)', colorClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
  if (ageMs <= 10 * 60 * 1000) return { label: 'STALE (<10m)', colorClass: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };
  return { label: 'OFFLINE', colorClass: 'bg-slate-800 text-slate-400 border-slate-700' };
}

export const FleetLiveMap: React.FC<FleetLiveMapProps> = ({
  branchName,
  restaurantLat = 21.0967,
  restaurantLng = 81.0315,
  riders,
  selectedRider,
  onSelectRider,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [restaurantLat, restaurantLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    // Standard OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Delivery Radius (5km store bound)
    L.circle([restaurantLat, restaurantLng], {
      radius: 5000,
      color: '#57854d',
      fillColor: '#57854d',
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: '6, 6',
    }).addTo(map);

    // Restaurant HQ Marker
    const restaurantIcon = L.divIcon({
      className: '',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
          <div style="background:#57854d;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;border:1px solid #c6a052;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.3);margin-bottom:2px;">
            🍕 ${branchName}
          </div>
          <div style="width:32px;height:32px;border-radius:10px;background:#c6a052;color:#000;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.4);border:2px solid #fff;">
            🍕
          </div>
        </div>
      `,
      iconSize: [32, 48],
      iconAnchor: [16, 48],
    });

    L.marker([restaurantLat, restaurantLng], { icon: restaurantIcon })
      .addTo(map)
      .bindPopup(`<b>${branchName}</b><br/><span style="font-size:11px;color:#666;">Store Origin & FIFO Dispatch HQ</span>`);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [restaurantLat, restaurantLng, branchName]);

  // Update Rider Markers dynamically
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    const boundsPoints: [number, number][] = [[restaurantLat, restaurantLng]];

    riders.forEach((rider) => {
      const lat = rider.currentLocation?.lat ?? (rider as any).latitude;
      const lng = rider.currentLocation?.lng ?? (rider as any).longitude;

      if (lat === undefined || lng === undefined || isNaN(Number(lat)) || isNaN(Number(lng))) {
        return;
      }

      boundsPoints.push([Number(lat), Number(lng)]);

      const isAvailable = rider.isOnline && rider.status === 'available';
      const isBusy = rider.status === 'busy' || (rider.status as string) === 'on_delivery';
      const isSelected = selectedRider?.id === rider.id;
      const pinColor = isAvailable ? '#10b981' : isBusy ? '#f59e0b' : '#64748b';

      const freshness = getFreshnessBadge(
        rider.currentLocation?.lastUpdated ?? (rider as any).locationUpdatedAt ?? rider.lastSeen
      );

      const riderPin = L.divIcon({
        className: '',
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);cursor:pointer;${isSelected ? 'transform:scale(1.2);' : ''}">
            <div style="background:#141b16;color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid ${pinColor};white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);margin-bottom:2px;">
              ${rider.name}
            </div>
            <div style="width:28px;height:28px;border-radius:50%;background:${pinColor};display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 0 10px ${pinColor}80;border:2px solid #fff;">
              🛵
            </div>
          </div>
        `,
        iconSize: [28, 42],
        iconAnchor: [14, 21],
      });

      const marker = L.marker([Number(lat), Number(lng)], { icon: riderPin });

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;min-width:160px;">
          <strong style="font-size:13px;display:block;margin-bottom:4px;">${rider.name}</strong>
          <div>Status: <b style="color:${pinColor}">${rider.isOnline ? (rider.status || 'online').toUpperCase() : 'OFFLINE'}</b></div>
          <div>Phone: <a href="tel:${rider.phone}">${rider.phone || 'N/A'}</a></div>
          <div>Vehicle: ${rider.vehicleNumber || 'Registered Fleet'}</div>
          <div style="margin-top:6px;padding:2px 6px;border-radius:4px;display:inline-block;font-size:10px;font-weight:700;border:1px solid;" class="${freshness.colorClass}">
            GPS: ${freshness.label}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => onSelectRider(rider));
      markersLayer.addLayer(marker);
    });

    if (boundsPoints.length > 1) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(boundsPoints), { padding: [40, 40], maxZoom: 15 });
    }
  }, [riders, restaurantLat, restaurantLng, selectedRider, onSelectRider]);

  return (
    <div className="relative w-full h-[440px] rounded-xl overflow-hidden border border-[#26332a] bg-[#0b100d]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
    </div>
  );
};
