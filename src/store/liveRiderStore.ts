import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { DeliveryPartner } from '../types/restaurant';

export interface LiveRiderFleetState {
  riders: DeliveryPartner[];
  selectedRider: DeliveryPartner | null;
  isLoading: boolean;
  activeBranchId: string;
  isSupabaseLive: boolean;
  
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
let supabaseChannel: any = null;
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

export const useLiveRiderStore = create<LiveRiderFleetState>((set, get) => ({
  riders: [],
  selectedRider: null,
  isLoading: true,
  activeBranchId: '',
  isSupabaseLive: false,
  onlineCount: 0,
  availableCount: 0,
  onDeliveryCount: 0,
  offlineCount: 0,

  setSelectedRider: (rider) => {
    set({ selectedRider: rider });
  },

  subscribeFleet: (branchId: string) => {
    refCount++;
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

        // Apply authoritative Supabase live coordinates if available
        const liveGps = latestGpsMap.get(id);
        const isOnline = liveGps !== undefined ? liveGps.onlineStatus : rider.isOnline;
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

    // If already subscribed to the same branch, just return unbind
    if (supabaseChannel && currentBranchId === branchId) {
      syncState();
      return () => {
        refCount = Math.max(0, refCount - 1);
        if (refCount === 0) cleanupSubscriptions();
      };
    }

    currentBranchId = branchId;
    cleanupSubscriptions();

    // 1. Initial snapshot from Supabase delivery_locations
    if (supabase) {
      Promise.resolve(supabase.from('delivery_locations').select('*'))
        .then(({ data, error }: any) => {
          if (!error && data) {
            data.forEach((row: any) => {
              if (row.delivery_partner_id && row.latitude != null && row.longitude != null) {
                latestGpsMap.set(row.delivery_partner_id, {
                  lat: Number(row.latitude),
                  lng: Number(row.longitude),
                  speed: Number(row.speed || 0),
                  heading: Number(row.heading || 0),
                  accuracy: Number(row.accuracy || 5),
                  onlineStatus: row.online_status !== false,
                  activeOrderId: row.active_order_id || null,
                  lastUpdated: row.last_updated || new Date().toISOString()
                });
              }
            });
            set({ isSupabaseLive: true });
            syncState();
          }
        })
        .catch(() => {});

      // 2. Realtime WebSocket subscription to Supabase delivery_locations
      supabaseChannel = supabase
        .channel('restaurant-live-fleet-radar')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'delivery_locations' },
          (payload) => {
            const row = (payload.new || {}) as any;
            if (!row || !row.delivery_partner_id) return;
            
            if (row.latitude != null && row.longitude != null) {
              latestGpsMap.set(row.delivery_partner_id, {
                lat: Number(row.latitude),
                lng: Number(row.longitude),
                speed: Number(row.speed || 0),
                heading: Number(row.heading || 0),
                accuracy: Number(row.accuracy || 5),
                onlineStatus: row.online_status !== false,
                activeOrderId: row.active_order_id || null,
                lastUpdated: row.last_updated || new Date().toISOString()
              });
            } else if (row.online_status === false) {
              const existing = latestGpsMap.get(row.delivery_partner_id);
              if (existing) {
                latestGpsMap.set(row.delivery_partner_id, { ...existing, onlineStatus: false });
              }
            }
            syncState();
          }
        )
        .subscribe((status) => {
          set({ isSupabaseLive: status === 'SUBSCRIBED' });
        });
    }

    // 3. Listen to Firestore delivery_partners collection for identity/roster
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
              lastUpdated: d.updatedAt || new Date().toISOString()
            } : undefined,
            lastSeen: d.lastSeen || d.updatedAt || new Date().toISOString(),
            branchId: d.branchId || ''
          });
        });
        syncState();
      },
      (err) => console.warn('[LiveRiderStore] delivery_partners listener note:', err?.message)
    );

    // 4. Listen to Firestore users collection (role in ['delivery', 'delivery_partner'])
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
        cleanupSubscriptions();
      }
    };
  }
}));

function cleanupSubscriptions() {
  if (supabase && supabaseChannel) {
    supabase.removeChannel(supabaseChannel);
    supabaseChannel = null;
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
