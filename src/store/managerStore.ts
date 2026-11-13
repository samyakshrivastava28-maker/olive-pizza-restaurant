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
import { fetchApi, invalidateStatusCache, invalidateRestaurantCache } from '../lib/api';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { deviceAlarmService } from '../services/DeviceAlarmService';
import { RestaurantIndexedDbService, OfflineActionRecord } from '../services/RestaurantIndexedDbService';
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
  isDatabaseUnavailable: boolean;
  setDatabaseUnavailable: (val: boolean) => void;
  authStatus?: 'APPROVED' | 'PENDING_OWNER_APPROVAL' | 'ACCOUNT_REJECTED' | 'ACCOUNT_DEACTIVATED' | null;
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
  pendingOfflineActionsCount: number;
  lastSyncTimestamp: string | null;
  syncOfflineActions: () => Promise<{ success: boolean; synced: number; failed: number }>;
  restoreFromIndexedDbCache: () => Promise<void>;

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
  updateOrderStatus: (orderId: string, nextStatus: OrderStatus, reason?: string, estimatedPreparationMinutes?: number) => Promise<{ success: boolean; error?: string; status?: OrderStatus }>;
  confirmPrepTime: (orderId: string, prepMinutes: number) => Promise<{ success: boolean; error?: string; expectedReadyAt?: string; deliveryEta?: string }>;
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
  isDatabaseUnavailable: false,
  setDatabaseUnavailable: (val: boolean) => set({ isDatabaseUnavailable: val }),
  authStatus: null,
  restrictedReason: null,
  restrictedEmail: null,
  clearRestricted: () => set({ restrictedReason: null, restrictedEmail: null }),
  activeBranchId: '',
  activeBranchName: '',
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
  pendingOfflineActionsCount: 0,
  lastSyncTimestamp: null,

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

    const handleResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && auth.currentUser && get().isAuthorized) {
        const branchId = get().activeBranchId || undefined;
        fetchApi<any>('/api/auth/authorize-app', {
          method: 'POST',
          body: JSON.stringify({
            targetApp: 'RESTAURANT_MANAGER',
            requestedBranchId: branchId
          })
        }).then(resp => {
          if (resp && (Number(resp.status) === 503 || resp.httpStatus === 503 || resp.code === 'DATABASE_UNAVAILABLE')) {
            console.warn('[ManagerStore] Database 503 on resume. Retaining session.');
            set({ isDatabaseUnavailable: true });
            return;
          }
          if (resp && !resp.authorized) {
            console.warn('[ManagerStore] Account revoked on app resume:', resp.reason);
            signOut(auth).catch(() => {});
            localStorage.removeItem('restaurant_manager_profile');
            sessionStorage.clear();
            set({
              user: null,
              managerProfile: null,
              userRole: null,
              isAuthorized: false,
              isDatabaseUnavailable: false,
              restrictedReason: resp.reason || 'This account or franchise has been deactivated by the store owner.',
              restrictedEmail: auth.currentUser?.email || null
            });
          } else if (resp && resp.authorized) {
            set({ isDatabaseUnavailable: false });
          }
        }).catch(err => {
          console.warn('[ManagerStore] Resume auth check error:', err);
          set({ isDatabaseUnavailable: true });
        });
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume);
    }

    // Restore cached orders and sync state from IndexedDB instantly
    get().restoreFromIndexedDbCache();

    // Setup automatic synchronization when network reconnects
    const handleOnline = () => {
      console.log('[ManagerStore] Network online event detected -> triggering offline actions sync');
      get().syncOfflineActions();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }
    const syncInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        get().syncOfflineActions();
      }
    }, 30000);

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(safetyTimer);
      if (currentUser) {
        const emailLower = (currentUser.email || '').toLowerCase().trim();
        const branchId = get().activeBranchId || undefined;

        try {
          const resp = await fetchApi<any>('/api/auth/authorize-app', {
            method: 'POST',
            body: JSON.stringify({
              targetApp: 'RESTAURANT_MANAGER',
              requestedBranchId: branchId
            })
          });

          // 1. Authoritative Database Outage (HTTP 503)
          if (resp && (Number(resp.status) === 503 || resp.httpStatus === 503 || resp.code === 'DATABASE_UNAVAILABLE')) {
            console.warn('[ManagerStore] Database temporarily unavailable (503). Retaining Firebase session.');
            SoundAlertEngine.stopAlarm();
            set({
              user: currentUser,
              managerProfile: null,
              userRole: null,
              isAuthorized: false,
              isAuthChecking: false,
              isDatabaseUnavailable: true,
              restrictedReason: null,
              restrictedEmail: null
            });
            return;
          }

          // 2. Authorized Handshake
          if (resp && resp.authorized) {
            const u = resp.user;
            const allowedApps: string[] = resp.allowedApps || u?.allowedApps || [];
            if (!allowedApps.includes('RESTAURANT_MANAGER')) {
              console.warn('[ManagerStore] Account missing RESTAURANT_MANAGER grant in allowedApps');
              await signOut(auth).catch(() => {});
              localStorage.removeItem('restaurant_manager_profile');
              sessionStorage.clear();
              set({
                user: null,
                managerProfile: null,
                userRole: null,
                isAuthorized: false,
                isAuthChecking: false,
                isDatabaseUnavailable: false,
                restrictedReason: 'Access denied: Your account lacks the RESTAURANT_MANAGER application grant.',
                restrictedEmail: emailLower
              });
              return;
            }

            const resolvedBranchId = u?.branchId;
            const resolvedFranchiseId = u?.franchiseId;
            if (!resolvedBranchId || !resolvedFranchiseId) {
              console.warn('[ManagerStore] Account missing authoritative branch or franchise assignment');
              await signOut(auth).catch(() => {});
              localStorage.removeItem('restaurant_manager_profile');
              sessionStorage.clear();
              set({
                user: null,
                managerProfile: null,
                userRole: null,
                isAuthorized: false,
                isAuthChecking: false,
                isDatabaseUnavailable: false,
                restrictedReason: 'Access denied: No authoritative branch or franchise scope assigned to your account.',
                restrictedEmail: emailLower
              });
              return;
            }

            const profile: ManagerAccount = {
              uid: currentUser.uid,
              name: u.name || currentUser.displayName || emailLower.split('@')[0] || 'Restaurant Manager',
              email: currentUser.email || '',
              role: u.role as any,
              branchId: resolvedBranchId,
              branchName: u.branchName || 'Olive Pizza — Rajnandgaon HQ',
              franchiseId: resolvedFranchiseId,
              permissions: u.permissions || [],
              isActive: true
            };

            set({
              user: currentUser,
              managerProfile: profile,
              userRole: u.role,
              isAuthorized: true,
              authStatus: 'APPROVED',
              isAuthChecking: false,
              isDatabaseUnavailable: false,
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
          } else if (resp && (Number(resp.status) === 403 || resp.httpStatus === 403 || resp.code === 'ACCOUNT_REJECTED' || resp.code === 'ACCOUNT_DEACTIVATED' || resp.code === 'PENDING_OWNER_APPROVAL' || resp.code === 'NOT_REGISTERED' || resp.code === 'BRANCH_NOT_ASSIGNED' || !resp.authorized)) {
            // Explicit authorization denial from server
            const denialReason = resp?.reason || 'This account is not authorized to use this Olive Pizza application.';
            const code = resp?.code || 'UNAUTHORIZED';
            console.warn('[ManagerStore] Access restricted by server:', emailLower, code, denialReason);

            SoundAlertEngine.stopAlarm();

            // If pending approval, KEEP Firebase session so the user can see their pending status and refresh
            const isPending = code === 'PENDING_OWNER_APPROVAL';
            if (!isPending) {
              await signOut(auth).catch(() => {});
            }

            localStorage.removeItem('restaurant_manager_profile');
            sessionStorage.clear();

            set({
              user: isPending ? currentUser : null,
              managerProfile: null,
              userRole: null,
              isAuthorized: false,
              isAuthChecking: false,
              isDatabaseUnavailable: false,
              authStatus: isPending ? 'PENDING_OWNER_APPROVAL' : code === 'ACCOUNT_REJECTED' ? 'ACCOUNT_REJECTED' : code === 'ACCOUNT_DEACTIVATED' ? 'ACCOUNT_DEACTIVATED' : null,
              restrictedReason: denialReason,
              restrictedEmail: emailLower
            });
          }
        } catch (err: any) {
          console.error('[ManagerStore] Auth handshake network error:', err);
          SoundAlertEngine.stopAlarm();
          // Transient network error or backend cold start: Retain session, set database unavailable
          set({
            user: currentUser,
            managerProfile: null,
            userRole: null,
            isAuthorized: false,
            isAuthChecking: false,
            isDatabaseUnavailable: true,
            authStatus: null,
            restrictedReason: null,
            restrictedEmail: null
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

    return () => {
      clearTimeout(safetyTimer);
      clearInterval(syncInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume);
      }
      unsubAuth();
    };
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
      set({ user: null, managerProfile: null, isAuthorized: false, restrictedReason: null, restrictedEmail: null, liveOrders: [] });
    } catch (e) {
      console.error('[ManagerStore] Logout error:', e);
    }
  },

  setActiveBranch: (branchId, branchName) => {
    set({
      activeBranchId: branchId,
      activeBranchName: branchName || (branchId ? `Branch ${branchId}` : '')
    });
    get().subscribeToLiveOrders(branchId);
    get().subscribeToRiders(branchId);
    get().subscribeToRestaurantStatus(branchId);
    get().fetchHistoricalOrders();
  },

  subscribeToLiveOrders: (branchId) => {
    if (liveOrdersUnsub) liveOrdersUnsub();
    set({ isOrdersLoading: true });

    let livePollInterval: ReturnType<typeof setInterval> | null = null;
    let isDisposed = false;
    let isFirstLoad = true;
    let snapshotMap = new Map<string, Order>();
    let apiMap = new Map<string, Order>();

    const isSyntheticOrder = (id: string, data: any) => (
      id.startsWith('test_') ||
      id.startsWith('mock_') ||
      id.startsWith('synthetic_') ||
      id.startsWith('dummy_') ||
      id.startsWith('online_test_') ||
      id.startsWith('ord_test_') ||
      (data?.customerName && /^(test|mock|synthetic|dummy|fake|archival test|idempotency test)/i.test(data.customerName)) ||
      (data?.orderNumber && /test/i.test(String(data.orderNumber))) ||
      (data?.orderSource && /test|mock/i.test(String(data.orderSource))) ||
      data?.isTest === true
    );

    const parseDateVal = (val: any, fallback: Date): Date => {
      if (!val) return fallback;
      if (val instanceof Date) return val;
      if (typeof val.toDate === 'function') return val.toDate();
      if (val instanceof Timestamp) return val.toDate();
      if (typeof val._seconds === 'number') return new Date(val._seconds * 1000);
      if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
      const parsed = new Date(val);
      return isNaN(parsed.getTime()) ? fallback : parsed;
    };

    const normalizeOrder = (id: string, data: any, fallbackBranchId: string): Order => {
      const status = (data.status || data.order_status || 'pending').toLowerCase() as OrderStatus;
      const createdDate = parseDateVal(data.createdAt || data.created_at, new Date());
      const updatedDate = parseDateVal(data.updatedAt || data.updated_at, createdDate);
      return {
        id,
        orderNumber: data.dailyOrderNumber ? `#${data.dailyOrderNumber}` : (data.orderNumber || `#${id.slice(0, 6).toUpperCase()}`),
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
        branchId: data.branchId || fallbackBranchId,
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
      };
    };

    const targetBranchId = (!branchId || branchId === 'all')
      ? (get().managerProfile?.branchId || '')
      : branchId;

    const flushMergedLiveOrders = () => {
      if (isDisposed) return;
      const merged = new Map<string, Order>();
      for (const [id, o] of snapshotMap.entries()) {
        merged.set(id, o);
      }
      for (const [id, o] of apiMap.entries()) {
        const existing = merged.get(id);
        merged.set(id, existing ? {
          ...existing,
          ...o,
          items: (o.items && o.items.length > 0) ? o.items : existing.items,
          deliveryAddress: o.deliveryAddress || existing.deliveryAddress,
          estimatedPreparationMinutes: o.estimatedPreparationMinutes ?? existing.estimatedPreparationMinutes,
          expectedReadyAt: o.expectedReadyAt || existing.expectedReadyAt,
        } : o);
      }

      const activeList = Array.from(merged.values()).filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status));
      activeList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      set({ liveOrders: activeList, isOrdersLoading: false });
      RestaurantIndexedDbService.cacheOrders(activeList).catch(() => {});

      const now = Date.now();
      const pendingOrders = activeList.filter((o) => {
        if (o.status !== 'pending' && o.status !== 'pending_acceptance') return false;
        const orderTime = o.createdAt instanceof Date ? o.createdAt.getTime() : (o.createdAt ? new Date(o.createdAt).getTime() : 0);
        return !isNaN(orderTime) && orderTime > 0 && (now - orderTime < 15 * 60 * 1000);
      });
      const currentStatus = get().restaurantStatus;
      const isRestaurantOpen = currentStatus ? (currentStatus.isOpen !== false && currentStatus.acceptingOrders !== false) : true;
      const isAlarmEnabled = deviceAlarmService.isAlarmEnabled();

      if (isFirstLoad) {
        pendingOrders.forEach((o) => NotificationDeduplicator.record(`ORDER_NEW_ALERT:${o.id}`));
        isFirstLoad = false;
      } else {
        let hasNewPendingOrder = false;
        for (const o of pendingOrders) {
          if (NotificationDeduplicator.shouldProcess(`ORDER_NEW_ALERT:${o.id}`)) {
            hasNewPendingOrder = true;
          }
        }
        if (hasNewPendingOrder && isRestaurantOpen && isAlarmEnabled) {
          SoundAlertEngine.startContinuousAlarm('new_order');
        }
      }

      if (pendingOrders.length === 0 || !isRestaurantOpen || !isAlarmEnabled) {
        SoundAlertEngine.stopAlarm();
      }
    };

    const syncFromBackendApi = async () => {
      if (isDisposed || !targetBranchId) return;
      try {
        const res = await fetchApi<{ success: boolean; orders: any[] }>(`/api/orders/live?branchId=${encodeURIComponent(targetBranchId)}`);
        if (res && res.success && Array.isArray(res.orders)) {
          const nextApiMap = new Map<string, Order>();
          const profileFranchiseId = get().managerProfile?.franchiseId;
          const normF = (id?: string) => (id || '').trim().toLowerCase().replace(/^fra_/, '');
          for (const raw of res.orders) {
            const oid = raw?.id || raw?.orderId;
            if (!oid || isSyntheticOrder(oid, raw)) continue;
            if (profileFranchiseId && raw.franchiseId && normF(raw.franchiseId) !== normF(profileFranchiseId) && profileFranchiseId !== 'all') {
              continue;
            }
            nextApiMap.set(oid, normalizeOrder(oid, raw, targetBranchId));
          }
          apiMap = nextApiMap;
          flushMergedLiveOrders();
        }
      } catch (err) {
        console.warn('[ManagerStore] Live orders API sync notice:', err);
      }
    };

    syncFromBackendApi();
    livePollInterval = setInterval(syncFromBackendApi, 5000);

    try {
      const scopedQuery = query(
        collection(db, 'orders'),
        where('branchId', '==', targetBranchId)
      );

      liveOrdersUnsub = onSnapshot(scopedQuery, (snapshot) => {
        const currentProfile = get().managerProfile;
        const profileFranchiseId = currentProfile?.franchiseId;
        const normF = (id?: string) => (id || '').trim().toLowerCase().replace(/^fra_/, '');
        const nextSnapMap = new Map<string, Order>();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (isSyntheticOrder(docSnap.id, data)) return;

          const orderFranchise = data.franchiseId;
          if (profileFranchiseId && orderFranchise && normF(orderFranchise) !== normF(profileFranchiseId) && profileFranchiseId !== 'all') {
            return;
          }

          const status = (data.status || 'pending').toLowerCase() as OrderStatus;
          if (ACTIVE_ORDER_STATUSES.includes(status)) {
            nextSnapMap.set(docSnap.id, normalizeOrder(docSnap.id, data, targetBranchId));
          }
        });

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const data = change.doc.data();
            if (isSyntheticOrder(change.doc.id, data)) return;
            const s = (data.status || '').toLowerCase();
            if (s === 'delivered') {
              if (NotificationDeduplicator.shouldProcess(`ORDER_DELIVERED:${change.doc.id}`)) {
                SoundAlertEngine.playOrderDelivered();
              }
            }
          }
        });

        snapshotMap = nextSnapMap;
        flushMergedLiveOrders();
      }, async (err) => {
        console.warn('[ManagerStore] Orders listener fallback to backend API:', err);
        await syncFromBackendApi();
        if (!isDisposed) set({ isOrdersLoading: false });
      });
    } catch (err) {
      console.error('[ManagerStore] Error setting up live orders listener:', err);
      set({ isOrdersLoading: false });
    }

    return () => {
      isDisposed = true;
      if (livePollInterval) {
        clearInterval(livePollInterval);
        livePollInterval = null;
      }
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
        const orderBranch = data.branchId || '';
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
      RestaurantIndexedDbService.cacheOrders(pastList).catch(() => {});
    } catch (err) {
      console.error('[ManagerStore] Error fetching historical orders:', err);
    }
  },

  updateOrderStatus: async (orderId, nextStatus, reason, estimatedPreparationMinutes) => {
    set({ isActionLoading: true });
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('NETWORK_OFFLINE: Device is currently offline');
      }

      let endpoint = `/api/orders/${orderId}/status`;
      let body: any = { status: nextStatus };

      if (nextStatus === 'delivered') {
        body.paymentCollected = true;
        body.paymentStatus = 'PAID';
      } else if (nextStatus === 'preparing' || nextStatus === 'accepted') {
        endpoint = `/api/orders/${orderId}/accept`;
        if (typeof estimatedPreparationMinutes === 'number' && estimatedPreparationMinutes > 0) {
          body.estimatedPreparationMinutes = estimatedPreparationMinutes;
          body.prepMinutes = estimatedPreparationMinutes;
        }
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
        invalidateRestaurantCache(/(orders|bootstrap)/);
        const resolvedStatus = (res.status as OrderStatus) || nextStatus;
        // Optimistic local update (confirmed by backend success)
        set((state) => {
          const updatedLive = state.liveOrders.map((o) =>
            o.id === orderId ? {
              ...o,
              status: resolvedStatus,
              cancellationReason: reason,
              estimatedPreparationMinutes: res.estimatedPreparationMinutes ?? o.estimatedPreparationMinutes,
              expectedReadyAt: res.expectedReadyAt || o.expectedReadyAt
            } : o
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
      console.warn('[ManagerStore] Network request failed for updateOrderStatus, falling back to durable offline action queue:', err);
      try {
        const idempotencyKey = `off_act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const existingOrder = get().liveOrders.find((o) => o.id === orderId) || get().historicalOrders.find((o) => o.id === orderId);

        const offlineRecord: OfflineActionRecord = {
          idempotencyKey,
          orderId,
          nextStatus,
          branchId: existingOrder?.branchId || get().activeBranchId || 'branch_rjn_01',
          franchiseId: get().managerProfile?.franchiseId || 'all',
          reason,
          estimatedPreparationMinutes,
          status: 'PENDING_SYNC',
          createdAt: new Date().toISOString(),
          retryCount: 0,
          orderSummary: {
            orderNumber: existingOrder?.orderNumber,
            customerName: existingOrder?.customerName,
            totalAmount: existingOrder?.totalAmount
          }
        };

        await RestaurantIndexedDbService.enqueueOfflineAction(offlineRecord);

        // Optimistic local state update
        set((state) => {
          const updatedLive = state.liveOrders.map((o) =>
            o.id === orderId ? { ...o, status: nextStatus, cancellationReason: reason } : o
          ).filter((o) => ACTIVE_ORDER_STATUSES.includes(nextStatus) || o.id !== orderId);

          return {
            liveOrders: updatedLive,
            isActionLoading: false,
            pendingOfflineActionsCount: state.pendingOfflineActionsCount + 1
          };
        });

        return { success: true, status: nextStatus };
      } catch (dbErr: any) {
        console.error('[ManagerStore] Failed to commit to durable IndexedDB queue:', dbErr);
        set({ isActionLoading: false });
        return { success: false, error: 'Failed to update order status or save offline: ' + dbErr?.message };
      }
    }
  },

    confirmPrepTime: async (orderId: string, prepMinutes: number) => {
    try {
      const res = await fetchApi(`/api/orders/${orderId}/confirm-prep-time`, {
        method: 'POST',
        body: JSON.stringify({ prepMinutes })
      });
      if (res && res.success) {
        set((state) => ({
          liveOrders: state.liveOrders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  estimatedPreparationMinutes: prepMinutes,
                  expectedReadyAt: res.expectedReadyAt,
                  estimatedReadyAt: res.expectedReadyAt,
                  deliveryEta: res.deliveryEta || (o as any).deliveryEta,
                }
              : o
          )
        }));
        return { success: true, expectedReadyAt: res.expectedReadyAt, deliveryEta: res.deliveryEta };
      }
      return { success: false, error: res?.error || 'Failed to update prep duration' };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error updating prep duration' };
    }
  },

  subscribeToRestaurantStatus: (branchId: string) => {
    if (statusUnsub) {
      statusUnsub();
      statusUnsub = null;
    }
    set({ isStatusLoading: true });

    try {
      if (!branchId) {
        set({ isStatusLoading: false });
        return () => {};
      }
      const docRef = doc(db, 'restaurant_settings', branchId);
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
        invalidateStatusCache();
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
          const rBranch = r.branchId || '';
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
              vehicleType: d.vehicleType || 'Scooter',
              vehicleNumber: d.vehicleNumber || '',
              currentOrderId: d.currentOrderId || d.activeOrderId,
              currentOrderNumber: d.currentOrderNumber,
              currentLocation: (d.latitude !== undefined && d.longitude !== undefined && !isNaN(Number(d.latitude)) && !isNaN(Number(d.longitude))) ? {
                lat: Number(d.latitude),
                lng: Number(d.longitude),
                speed: Number(d.speed) || 0,
                heading: Number(d.heading) || 0,
                lastUpdated: d.updatedAt || new Date().toISOString()
              } : (d.location && d.location.lat !== undefined && d.location.lng !== undefined && !isNaN(Number(d.location.lat)) && !isNaN(Number(d.location.lng))) ? {
                lat: Number(d.location.lat),
                lng: Number(d.location.lng),
                speed: Number(d.location.speed) || 0,
                heading: Number(d.location.heading) || 0,
                lastUpdated: d.location.lastUpdated || new Date().toISOString()
              } : undefined,
              lastSeen: d.lastSeen?.toDate ? d.lastSeen.toDate().toISOString() : d.lastSeen?._seconds ? new Date(d.lastSeen._seconds * 1000).toISOString() : (typeof d.lastSeen === 'string' ? d.lastSeen : (d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt?._seconds ? new Date(d.updatedAt._seconds * 1000).toISOString() : (typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString()))),
              branchId: d.branchId || ''
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
              vehicleType: d.vehicleType || 'Scooter',
              vehicleNumber: d.vehicleNumber || '',
              currentOrderId: d.currentOrderId,
              currentOrderNumber: d.currentOrderNumber,
              currentLocation: (d.latitude !== undefined && d.longitude !== undefined && !isNaN(Number(d.latitude)) && !isNaN(Number(d.longitude))) ? {
                lat: Number(d.latitude),
                lng: Number(d.longitude),
                speed: Number(d.speed) || 0,
                heading: Number(d.heading) || 0,
                lastUpdated: d.updatedAt || new Date().toISOString()
              } : (d.location && d.location.lat !== undefined && d.location.lng !== undefined && !isNaN(Number(d.location.lat)) && !isNaN(Number(d.location.lng))) ? {
                lat: Number(d.location.lat),
                lng: Number(d.location.lng),
                speed: Number(d.location.speed) || 0,
                heading: Number(d.location.heading) || 0,
                lastUpdated: d.location.lastUpdated || new Date().toISOString()
              } : undefined,
              lastSeen: d.lastSeen || d.updatedAt || new Date().toISOString(),
              branchId: d.branchId || ''
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

  restoreFromIndexedDbCache: async () => {
    try {
      const branchId = get().activeBranchId;
      const cached = await RestaurantIndexedDbService.getCachedOrders(branchId);
      if (cached && cached.length > 0 && get().liveOrders.length === 0) {
        const active = cached.filter(o => ACTIVE_ORDER_STATUSES.includes((o.status || '').toLowerCase() as OrderStatus));
        set({ liveOrders: active, isOrdersLoading: false });
      }

      const pending = await RestaurantIndexedDbService.getPendingActions();
      const meta = await RestaurantIndexedDbService.getSyncMeta('last_sync_success');

      set({
        pendingOfflineActionsCount: pending.length,
        lastSyncTimestamp: meta?.lastSyncAt || null
      });
    } catch (err) {
      console.warn('[ManagerStore] Failed to restore from IndexedDB cache:', err);
    }
  },

  syncOfflineActions: async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, synced: 0, failed: 0 };
    }

    try {
      const pending = await RestaurantIndexedDbService.getPendingActions();
      if (!pending || pending.length === 0) {
        set({ pendingOfflineActionsCount: 0 });
        return { success: true, synced: 0, failed: 0 };
      }

      const res = await fetchApi<any>('/api/orders/sync-offline-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: pending })
      });

      if (res && res.success && Array.isArray(res.results)) {
        let syncedCount = 0;
        let failedCount = 0;

        for (const item of res.results) {
          const key = item.idempotencyKey || item.actionId;
          if (!key) continue;
          if (item.status === 'SYNCED' || item.status === 'ALREADY_SYNCED') {
            await RestaurantIndexedDbService.markActionSynced(key, item.serverTimestamp);
            syncedCount++;
          } else if (item.status === 'REVIEW_REQUIRED') {
            await RestaurantIndexedDbService.markActionFailed(key, item.error || 'Conflict detected', 'REVIEW_REQUIRED');
            failedCount++;
          } else {
            await RestaurantIndexedDbService.markActionFailed(key, item.error || 'Server rejected transition', 'RETRY_REQUIRED');
            failedCount++;
          }
        }

        const remaining = await RestaurantIndexedDbService.getPendingActions();
        const syncMeta = {
          lastSyncAt: new Date().toISOString(),
          syncedCount,
          failedCount,
          pendingCount: remaining.length
        };
        await RestaurantIndexedDbService.setSyncMeta('last_sync_success', syncMeta);

        set({
          pendingOfflineActionsCount: remaining.length,
          lastSyncTimestamp: syncMeta.lastSyncAt
        });

        // Trigger fresh fetch
        get().fetchHistoricalOrders();

        return { success: true, synced: syncedCount, failed: failedCount };
      }
      return { success: false, synced: 0, failed: 0 };
    } catch (err) {
      console.warn('[ManagerStore] Background sync error:', err);
      return { success: false, synced: 0, failed: 0 };
    }
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
