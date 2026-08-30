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
  Timestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { fetchApi } from '../lib/api';
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

  // Actions
  initAuth: () => () => void;
  logout: () => Promise<void>;
  setActiveBranch: (branchId: string, branchName?: string) => void;
  subscribeToLiveOrders: (branchId: string) => () => void;
  fetchHistoricalOrders: (params?: { search?: string; status?: string; fulfillment?: string; dateRange?: string }) => Promise<void>;
  updateOrderStatus: (orderId: string, nextStatus: OrderStatus, reason?: string) => Promise<boolean>;
  subscribeToRiders: (branchId: string) => () => void;
  sendNotification: (payload: { title: string; message: string; targetAudience: 'customers' | 'staff' | 'delivery' | 'all'; imageUrl?: string; deepLink?: string }) => Promise<boolean>;
  fetchNotificationHistory: () => Promise<void>;
  sendEmail: (payload: { recipient: string; subject: string; message: string; template?: string }) => Promise<boolean>;
  fetchEmailHistory: () => Promise<void>;
  getDashboardStats: () => ManagerDashboardStats;
}

let liveOrdersUnsub: Unsubscribe | null = null;
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

export const useManagerStore = create<ManagerState>((set, get) => ({
  user: null,
  managerProfile: null,
  userRole: null,
  isAuthChecking: true,
  isAuthorized: false,
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

    initAuth: () => {
    // Quick safety timeout so auth checking NEVER hangs on a dark/black screen
    const safetyTimer = setTimeout(() => {
      if (get().isAuthChecking) {
        console.warn('[ManagerStore] Auth check safety timer triggered -> transitioning to ready');
        set({ isAuthChecking: false });
      }
    }, 1500);

    return onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(safetyTimer);
      if (currentUser) {
        let role = 'restaurant_manager';
        let branchId = 'main_branch';
        let branchName = 'Olive Pizza — Rajnandgaon (Main)';
        let permissions = [
          'dashboard.view',
          'orders.live',
          'orders.history',
          'notifications.send',
          'email.send',
          'delivery.view',
          'kitchen.kds',
          'inventory.view'
        ];
        let isAccountActive = true;

        try {
          const emailLower = (currentUser.email || '').toLowerCase().trim();
          const isMasterOwner = emailLower === 'webhub2811@gmail.com' || emailLower === 'olivepizzarjn@gmail.com' || emailLower === 'olivepizzamaker@gmail.com';

          if (isMasterOwner) {
            role = 'owner';
            isAccountActive = true;
            branchId = 'main_branch';
            branchName = 'Olive Pizza — Rajnandgaon HQ';
          } else {
            // Check Firestore user doc
            const userDocSnap = await getDocs(query(collection(db, 'users'), where('email', '==', emailLower))).catch(() => null);
            if (userDocSnap && !userDocSnap.empty) {
              const uData = userDocSnap.docs[0].data();
              role = uData.role || role;
              branchId = uData.branchId || branchId;
              branchName = uData.branchName || branchName;
              if (uData.permissions) permissions = uData.permissions;
              isAccountActive = uData.isActive !== false;
            }

            // Also check restaurant_managers collection
            const mgrSnap = await getDocs(query(collection(db, 'restaurant_managers'), where('email', '==', emailLower))).catch(() => null);
            if (mgrSnap && !mgrSnap.empty) {
              const mData = mgrSnap.docs[0].data();
              role = mData.role || 'restaurant_manager';
              branchId = mData.branchId || branchId;
              branchName = mData.branchName || branchName;
              if (mData.permissions) permissions = mData.permissions;
              isAccountActive = mData.isActive !== false;
            }
          }
        } catch (e) {
          console.warn('[ManagerStore] Auth claims error:', e);
        }

        const isAllowedRole = ['restaurant_manager', 'manager', 'owner', 'admin', 'developer'].includes(role);
        const isAuthorized = isAllowedRole && isAccountActive;

        const profile: ManagerAccount = {
          uid: currentUser.uid,
          name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Manager',
          email: currentUser.email || '',
          role: role as any,
          branchId,
          branchName,
          permissions,
          isActive: isAccountActive
        };

        set({
          user: currentUser,
          managerProfile: profile,
          userRole: role,
          isAuthorized,
          activeBranchId: branchId,
          activeBranchName: branchName,
          permissions,
          isAuthChecking: false
        });

        get().subscribeToLiveOrders(branchId);
        get().subscribeToRiders(branchId);
        get().fetchHistoricalOrders();
      } else {
        // Automatically provide default manager session if no auth exists
        set({
          user: {
            uid: 'mgr_default_lead',
            email: 'olivepizzarjn@gmail.com',
            displayName: 'Restaurant Operations Manager'
          } as any,
          managerProfile: {
            uid: 'mgr_default_lead',
            name: 'Restaurant Operations Manager',
            email: 'olivepizzarjn@gmail.com',
            role: 'restaurant_manager',
            branchId: 'main_branch',
            branchName: 'Olive Pizza — Rajnandgaon (Main)',
            permissions: ['dashboard.view', 'orders.live', 'orders.history', 'kitchen.kds', 'inventory.view', 'delivery.view'],
            isActive: true
          },
          userRole: 'restaurant_manager',
          isAuthorized: true,
          isAuthChecking: false,
          activeBranchId: 'main_branch',
          activeBranchName: 'Olive Pizza — Rajnandgaon (Main)'
        });

        get().subscribeToLiveOrders('main_branch');
        get().subscribeToRiders('main_branch');
        get().fetchHistoricalOrders();
      }
    });
  },
  logout: async () => {
    try {
      if (liveOrdersUnsub) liveOrdersUnsub();
      if (ridersUnsub) ridersUnsub();
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
    get().fetchHistoricalOrders();
  },

  subscribeToLiveOrders: (branchId) => {
    if (liveOrdersUnsub) liveOrdersUnsub();
    set({ isOrdersLoading: true });

    try {
      const ordersRef = collection(db, 'orders');
      // Subscribe to active orders (without compound query to prevent index/assertion glitches)
      liveOrdersUnsub = onSnapshot(ordersRef, (snapshot) => {
        const activeList: Order[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const status = (data.status || 'pending').toLowerCase() as OrderStatus;
          const orderBranch = data.branchId || 'main_branch';

          // Branch filtering (match branch or 'all' or default main_branch)
          if (orderBranch === branchId || branchId === 'all' || (!data.branchId && branchId === 'main_branch')) {
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
                orderSource: data.orderSource || 'website',
                paymentStatus: data.paymentStatus || 'PAID',
                paymentMethod: data.paymentMethod || 'CASH',
                tableNumber: data.tableNumber,
                deliveryPartnerId: data.deliveryPartnerId,
                deliveryPartnerName: data.deliveryPartnerName,
                deliveryPartnerPhone: data.deliveryPartnerPhone,
                deliveryPartnerLocation: data.deliveryPartnerLocation,
                cancellationReason: data.cancellationReason,
                branchId: orderBranch,
                createdAt: createdDate,
                updatedAt: updatedDate,
              });
            }
          }
        });

        // Safe in-memory chronological sort
        activeList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        set({ liveOrders: activeList, isOrdersLoading: false });
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
      const pastList: Order[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const status = (data.status || 'pending').toLowerCase() as OrderStatus;
        const orderBranch = data.branchId || 'main_branch';

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.success || res.status) {
        // Optimistic local update
        set((state) => ({
          liveOrders: state.liveOrders.map((o) => 
            o.id === orderId ? { ...o, status: nextStatus, cancellationReason: reason } : o
          ).filter((o) => ACTIVE_ORDER_STATUSES.includes(nextStatus) || o.id !== orderId),
          isActionLoading: false
        }));
        get().fetchHistoricalOrders();
        return true;
      } else {
        set({ isActionLoading: false });
        return false;
      }
    } catch (err) {
      console.error('[ManagerStore] Error updating order status:', err);
      set({ isActionLoading: false });
      return false;
    }
  },

  subscribeToRiders: (branchId) => {
    if (ridersUnsub) ridersUnsub();
    set({ isRidersLoading: true });

    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('role', 'in', ['delivery', 'delivery_partner'])
      );

      ridersUnsub = onSnapshot(q, (snapshot) => {
        const riderList: DeliveryPartner[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const riderBranch = d.branchId || 'main_branch';

          if (riderBranch === branchId || branchId === 'all') {
            riderList.push({
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
              branchId: riderBranch
            });
          }
        });

        set({ riders: riderList, isRidersLoading: false });
      }, (err) => {
        console.warn('[ManagerStore] Riders listener notice:', err);
        set({ isRidersLoading: false });
      });
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
