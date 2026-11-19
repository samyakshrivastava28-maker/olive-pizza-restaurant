import { create } from 'zustand';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, getCurrentAuthToken } from '../lib/firebase';
import { getWebSocketUrl, fetchApi } from '../lib/api';
import type { DeliveryPartner } from '../types/restaurant';

export interface LiveRiderFleetState {
  riders: DeliveryPartner[];
  selectedRider: DeliveryPartner | null;
  isLoading: boolean;
  activeBranchId: string;
  isSupabaseLive: boolean; // Retained for backwards compatibility (signals active live telemetry)
  isTelemetryLive: boolean;
  
  // Fleet Counts
  onlineCount: number;
  availableCount: number;
  onDeliveryCount: number;
  offlineCount: number;

  // Actions
  setSelectedRider: (rider: DeliveryPartner | null) => void;
  subscribeFleet: (branchId: string) => () => void;
}

// Module-level singletons for subscription management (prevents duplicate WebSockets across Dashboard / Live Orders / Riders)
let refCount = 0;
let currentBranchId = '';
let telemetryWs: WebSocket | null = null;
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let pollingIntervalTimer: ReturnType<typeof setInterval> | null = null;
let isDisposed = false;
let firestoreUnsubDP: Unsubscribe | null = null;
let firestoreUnsubUsers: Unsubscribe | null = null;

// In-memory registry of riders
let rawRosterMap = new Map<string, DeliveryPartner>();
let latestGpsMap = new Map<string, {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  onlineStatus: boolean;
  activeOrderId: string | null;
  lastUpdated: string;
}>();

function processTelemetryRecord(row: any) {
  if (!row) return;
  const partnerId = row.deliveryPartnerId || row.delivery_partner_id || row.partnerId || row.id || row.uid;
  if (!partnerId) return;

  const lat = row.lat !== undefined ? row.lat : (row.latitude !== undefined ? row.latitude : null);
  const lng = row.lng !== undefined ? row.lng : (row.longitude !== undefined ? row.longitude : null);

  if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
    latestGpsMap.set(partnerId, {
      lat: Number(lat),
      lng: Number(lng),
      speed: Number(row.speed || 0),
      heading: Number(row.heading ?? row.bearing ?? 0),
      accuracy: Number(row.accuracy || 5),
      onlineStatus: row.status !== 'OFFLINE' && row.onlineStatus !== false && row.online_status !== false,
      activeOrderId: row.orderId || row.activeOrderId || row.active_order_id || null,
      lastUpdated: row.timestamp || row.last_updated || row.updated_at || new Date().toISOString()
    });
  } else if (row.status === 'OFFLINE' || row.onlineStatus === false || row.online_status === false) {
    const existing = latestGpsMap.get(partnerId);
    if (existing) {
      latestGpsMap.set(partnerId, { ...existing, onlineStatus: false });
    }
  }
}

async function pollActiveDriversFallback(branchId?: string): Promise<boolean> {
  try {
    const query = branchId && branchId !== 'all' ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const res = await fetchApi<any>(`/api/tracking/active-drivers${query}`);
    let records: any[] = [];
    if (res && res.success && Array.isArray(res.data)) {
      records = res.data;
    } else {
      const altRes = await fetchApi<any>(`/api/tracking/locations/active${query}`);
      if (altRes && (Array.isArray(altRes) || Array.isArray(altRes.data))) {
        records = Array.isArray(altRes) ? altRes : altRes.data;
      } else {
        const ridersRes = await fetchApi<any>(`/api/tracking/riders${query}`);
        if (ridersRes && (Array.isArray(ridersRes) || Array.isArray(ridersRes.data))) {
          records = Array.isArray(ridersRes) ? ridersRes : ridersRes.data;
        }
      }
    }

    if (records.length > 0) {
      records.forEach(processTelemetryRecord);
      return true;
    }
    return false;
  } catch (err: any) {
    return false;
  }
}

export const useLiveRiderStore = create<LiveRiderFleetState>((set, get) => ({
  riders: [],
  selectedRider: null,
  isLoading: true,
  activeBranchId: '',
  isSupabaseLive: false,
  isTelemetryLive: false,
  onlineCount: 0,
  availableCount: 0,
  onDeliveryCount: 0,
  offlineCount: 0,

  setSelectedRider: (rider) => {
    set({ selectedRider: rider });
  },

  subscribeFleet: (branchId: string) => {
    refCount++;
    isDisposed = false;
    set({ activeBranchId: branchId });

    // Helper to recompute merged list and stats
    const syncState = () => {
      const activeBranch = get().activeBranchId;
      const mergedList: DeliveryPartner[] = [];

      rawRosterMap.forEach((rider, id) => {
        // Scope to branch if branchId is not 'all' or empty
        const riderBranch = rider.branchId || '';
        if (activeBranch && activeBranch !== 'all' && riderBranch && riderBranch !== activeBranch) {
          return;
        }

        // Apply authoritative live telemetry
        const liveGps = latestGpsMap.get(id);
        const isOnline = Boolean(rider.isOnline || (liveGps && liveGps.onlineStatus));
        const currentOrderId = liveGps?.activeOrderId || rider.currentOrderId;
        const status = isOnline ? (currentOrderId ? 'busy' : 'available') : 'offline';

        const updated: DeliveryPartner = {
          ...rider,
          isOnline,
          status,
          currentOrderId: currentOrderId || undefined,
          currentLocation: liveGps ? {
            lat: liveGps.lat,
            lng: liveGps.lng,
            speed: liveGps.speed,
            heading: liveGps.heading,
            lastUpdated: liveGps.lastUpdated
          } : rider.currentLocation,
          lastSeen: liveGps?.lastUpdated || rider.lastSeen
        };

        mergedList.push(updated);
      });

      const onlineCount = mergedList.filter((r) => r.isOnline).length;
      const availableCount = mergedList.filter((r) => r.isOnline && r.status === 'available').length;
      const onDeliveryCount = mergedList.filter((r) => r.isOnline && r.status === 'busy').length;
      const offlineCount = mergedList.filter((r) => !r.isOnline).length;

      set({
        riders: mergedList,
        onlineCount,
        availableCount,
        onDeliveryCount,
        offlineCount,
        isLoading: false
      });
    };

    // If already subscribed to the same branch and WebSocket is connected, just return unbind
    if (telemetryWs && telemetryWs.readyState === WebSocket.OPEN && currentBranchId === branchId) {
      syncState();
      return () => {
        refCount = Math.max(0, refCount - 1);
        if (refCount === 0) cleanupSubscriptions(set);
      };
    }

    currentBranchId = branchId;
    cleanupSubscriptions(set);
    isDisposed = false;

    // 1. Initial snapshot from backend telemetry route (/api/tracking/active-drivers or /locations/active)
    pollActiveDriversFallback(branchId).then((hasData) => {
      if (hasData) {
        set({ isSupabaseLive: true, isTelemetryLive: true });
      }
      syncState();
    });

    // 2. Realtime WebSocket subscription to canonical Backend WebSocket server
    const connectWs = () => {
      if (isDisposed) return;
      try {
        const wsUrl = `${getWebSocketUrl()}?branchId=${encodeURIComponent(branchId)}`;
        const ws = new WebSocket(wsUrl);
        telemetryWs = ws;

        ws.onopen = async () => {
          if (isDisposed) {
            ws.close();
            return;
          }
          set({ isSupabaseLive: true, isTelemetryLive: true });

          try {
            ws.send(JSON.stringify({
              type: 'register_branch',
              branchId
            }));

            const token = await getCurrentAuthToken();
            if (token && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'auth',
                token,
                branchId
              }));
            }
          } catch {}

          pollActiveDriversFallback(branchId).then(() => syncState());
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (!msg) return;

            if (
              msg.type === 'driver.location_update' ||
              msg.type === 'fleet_location_update' ||
              msg.type === 'driver_location'
            ) {
              const data = msg.data || msg.payload;
              if (Array.isArray(data)) {
                data.forEach(processTelemetryRecord);
              } else if (data) {
                processTelemetryRecord(data);
              }
              set({ isSupabaseLive: true, isTelemetryLive: true });
              syncState();
            } else if (msg.type === 'active_drivers_snapshot' && Array.isArray(msg.data)) {
              msg.data.forEach(processTelemetryRecord);
              set({ isSupabaseLive: true, isTelemetryLive: true });
              syncState();
            }
          } catch {}
        };

        ws.onerror = () => {
          // If WS encounters error, trigger fallback polling
          pollActiveDriversFallback(branchId).then((ok) => {
            if (ok) syncState();
          });
        };

        ws.onclose = () => {
          telemetryWs = null;
          if (!isDisposed) {
            pollActiveDriversFallback(branchId).then((ok) => {
              if (ok) syncState();
            });
            if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
            wsReconnectTimeout = setTimeout(connectWs, 5000);
            if (typeof (wsReconnectTimeout as any)?.unref === 'function') {
              (wsReconnectTimeout as any).unref();
            }
          }
        };
      } catch (err) {
        if (!isDisposed) {
          if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
          wsReconnectTimeout = setTimeout(connectWs, 5000);
          if (typeof (wsReconnectTimeout as any)?.unref === 'function') {
            (wsReconnectTimeout as any).unref();
          }
        }
      }
    };

    connectWs();

    // 3. Periodic fallback HTTP polling (every 10s) to guarantee resilience if WS drops
    if (!pollingIntervalTimer) {
      pollingIntervalTimer = setInterval(async () => {
        if (isDisposed) return;
        if (!telemetryWs || telemetryWs.readyState !== WebSocket.OPEN) {
          const updated = await pollActiveDriversFallback(currentBranchId);
          if (updated) {
            set({ isSupabaseLive: true, isTelemetryLive: true });
            syncState();
          }
        }
      }, 10000);
      if (typeof (pollingIntervalTimer as any)?.unref === 'function') {
        (pollingIntervalTimer as any).unref();
      }
    }

    // 4. Listen to Firestore delivery_partners collection for identity/roster
    firestoreUnsubDP = onSnapshot(
      collection(db, 'delivery_partners'),
      (snapshot) => {
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          rawRosterMap.set(docSnap.id, {
            id: docSnap.id,
            name: d.name || d.displayName || 'Delivery Partner',
            phone: d.phone || d.phoneNumber || '',
            email: d.email || '',
            isOnline: d.isOnline !== false && d.status !== 'offline',
            status: d.status || (d.isOnline ? 'available' : 'offline'),
            vehicleType: d.vehicleType || 'Bike',
            vehicleNumber: d.vehicleNumber || '',
            currentOrderId: d.currentOrderId || d.activeOrderId,
            currentOrderNumber: d.currentOrderNumber,
            currentLocation: (d.latitude != null && d.longitude != null) ? {
              lat: Number(d.latitude),
              lng: Number(d.longitude),
              speed: Number(d.speed) || 0,
              heading: Number(d.heading) || 0,
              lastUpdated: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt?._seconds ? new Date(d.updatedAt._seconds * 1000).toISOString() : (typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString())
            } : undefined,
            lastSeen: d.lastSeen?.toDate ? d.lastSeen.toDate().toISOString() : d.lastSeen?._seconds ? new Date(d.lastSeen._seconds * 1000).toISOString() : (typeof d.lastSeen === 'string' ? d.lastSeen : (d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt?._seconds ? new Date(d.updatedAt._seconds * 1000).toISOString() : (typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString()))),
            branchId: d.branchId || ''
          });
        });
        syncState();
      },
      (err) => console.warn('[LiveRiderStore] delivery_partners listener note:', err?.message)
    );

    // 5. Listen to Firestore users collection (role in ['delivery', 'delivery_partner'])
    const usersQ = query(collection(db, 'users'), where('role', 'in', ['delivery', 'delivery_partner']));
    firestoreUnsubUsers = onSnapshot(
      usersQ,
      (snapshot) => {
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          if (!rawRosterMap.has(docSnap.id)) {
            rawRosterMap.set(docSnap.id, {
              id: docSnap.id,
              name: d.name || d.displayName || 'Rider',
              phone: d.phone || d.phoneNumber || '',
              email: d.email || '',
              isOnline: d.isOnline !== false,
              status: d.status || (d.isOnline ? 'available' : 'offline'),
              vehicleType: d.vehicleType || 'Bike',
              vehicleNumber: d.vehicleNumber || '',
              currentOrderId: d.currentOrderId,
              currentOrderNumber: d.currentOrderNumber,
              currentLocation: (d.latitude != null && d.longitude != null) ? {
                lat: Number(d.latitude),
                lng: Number(d.longitude),
                speed: Number(d.speed) || 0,
                heading: Number(d.heading) || 0,
                lastUpdated: d.updatedAt || new Date().toISOString()
              } : undefined,
              lastSeen: d.lastSeen || d.updatedAt || new Date().toISOString(),
              branchId: d.branchId || ''
            });
          }
        });
        syncState();
      },
      (err) => console.warn('[LiveRiderStore] users listener note:', err?.message)
    );

    return () => {
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0) {
        cleanupSubscriptions(set);
      }
    };
  }
}));

function cleanupSubscriptions(set?: any) {
  isDisposed = true;
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }
  if (pollingIntervalTimer) {
    clearInterval(pollingIntervalTimer);
    pollingIntervalTimer = null;
  }
  if (telemetryWs) {
    telemetryWs.close();
    telemetryWs = null;
  }
  if (set) {
    set({ isSupabaseLive: false, isTelemetryLive: false });
  }
  if (firestoreUnsubDP) {
    firestoreUnsubDP();
    firestoreUnsubDP = null;
  }
  if (firestoreUnsubUsers) {
    firestoreUnsubUsers();
    firestoreUnsubUsers = null;
  }
}
