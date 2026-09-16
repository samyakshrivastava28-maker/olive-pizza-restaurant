import { create } from 'zustand';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  type Unsubscribe,
  getDocs,
  doc,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { fetchApi } from '../lib/api';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { deviceAlarmService } from '../services/DeviceAlarmService';
import type { 
  Order, 
  OrderStatus, 
  DeliveryPartner, 
  ManagerDashboardStats, 
  NotificationRecord, 
  EmailRecord, 
  ManagerAccount 
} from '../types/restaurant';

interface ManagerState {
  user: User | null;
  managerProfile: ManagerAccount | null;
  userRole: string | null;
  isAuthChecking: boolean;
  isAuthorized: boolean;
  restrictedReason: string | null;
  restrictedEmail: string | null;
  clearRestricted: () => void;
  activeBranchId: string;
  activeBranchName: string;
  permissions: string[];

  // Live and historical orders
  liveOrders: Order[];
  historicalOrders: Order[];
  isOrdersLoading: boolean;
  isActionLoading: boolean;

  // Delivery riders
  riders: DeliveryPartner[];
  isRidersLoading: boolean;

  // Notifications & Emails
  notificationHistory: NotificationRecord[];
  emailHistory: EmailRecord[];

  // Live Restaurant Operational Status
  restaurantStatus: {
    isOpen: boolean;
    acceptingOrders: boolean;
    closeReason?: string;
    operatingHours?: Record<string, { open: string; close: string; isOpen?: boolean }>;
    updatedAt?: string;
    updatedBy?: string;
  } | null;
  isStatusLoading: boolean;

  // Actions
  initAuth: () => () => void;
  setAuthorizedProfile: (profile: ManagerAccount) => void;
  logout: () => Promise<void>;
  setActiveBranch: (branchId: string, branchName?: string) => void;
  subscribeToLiveOrders: (branchId: string) => () => void;
  subscribeToRestaurantStatus: (branchId: string) => () => void;
  toggleRestaurantStatus: (isOpen: boolean, reason?: string) => Promise<boolean>;
  fetchHistoricalOrders: (params?: { search?: string; status?: string; fulfillment?: string; dateRange?: string }) => Promise<void>;
  updateOrderStatus: (orderId: string, nextStatus: OrderStatus, reason?: string) => Promise<{ success: boolean; error?: string }>;
  subscribeToRiders: (branchId: string) => () => void;
  sendNotification: (payload: { title: string; message: string; targetAudience: 'customers' | 'staff' | 'delivery' | 'all'; imageUrl?: string; deepLink?: string }) => Promise<boolean>;
  fetchNotificationHistory: () => Promise<void>;
  sendEmail: (payload: { recipient: string; subject: string; message: string; template?: string }) => Promise<boolean>;
  fetchEmailHistory: () => Promise<void>;
  getDashboardStats: () => ManagerDashboardStats;
}

let liveOrdersUnsub: Unsubscribe | null = null;
let statusUnsub: Unsubscribe | null = null;
let ridersUnsub: Unsubscribe | null = null;

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'pending_acceptance',
  'accepted',
  'preparing',
  'ready',
  'partner_assigned',
  'picked_up',
  'out_for_delivery'
];

export const formatIso = (val: any): string | undefined => {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
  if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  if (val instanceof Date) return val.toISOString();
  return undefined;
};

export const useManagerStore = create<ManagerState>((set, get) => ({
  user: null,
  managerProfile: null,
  userRole: null,
  isAuthChecking: true,
  isAuthorized: false,
  restrictedReason: null,
  restrictedEmail: null,
  clearRestricted: () => set({ restrictedReason: null, restrictedEmail: null }),
  activeBranchId: 'main_branch',
  activeBranchName: 'Olive Pizza — Rajnandgaon (Main)',
  permissions: [
    'dashboard.view',
    'orders.live',
    'orders.history',
    'notifications.send',
    'email.send',
    'delivery.view'
  ],

  liveOrders: [],
  historicalOrders: [],
  isOrdersLoading: true,
  isActionLoading: false,

  riders: [],
  isRidersLoading: true,

  notificationHistory: [],
  emailHistory: [],

  restaurantStatus: null,
  isStatusLoading: false,

  initAuth: () => {
    // Quick safety timeout so auth checking NEVER hangs on a dark/black screen
    const safetyTimer = setTimeout(() => {
      if (get().isAuthChecking) {
        console.warn('[ManagerStore] Auth check safety timer triggered -> transitioning to ready');
        set({ isAuthChecking: false });
      }
    }, 2000);

    return onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(safetyTimer);
      if (currentUser) {
        const emailLower = (currentUser.email || '').toLowerCase().trim();
        const branchId = get().activeBranchId || 'main_branch';

        try {
          const resp = await fetchApi<any>('/api/auth/authorize-app', {
            method: 'POST',
            body: JSON.stringify({
              targetApp: 'RESTAURANT_MANAGER',
              requestedBranchId: branchId
            })
          });

          if (resp && resp.authorized) {
            const u = resp.user;
            const profile: ManagerAccount = {
              uid: currentUser.uid,
              name: u.name || currentUser.displayName || emailLower.split('@')[0] || 'Restaurant Manager',
              email: currentUser.email || '',
              role: u.role as any,
              branchId: u.branchId || branchId,
              branchName: u.branchName || 'Olive Pizza — Rajnandgaon HQ',
              franchiseId: u.franchiseId || 'fra_rajnandgaon',
              permissions: u.permissions || [],
              isActive: true
            };

            set({
              user: currentUser,
              managerProfile: profile,
              userRole: u.role,
              isAuthorized: true,
              isAuthChecking: false,
              restrictedReason: null,
              restrictedEmail: null,
              activeBranchId: profile.branchId,
              activeBranchName: profile.branchName,
              permissions: profile.permissions
            });

            get().subscribeToLiveOrders(profile.branchId);
            get().subscribeToRiders(profile.branchId);
            get().fetchHistoricalOrders();
            return;
          } else {
            // Explicitly unauthorized account — wipe session and enforce immediate sign out
            const denialReason = resp?.reason || 'This account is not authorized to use this Olive Pizza application.';
            console.warn('[ManagerStore] Access restricted for account:', emailLower, denialReason);

            SoundAlertEngine.stopAlarm();
            await signOut(auth).catch(() => {});
            localStorage.removeItem('restaurant_manager_profile');
            sessionStorage.clear();

            set({
              user: null,
              managerProfile: null,
              userRole: null,
              isAuthorized: false,
              isAuthChecking: false,
              restrictedReason: denialReason,
              restrictedEmail: emailLower
            });
          }
        } catch (err: any) {
          console.error('[ManagerStore] Auth handshake network error:', err);

          SoundAlertEngine.stopAlarm();
          await signOut(auth).catch(() => {});
          set({
            user: null,
            managerProfile: null,
            userRole: null,
            isAuthorized: false,
            isAuthChecking: false,
            restrictedReason: err?.message || 'Authorization service unavailable. Please check your network.',
            restrictedEmail: emailLower
          });
        }
      } else {
        SoundAlertEngine.stopAlarm();
        if (liveOrdersUnsub) {
          liveOrdersUnsub();
          liveOrdersUnsub = null;
        }
        if (ridersUnsub) {
          ridersUnsub();
          ridersUnsub = null;
        }
        set({
          user: null,
          managerProfile: null,
          userRole: null,
          isAuthorized: false,
          isAuthChecking: false,
          liveOrders: [],
          historicalOrders: [],
          riders: []
        });
      }
    });
  },

  setAuthorizedProfile: (profile: ManagerAccount) => {
    set({
      user: { uid: profile.uid, email: profile.email, displayName: profile.name } as any,
      managerProfile: profile,
      userRole: profile.role,
      isAuthorized: true,
      activeBranchId: profile.branchId,
      activeBranchName: profile.branchName,
      permissions: profile.permissions || [
        'dashboard.view',
        'orders.live',
        'orders.history',
        'notifications.send',
        'email.send',
        'delivery.view',
        'kitchen.kds',
        'inventory.view'
      ],
      isAuthChecking: false
    });
    get().subscribeToLiveOrders(profile.branchId);
    get().subscribeToRiders(profile.branchId);
    get().subscribeToRestaurantStatus(profile.branchId);
  },

  logout: async () => {
    try {
      SoundAlertEngine.stopAlarm();
      if (liveOrdersUnsub) liveOrdersUnsub();
      if (ridersUnsub) ridersUnsub();
      if (statusUnsub) { statusUnsub(); statusUnsub = null; }
      await signOut(auth);
      set({ user: null, managerProfile: null, isAuthorized: false, liveOrders: [] });
    } catch (e) {
      console.error('[ManagerStore] Logout error:', e);
    }
  },

  setActiveBranch: (branchId, branchName) => {
    set({
      activeBranchId: branchId,
      activeBranchName: branchName || (branchId === 'main_branch' ? 'Olive Pizza — Rajnandgaon (Main)' : `Branch ${branchId}`)
    });
    get().subscribeToLiveOrders(branchId);
    get().subscribeToRiders(branchId);
    get().subscribeToRestaurantStatus(branchId);
    get().fetchHistoricalOrders();
  },

  subscribeToLiveOrders: (branchId) => {
    if (liveOrdersUnsub) liveOrdersUnsub();
    set({ isOrdersLoading: true });

    try {
      // Authoritative Server-side Scoped Query (Section 1c)
      // Query MUST be scoped at the Firestore query level to manager's own branchId
      const targetBranchId = (!branchId || branchId === 'all') 
        ? (get().managerProfile?.branchId || 'main_branch')
        : branchId;

      const scopedQuery = query(
        collection(db, 'orders'),
        where('branchId', '==', targetBranchId)
      );

      // Subscribe to active orders with strict branch query scoping
      liveOrdersUnsub = onSnapshot(scopedQuery, (snapshot) => {
        const currentProfile = get().managerProfile;
        const profileFranchiseId = currentProfile?.franchiseId;
        const activeList: Order[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const status = (data.status || 'pending').toLowerCase() as OrderStatus;
          const orderBranch = data.branchId || targetBranchId;
          const orderFranchise = data.franchiseId;

          // Strict Franchise Isolation: If order specifies a franchiseId and it doesn't match manager's franchiseId, ignore completely!
          if (profileFranchiseId && orderFranchise && orderFranchise !== profileFranchiseId) {
            return;
          }

          if (ACTIVE_ORDER_STATUSES.includes(status)) {
              let createdDate = new Date();
              if (data.createdAt instanceof Timestamp) {
                createdDate = data.createdAt.toDate();
              } else if (data.createdAt?._seconds) {
                createdDate = new Date(data.createdAt._seconds * 1000);
              } else if (data.createdAt) {
                createdDate = new Date(data.createdAt);
              }

              let updatedDate = createdDate;
              if (data.updatedAt instanceof Timestamp) {
                updatedDate = data.updatedAt.toDate();
              } else if (data.updatedAt?._seconds) {
                updatedDate = new Date(data.updatedAt._seconds * 1000);
              } else if (data.updatedAt) {
                updatedDate = new Date(data.updatedAt);
              }

              activeList.push({
                id: docSnap.id,
                orderNumber: data.dailyOrderNumber ? `#${data.dailyOrderNumber}` : (data.orderNumber || `#${docSnap.id.slice(0, 6).toUpperCase()}`),
                dailyOrderNumber: data.dailyOrderNumber,
                userId: data.userId,
                customerId: data.customerId || data.userId,
                customerName: data.customerName || data.userName || data.deliveryAddress?.customerName || 'Walk-in Customer',
                contactPhone: data.contactPhone || data.phone || data.userPhone || '',
                customerEmail: data.customerEmail || data.userEmail || '',
                deliveryAddress: data.deliveryAddress,
                items: data.items || [],
                subtotal: Number(data.subtotal || data.totalAmount || 0),
                totalAmount: Number(data.totalAmount || 0),
                deliveryFee: Number(data.deliveryFee || 0),
                taxes: Number(data.taxes || 0),
                packagingCharge: Number(data.packagingCharge || 0),
                discountAmount: Number(data.discountAmount || 0),
                status,
                fulfillmentType: data.fulfillmentType || data.deliveryType || (data.tableNumber ? 'dine_in' : 'delivery'),
                deliveryType: data.deliveryType || (data.tableNumber ? 'dine_in' : 'delivery'),
                paymentStatus: data.paymentStatus || 'pending',
                paymentMethod: data.paymentMethod || 'cash',
                tableNumber: data.tableNumber,
                deliveryPartnerId: data.deliveryPartnerId,
                deliveryPartnerName: data.deliveryPartnerName,
                deliveryPartnerPhone: data.deliveryPartnerPhone,
                deliveryPartnerLocation: data.deliveryPartnerLocation,
                cancellationReason: data.cancellationReason,
                branchId: orderBranch,
                acceptedAt: formatIso(data.acceptedAt),
                preparingAt: formatIso(data.preparingAt),
                expectedReadyAt: formatIso(data.expectedReadyAt || data.estimatedReadyAt),
                estimatedPreparationMinutes: Number(data.estimatedPreparationMinutes) || undefined,
                readyAt: formatIso(data.readyAt),
                partnerAssignedAt: formatIso(data.partnerAssignedAt || data.riderAssignedAt),
                pickedUpAt: formatIso(data.pickedUpAt),
                outForDeliveryAt: formatIso(data.outForDeliveryAt),
                deliveredAt: formatIso(data.deliveredAt),
                cancelledAt: formatIso(data.cancelledAt),
                appliedCouponCode: data.appliedCouponCode || data.couponCode,
                createdAt: createdDate,
                updatedAt: updatedDate,
              });
            }
          });

        // Detect modified orders that became 'delivered' to play single-shot chime
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const data = change.doc.data();
            const s = (data.status || '').toLowerCase();
            if (s === 'delivered') {
              if (NotificationDeduplicator.shouldProcess(`ORDER_DELIVERED:${change.doc.id}`)) {
                SoundAlertEngine.playOrderDelivered();
              }
            }
          }
        });

        // Safe in-memory chronological sort
        activeList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        set({ liveOrders: activeList, isOrdersLoading: false });

        // Continuous sound alarm: loop while there are unaccepted/pending orders
        const pendingCount = activeList.filter((o) => o.status === 'pending' || o.status === 'pending_acceptance').length;
        const currentStatus = get().restaurantStatus;
        const isRestaurantOpen = currentStatus ? (currentStatus.isOpen !== false && currentStatus.acceptingOrders !== false) : true;
        const isAlarmEnabled = deviceAlarmService.isAlarmEnabled();

        // Guarantees alarm NEVER sounds when restaurant is closed or device alarm is disabled
        if (pendingCount > 0 && isRestaurantOpen && isAlarmEnabled) {
          SoundAlertEngine.startContinuousAlarm('new_order');
        } else {
          SoundAlertEngine.stopAlarm();
        }
      }, async (err) => {
        console.warn('[ManagerStore] Orders listener fallback to backend API:', err);
        // Fallback to backend live orders endpoint
        try {
          const res = await fetchApi<{ success: boolean; orders: any[] }>(`/orders/live?branchId=${branchId}`);
          if (res && res.success && Array.isArray(res.orders)) {
            set({ liveOrders: res.orders as any, isOrdersLoading: false });
            return;
          }
        } catch {}
        set({ isOrdersLoading: false });
      });
    } catch (err) {
      console.error('[ManagerStore] Error setting up live orders listener:', err);
      set({ isOrdersLoading: false });
    }

    return () => {
      SoundAlertEngine.stopAlarm();
      if (liveOrdersUnsub) liveOrdersUnsub();
    };
  },

  fetchHistoricalOrders: async () => {
    const branchId = get().activeBranchId;
    try {
      const q = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(150)
      );
      const snap = await getDocs(q);
      const currentProfile = get().managerProfile;
      const profileFranchiseId = currentProfile?.franchiseId;
      const pastList: Order[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const status = (data.status || 'pending').toLowerCase() as OrderStatus;
        const orderBranch = data.branchId || 'main_branch';
        const orderFranchise = data.franchiseId;

        // Strict Franchise Isolation: If order specifies a franchiseId and it doesn't match manager's franchiseId, ignore
        if (profileFranchiseId && orderFranchise && orderFranchise !== profileFranchiseId) {
          return;
        }

        if (orderBranch === branchId || branchId === 'all') {
          pastList.push({
            id: docSnap.id,
            orderNumber: data.orderNumber || `#${docSnap.id.slice(0, 6).toUpperCase()}`,
            dailyOrderNumber: data.dailyOrderNumber,
            userId: data.userId,
            customerName: data.customerName || data.userName || data.deliveryAddress?.customerName || 'Customer',
            contactPhone: data.contactPhone || data.phone || '',
            customerEmail: data.customerEmail || data.userEmail || '',
            deliveryAddress: data.deliveryAddress,
            items: data.items || [],
            totalAmount: Number(data.totalAmount || 0),
            deliveryFee: Number(data.deliveryFee || 0),
            taxes: Number(data.taxes || 0),
            packagingCharge: Number(data.packagingCharge || 0),
            discountAmount: Number(data.discountAmount || 0),
            status,
            fulfillmentType: data.fulfillmentType || data.deliveryType || 'delivery',
            orderSource: data.orderSource || 'website',
            paymentStatus: data.paymentStatus || 'pending',
            paymentMethod: data.paymentMethod || 'online',
            deliveryPartnerId: data.deliveryPartnerId,
            deliveryPartnerName: data.deliveryPartnerName,
            cancellationReason: data.cancellationReason,
            branchId: orderBranch,
            acceptedAt: formatIso(data.acceptedAt),
            preparingAt: formatIso(data.preparingAt),
            expectedReadyAt: formatIso(data.expectedReadyAt || data.estimatedReadyAt),
            estimatedPreparationMinutes: Number(data.estimatedPreparationMinutes) || undefined,
            readyAt: formatIso(data.readyAt),
            partnerAssignedAt: formatIso(data.partnerAssignedAt || data.riderAssignedAt),
            pickedUpAt: formatIso(data.pickedUpAt),
            outForDeliveryAt: formatIso(data.outForDeliveryAt),
            deliveredAt: formatIso(data.deliveredAt),
            cancelledAt: formatIso(data.cancelledAt),
            appliedCouponCode: data.appliedCouponCode || data.couponCode,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt || Date.now()),
          });
        }
      });

      set({ historicalOrders: pastList });
    } catch (err) {
      console.error('[ManagerStore] Error fetching historical orders:', err);
    }
  },

  updateOrderStatus: async (orderId, nextStatus, reason) => {
    set({ isActionLoading: true });
    try {
      let endpoint = `/api/orders/${orderId}/status`;
      let body: any = { status: nextStatus };

      if (nextStatus === 'preparing' || nextStatus === 'accepted') {
        endpoint = `/api/orders/${orderId}/accept`;
      } else if (nextStatus === 'cancelled' || nextStatus === 'rejected') {
        endpoint = `/api/orders/${orderId}/reject`;
        body = { reason: reason || 'Rejected by restaurant manager' };
      }

      const res = await fetchApi(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-App-Target': 'RESTAURANT_MANAGER',
          'X-App-Source': 'RESTAURANT_MANAGER'
        },
        body: JSON.stringify(body)
      });

      if (res && res.success) {
        const resolvedStatus = (res.status as OrderStatus) || nextStatus;
        // Optimistic local update (confirmed by backend success)
        set((state) => {
          const updatedLive = state.liveOrders.map((o) => 
            o.id === orderId ? { ...o, status: resolvedStatus, cancellationReason: reason } : o
          ).filter((o) => ACTIVE_ORDER_STATUSES.includes(resolvedStatus) || o.id !== orderId);

          const remainingPending = updatedLive.filter((o) => o.status === 'pending' || o.status === 'pending_acceptance').length;
          if (remainingPending === 0) {
            SoundAlertEngine.stopAlarm();
          }

          return {
            liveOrders: updatedLive,
            isActionLoading: false
          };
        });

        if (resolvedStatus === 'delivered') {
          SoundAlertEngine.playOrderDelivered();
        }

        get().fetchHistoricalOrders();
        return { success: true, status: resolvedStatus };
      } else {
        set({ isActionLoading: false });
        return { success: false, error: res?.error || 'Failed to update order status' };
      }
    } catch (err: any) {
      console.error('[ManagerStore] Error updating order status:', err);
      set({ isActionLoading: false });
      return { success: false, error: err?.message || 'Failed to update order status' };
    }
  },

  subscribeToRestaurantStatus: (branchId: string) => {
    if (statusUnsub) {
      statusUnsub();
      statusUnsub = null;
    }
    set({ isStatusLoading: true });

    try {
      const docRef = doc(db, 'restaurant_settings', branchId || 'main_branch');
      statusUnsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const isOpen = data.isOpen !== false;
          const acceptingOrders = data.acceptingOrders !== false;
          if (!isOpen || !acceptingOrders) {
            SoundAlertEngine.stopAlarm();
          }
          set({
            restaurantStatus: {
              isOpen,
              acceptingOrders,
              closeReason: data.closeReason || '',
              operatingHours: data.operatingHours || {},
              updatedAt: data.updatedAt,
              updatedBy: data.updatedBy
            },
            isStatusLoading: false
          });
        } else {
          set({
            restaurantStatus: {
              isOpen: true,
              acceptingOrders: true,
              closeReason: '',
              operatingHours: {}
            },
            isStatusLoading: false
          });
        }
      }, (err) => {
        console.warn('[ManagerStore] Restaurant status listener notice:', err);
        set({ isStatusLoading: false });
      });
    } catch (err) {
      console.error('[ManagerStore] Error in subscribeToRestaurantStatus:', err);
      set({ isStatusLoading: false });
    }

    return () => {
      if (statusUnsub) {
        statusUnsub();
        statusUnsub = null;
      }
    };
  },

  toggleRestaurantStatus: async (isOpen: boolean, reason?: string) => {
    const { activeBranchId } = get();
    set({ isActionLoading: true });
    try {
      const res = await fetchApi('/restaurant/status', {
        method: 'PUT',
        body: JSON.stringify({
          branchId: activeBranchId,
          isOpen,
          acceptingOrders: isOpen,
          closeReason: reason || (isOpen ? '' : 'Manually paused by manager')
        })
      });

      if (!isOpen) {
        SoundAlertEngine.stopAlarm();
      }

      if (res && (res.success || (res as any).status === 200)) {
        set((state) => ({
          restaurantStatus: state.restaurantStatus ? {
            ...state.restaurantStatus,
            isOpen,
            acceptingOrders: isOpen,
            closeReason: reason || (isOpen ? '' : 'Manually paused by manager')
          } : {
            isOpen,
            acceptingOrders: isOpen,
            closeReason: reason || (isOpen ? '' : 'Manually paused by manager')
          },
          isActionLoading: false
        }));
        return true;
      }
      set({ isActionLoading: false });
      return false;
    } catch (err) {
      console.error('[ManagerStore] Error toggling restaurant status:', err);
      set({ isActionLoading: false });
      return false;
    }
  },

  subscribeToRiders: (branchId) => {
    if (ridersUnsub) ridersUnsub();
    set({ isRidersLoading: true });

    try {
      let partnersFromColl: DeliveryPartner[] = [];
      let partnersFromUsers: DeliveryPartner[] = [];

      const mergeRiders = () => {
        const combined = new Map<string, DeliveryPartner>();
        partnersFromColl.forEach((p) => combined.set(p.id, p));
        partnersFromUsers.forEach((u) => {
          if (!combined.has(u.id)) combined.set(u.id, u);
        });

        const list = Array.from(combined.values()).filter((r) => {
          const rBranch = r.branchId || 'main_branch';
          return branchId === 'all' || rBranch === branchId;
        });
        set({ riders: list, isRidersLoading: false });
      };

      // 1. Listen to delivery_partners collection
      const unsubDP = onSnapshot(
        collection(db, 'delivery_partners'),
        (snapshot) => {
          const list: DeliveryPartner[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            list.push({
              id: docSnap.id,
              name: d.name || d.displayName || 'Delivery Partner',
              phone: d.phone || d.phoneNumber || '',
              email: d.email || '',
              isOnline: d.isOnline !== false && d.status !== 'offline',
              status: d.status || (d.isOnline ? 'available' : 'offline'),
              vehicleType: d.vehicleType || 'Scooty',
              vehicleNumber: d.vehicleNumber || 'CG 08 AR 9000',
              currentOrderId: d.currentOrderId || d.activeOrderId,
              currentOrderNumber: d.currentOrderNumber,
              currentLocation: (d.latitude !== undefined && d.longitude !== undefined) ? {
                lat: Number(d.latitude),
                lng: Number(d.longitude),
                speed: d.speed || 0,
                heading: d.heading || 0,
                lastUpdated: d.updatedAt || new Date().toISOString()
              } : d.location ? {
                lat: d.location.lat || 21.0810244,
                lng: d.location.lng || 81.0123793,
                speed: d.location.speed || 0,
                heading: d.location.heading || 0,
                lastUpdated: d.location.lastUpdated || new Date().toISOString()
              } : undefined,
              lastSeen: d.lastSeen || d.updatedAt || new Date().toISOString(),
              branchId: d.branchId || 'main_branch'
            });
          });
          partnersFromColl = list;
          mergeRiders();
        },
        (err) => {
          console.warn('[ManagerStore] delivery_partners listener notice:', err);
          set({ isRidersLoading: false });
        }
      );

      // 2. Listen to users collection
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('role', 'in', ['delivery', 'delivery_partner'])
      );

      const unsubUsers = onSnapshot(
        q,
        (snapshot) => {
          const list: DeliveryPartner[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            list.push({
              id: docSnap.id,
              name: d.name || d.displayName || 'Rider',
              phone: d.phone || d.phoneNumber || '',
              email: d.email || '',
              isOnline: d.isOnline !== false,
              status: d.status || (d.isOnline ? 'available' : 'offline'),
              vehicleType: d.vehicleType || 'Bike',
              vehicleNumber: d.vehicleNumber || 'CG 08 XX 0000',
              currentOrderId: d.currentOrderId,
              currentOrderNumber: d.currentOrderNumber,
              currentLocation: d.location ? {
                lat: d.location.lat || 21.0810244,
                lng: d.location.lng || 81.0123793,
                speed: d.location.speed || 0,
                heading: d.location.heading || 0,
                lastUpdated: d.location.lastUpdated || new Date().toISOString()
              } : undefined,
              lastSeen: d.lastSeen || d.updatedAt || new Date().toISOString(),
              branchId: d.branchId || 'main_branch'
            });
          });
          partnersFromUsers = list;
          mergeRiders();
        },
        (err) => {
          console.warn('[ManagerStore] users riders listener notice:', err);
          set({ isRidersLoading: false });
        }
      );

      ridersUnsub = () => {
        unsubDP();
        unsubUsers();
      };
    } catch (err) {
      console.error('[ManagerStore] Error querying riders:', err);
      set({ isRidersLoading: false });
    }

    return () => {
      if (ridersUnsub) ridersUnsub();
    };
  },

  sendNotification: async (payload) => {
    try {
      const res = await fetchApi('/notifications/send-custom', {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title,
          body: payload.message,
          targetAudience: payload.targetAudience,
          imageUrl: payload.imageUrl,
          deepLink: payload.deepLink,
          branchId: get().activeBranchId
        })
      });

      const newRecord: NotificationRecord = {
        id: `notif_${Date.now()}`,
        title: payload.title,
        message: payload.message,
        targetAudience: payload.targetAudience,
        imageUrl: payload.imageUrl,
        deepLink: payload.deepLink,
        sentAt: new Date().toISOString(),
        sentBy: get().user?.uid || 'manager',
        sentByEmail: get().user?.email || 'manager@olivepizza.in',
        branchId: get().activeBranchId,
        status: res.success !== false ? 'sent' : 'failed',
        error: res.error
      };

      set((state) => ({
        notificationHistory: [newRecord, ...state.notificationHistory]
      }));

      return res.success !== false;
    } catch (err: any) {
      console.error('[ManagerStore] Error sending notification:', err);
      return false;
    }
  },

  fetchNotificationHistory: async () => {
    try {
      const res = await fetchApi<any>('/notifications/inbox');
      if (res.success && res.notifications) {
        set({
          notificationHistory: res.notifications.map((n: any) => ({
            id: n.id || `notif_${Math.random()}`,
            title: n.title || 'Notification',
            message: n.message || n.body || '',
            targetAudience: n.targetAudience || 'customers',
            sentAt: n.createdAt || n.sentAt || new Date().toISOString(),
            sentBy: n.sentBy || 'manager',
            status: 'sent'
          }))
        });
      }
    } catch {}
  },

  sendEmail: async (payload) => {
    try {
      const res = await fetchApi('/email/transactional', {
        method: 'POST',
        body: JSON.stringify({
          to: payload.recipient,
          subject: payload.subject,
          html: `<div style="font-family: sans-serif; padding: 20px; color: #222;">
            <h2>${payload.subject}</h2>
            <p>${payload.message}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
            <small style="color: #666;">Olive Pizza Operations Console • ${get().activeBranchName}</small>
          </div>`
        })
      });

      const newRecord: EmailRecord = {
        id: `email_${Date.now()}`,
        subject: payload.subject,
        recipients: payload.recipient,
        template: payload.template || 'operational_dispatch',
        sentAt: new Date().toISOString(),
        sentBy: get().user?.uid || 'manager',
        sentByEmail: get().user?.email || 'manager@olivepizza.in',
        status: res.success !== false ? 'sent' : 'failed',
        recipientCount: payload.recipient.split(',').length,
        error: res.error
      };

      set((state) => ({
        emailHistory: [newRecord, ...state.emailHistory]
      }));

      return res.success !== false;
    } catch (err: any) {
      console.error('[ManagerStore] Error sending email:', err);
      return false;
    }
  },

  fetchEmailHistory: async () => {
    try {
      const res = await fetchApi<any>('/email/logs');
      if (res.success && res.logs) {
        set({
          emailHistory: res.logs.map((l: any) => ({
            id: l.id || `email_${Math.random()}`,
            subject: l.subject || 'Operational Email',
            recipients: l.to || l.recipient || '',
            sentAt: l.timestamp || l.createdAt || new Date().toISOString(),
            sentBy: l.sentBy || 'manager',
            status: l.status || 'sent',
            recipientCount: 1
          }))
        });
      }
    } catch {}
  },

  getDashboardStats: () => {
    const { liveOrders, historicalOrders, riders } = get();
    const today = new Date().toDateString();

    const todayOrders = historicalOrders.filter((o) => {
      const orderDate = new Date(o.createdAt).toDateString();
      return orderDate === today;
    });

    const completed = todayOrders.filter((o) => o.status === 'delivered');
    const cancelled = todayOrders.filter((o) => o.status === 'cancelled' || o.status === 'rejected');
    const todayRevenue = completed.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const pending = liveOrders.filter((o) => o.status === 'pending' || o.status === 'pending_acceptance');
    const preparing = liveOrders.filter((o) => o.status === 'preparing' || o.status === 'accepted');
    const ready = liveOrders.filter((o) => o.status === 'ready');
    const outForDelivery = liveOrders.filter((o) => o.status === 'out_for_delivery' || o.status === 'partner_assigned');

    const onlineRiders = riders.filter((r) => r.isOnline);
    const availableRiders = riders.filter((r) => r.isOnline && r.status === 'available');

    const deliveryOrders = liveOrders.filter((o) => (o.fulfillmentType || o.deliveryType) === 'delivery');
    const takeawayOrders = liveOrders.filter((o) => (o.fulfillmentType || o.deliveryType) === 'takeaway' || (o.fulfillmentType || o.deliveryType) === 'pickup');
    const dineInOrders = liveOrders.filter((o) => (o.fulfillmentType || o.deliveryType) === 'dine_in');

    return {
      todayOrdersCount: todayOrders.length + liveOrders.length,
      todayCompletedCount: completed.length,
      todayCancelledCount: cancelled.length,
      todayRevenue,
      pendingCount: pending.length,
      preparingCount: preparing.length,
      readyCount: ready.length,
      outForDeliveryCount: outForDelivery.length,
      onlineRidersCount: onlineRiders.length,
      availableRidersCount: availableRiders.length,
      activeDeliveriesCount: outForDelivery.length,
      deliveryOrdersCount: deliveryOrders.length,
      takeawayOrdersCount: takeawayOrders.length,
      dineInOrdersCount: dineInOrders.length
    };
  }
}));
