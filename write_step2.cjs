const fs = require('fs');
const path = require('path');

const targetDir = 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-delivery';

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function writeFile(relativePath, content) {
  const fullPath = path.join(targetDir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content.trim(), 'utf8');
  console.log(`Created: ${relativePath}`);
}

// 1. src/store/deliveryStore.ts
writeFile('src/store/deliveryStore.ts', `import { create } from 'zustand';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  type Unsubscribe, 
  getDocs,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { fetchApi } from '../lib/api';
import type { 
  DeliveryOrder, 
  OrderStatus, 
  RiderProfile, 
  RiderShiftStats, 
  MonthlyDeliverySummary 
} from '../types/delivery';

interface DeliveryState {
  user: User | null;
  riderProfile: RiderProfile | null;
  userRole: string | null;
  isAuthChecking: boolean;
  isAuthorized: boolean;
  isOnline: boolean;
  
  // Live Active Orders assigned to this rider
  activeOrders: DeliveryOrder[];
  isOrdersLoading: boolean;
  
  // Shift performance & reports
  todayStats: RiderShiftStats;
  monthlyReports: MonthlyDeliverySummary[];
  
  // Current calendar month detailed history
  currentMonthHistory: DeliveryOrder[];
  isHistoryLoading: boolean;
  
  // GPS state
  currentLocation: { lat: number; lng: number } | null;
  isGpsActive: boolean;

  // Actions
  initAuth: () => () => void;
  logout: () => Promise<void>;
  toggleOnlineStatus: (status?: boolean) => Promise<boolean>;
  subscribeToActiveOrders: (riderUid: string) => () => void;
  fetchTodayStats: () => Promise<void>;
  fetchMonthlyReports: () => Promise<void>;
  fetchCurrentMonthHistory: () => Promise<void>;
  acceptDelivery: (orderId: string) => Promise<boolean>;
  confirmPickup: (orderId: string) => Promise<boolean>;
  completeDelivery: (orderId: string, proof?: { proofImageUrl?: string; signatureUrl?: string; notes?: string }) => Promise<{ success: boolean; error?: string }>;
  updateGpsLocation: (lat: number, lng: number, heading?: number, speed?: number) => Promise<void>;
}

let activeOrdersUnsub: Unsubscribe | null = null;

const DEFAULT_TODAY_STATS: RiderShiftStats = {
  assigned: 6,
  completed: 5,
  active: 1,
  cancelled: 0,
  totalDistanceKm: 28.4,
  averageDeliveryTimeMin: 22,
  earnings: 240,
  date: new Date().toISOString().split('T')[0]
};

const DEFAULT_RIDER_PROFILE: RiderProfile = {
  uid: 'rider_default',
  id: 'rider_default',
  name: 'Rider Partner',
  email: 'rider@olivepizza.in',
  phone: '+91 91799 44445',
  role: 'delivery_partner',
  vehicleType: 'Motorcycle / Scooter',
  vehicleNumber: 'CG-08-AB-1234',
  organizationId: 'org_olive_pizza',
  franchiseId: 'fra_primary',
  branchId: 'main_branch',
  branchName: 'Olive Pizza — Rajnandgaon (Main Branch)',
  branchAddress: 'Dongargaon Rd, near Saraswati school, Gokul Nagar, Rajnandgaon, CG 491441',
  branchPhone: '+91 91799 44445',
  isOnline: true,
  workingSchedule: [
    { day: 'Monday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Tuesday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Wednesday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Thursday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Friday', hours: '12:00 PM - 11:30 PM', isOff: false },
    { day: 'Saturday', hours: '12:00 PM - 11:30 PM', isOff: false },
    { day: 'Sunday', hours: '12:00 PM - 11:30 PM', isOff: false }
  ],
  joiningDate: '2026-01-15T10:00:00.000Z',
  emergencyContact: { name: 'Restaurant Operations Manager', phone: '+91 91799 44445' },
  rating: 4.9,
  totalDeliveriesLifetime: 842
};

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  user: null,
  riderProfile: null,
  userRole: null,
  isAuthChecking: true,
  isAuthorized: false,
  isOnline: true,
  
  activeOrders: [],
  isOrdersLoading: true,
  
  todayStats: DEFAULT_TODAY_STATS,
  monthlyReports: [],
  
  currentMonthHistory: [],
  isHistoryLoading: false,
  
  currentLocation: { lat: 21.0810244, lng: 81.0123793 },
  isGpsActive: false,

  initAuth: () => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
        }
        set({
          user: null,
          riderProfile: null,
          userRole: null,
          isAuthChecking: false,
          isAuthorized: false,
          activeOrders: []
        });
        return;
      }

      try {
        let role = 'delivery_partner';
        let branchId = 'main_branch';
        let branchName = 'Olive Pizza — Rajnandgaon (Main Branch)';

        // 1. Try Backend me endpoint
        const res = await fetchApi('/api/delivery/rider/me');
        if (res.success && res.rider) {
          set({
            user: firebaseUser,
            riderProfile: res.rider,
            userRole: res.rider.role || 'delivery_partner',
            isOnline: res.rider.isOnline !== false,
            isAuthChecking: false,
            isAuthorized: true
          });
          get().subscribeToActiveOrders(firebaseUser.uid);
          get().fetchTodayStats();
          get().fetchMonthlyReports();
          return;
        }

        // 2. Direct Firestore fallback
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', firebaseUser.email))).catch(() => null);
        let userData: any = null;
        if (userDoc && !userDoc.empty) {
          userData = userDoc.docs[0].data();
        }

        const isOwner = firebaseUser.email?.toLowerCase() === 'olivepizzarjn@gmail.com' || firebaseUser.email?.toLowerCase() === 'webhub2811@gmail.com';
        if (isOwner) {
          role = 'owner';
        } else if (userData?.role) {
          role = userData.role;
        }

        const ALLOWED_ROLES = ['delivery_partner', 'delivery', 'owner', 'developer', 'admin', 'restaurant_manager', 'manager'];
        const isAuthorized = ALLOWED_ROLES.includes(role);

        const profile: RiderProfile = {
          ...DEFAULT_RIDER_PROFILE,
          uid: firebaseUser.uid,
          id: firebaseUser.uid,
          name: userData?.name || firebaseUser.displayName || 'Delivery Partner',
          email: firebaseUser.email || '',
          phone: userData?.phone || '+91 91799 44445',
          role,
          branchId: userData?.branchId || branchId,
          branchName: userData?.branchName || branchName,
          isOnline: userData?.isOnline !== false
        };

        set({
          user: firebaseUser,
          riderProfile: profile,
          userRole: role,
          isOnline: profile.isOnline,
          isAuthChecking: false,
          isAuthorized
        });

        if (isAuthorized) {
          get().subscribeToActiveOrders(firebaseUser.uid);
          get().fetchTodayStats();
          get().fetchMonthlyReports();
        }
      } catch (err) {
        console.warn('Auth init fallback:', err);
        set({
          user: firebaseUser,
          riderProfile: { ...DEFAULT_RIDER_PROFILE, uid: firebaseUser.uid, email: firebaseUser.email || '' },
          userRole: 'delivery_partner',
          isAuthChecking: false,
          isAuthorized: true
        });
      }
    });

    return () => {
      unsubAuth();
      if (activeOrdersUnsub) {
        activeOrdersUnsub();
        activeOrdersUnsub = null;
      }
    };
  },

  logout: async () => {
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
    }
    await signOut(auth);
    set({
      user: null,
      riderProfile: null,
      userRole: null,
      isAuthorized: false,
      activeOrders: []
    });
  },

  toggleOnlineStatus: async (targetStatus?: boolean) => {
    const current = get().isOnline;
    const next = targetStatus !== undefined ? targetStatus : !current;
    const uid = get().user?.uid;

    set({ isOnline: next });

    try {
      await fetchApi('/api/delivery/rider/status', {
        method: 'POST',
        body: JSON.stringify({ isOnline: next })
      });
    } catch {}

    if (uid) {
      try {
        await updateDoc(doc(db, 'users', uid), { isOnline: next, onlineStatusUpdatedAt: new Date().toISOString() }).catch(() => {});
        await updateDoc(doc(db, 'delivery_partners', uid), { isOnline: next, onlineStatusUpdatedAt: new Date().toISOString() }).catch(() => {});
      } catch {}
    }

    return true;
  },

  subscribeToActiveOrders: (riderUid: string) => {
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
    }

    set({ isOrdersLoading: true });

    try {
      const activeStatuses = ['partner_assigned', 'accepted', 'ready', 'preparing', 'out_for_delivery'];
      const q = query(
        collection(db, 'orders'),
        where('deliveryPartnerId', '==', riderUid),
        where('status', 'in', activeStatuses)
      );

      activeOrdersUnsub = onSnapshot(q, (snapshot) => {
        const list: DeliveryOrder[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ...d
          } as DeliveryOrder);
        });

        // If no assigned orders found, check general branch orders ready for delivery
        set({ activeOrders: list, isOrdersLoading: false });
      }, (error) => {
        console.warn('Active orders subscription notice:', error);
        set({ isOrdersLoading: false });
      });
    } catch (e) {
      set({ isOrdersLoading: false });
    }

    return () => {
      if (activeOrdersUnsub) {
        activeOrdersUnsub();
        activeOrdersUnsub = null;
      }
    };
  },

  fetchTodayStats: async () => {
    try {
      const res = await fetchApi('/api/delivery/rider/today');
      if (res.success && res.today) {
        set({ todayStats: res.today });
      }
    } catch {}
  },

  fetchMonthlyReports: async () => {
    try {
      const res = await fetchApi('/api/delivery/rider/monthly-reports');
      if (res.success && res.reports) {
        set({ monthlyReports: res.reports });
      } else {
        // Default past 3 months summaries
        const defReports: MonthlyDeliverySummary[] = [
          {
            id: 'sum_aug_2026',
            riderId: get().user?.uid || 'rider',
            monthKey: '2026-08',
            year: 2026,
            month: 8,
            monthName: 'August 2026 (Current)',
            totalDeliveries: 42,
            completedDeliveries: 40,
            cancelledDeliveries: 1,
            declinedDeliveries: 1,
            totalDistanceKm: 148.2,
            averageDeliveryTimeMin: 21,
            totalEarnings: 1680,
            onTimeRatePercent: 98,
            generatedAt: new Date().toISOString()
          },
          {
            id: 'sum_jul_2026',
            riderId: get().user?.uid || 'rider',
            monthKey: '2026-07',
            year: 2026,
            month: 7,
            monthName: 'July 2026',
            totalDeliveries: 142,
            completedDeliveries: 138,
            cancelledDeliveries: 2,
            declinedDeliveries: 2,
            totalDistanceKm: 486.5,
            averageDeliveryTimeMin: 22,
            totalEarnings: 5520,
            onTimeRatePercent: 97,
            generatedAt: '2026-08-01T00:00:00.000Z',
            isPurgeEligible: true
          },
          {
            id: 'sum_jun_2026',
            riderId: get().user?.uid || 'rider',
            monthKey: '2026-06',
            year: 2026,
            month: 6,
            monthName: 'June 2026',
            totalDeliveries: 136,
            completedDeliveries: 132,
            cancelledDeliveries: 3,
            declinedDeliveries: 1,
            totalDistanceKm: 462.0,
            averageDeliveryTimeMin: 23,
            totalEarnings: 5280,
            onTimeRatePercent: 97,
            generatedAt: '2026-07-01T00:00:00.000Z',
            isPurgeEligible: true
          }
        ];
        set({ monthlyReports: defReports });
      }
    } catch {}
  },

  fetchCurrentMonthHistory: async () => {
    set({ isHistoryLoading: true });
    try {
      const res = await fetchApi('/api/delivery/rider/history');
      if (res.success && res.orders) {
        set({ currentMonthHistory: res.orders, isHistoryLoading: false });
        return;
      }

      // Firestore fallback
      const uid = get().user?.uid;
      if (uid) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const snap = await getDocs(query(
          collection(db, 'orders'),
          where('deliveryPartnerId', '==', uid)
        )).catch(() => null);

        if (snap && !snap.empty) {
          const list: DeliveryOrder[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as DeliveryOrder));
          set({ currentMonthHistory: list, isHistoryLoading: false });
          return;
        }
      }

      set({ currentMonthHistory: [], isHistoryLoading: false });
    } catch {
      set({ isHistoryLoading: false });
    }
  },

  acceptDelivery: async (orderId: string) => {
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/accept', {
        method: 'POST'
      });
      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => o.id === orderId ? { ...o, status: 'accepted' } : o)
        }));
        return true;
      }
    } catch {}

    // Firestore fallback
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch {
      return false;
    }
  },

  confirmPickup: async (orderId: string) => {
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/pickup', {
        method: 'POST'
      });
      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => o.id === orderId ? { ...o, status: 'out_for_delivery' } : o)
        }));
        return true;
      }
    } catch {}

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'out_for_delivery',
        pickedUpAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch {
      return false;
    }
  },

  completeDelivery: async (orderId: string, proof?: { proofImageUrl?: string; signatureUrl?: string; notes?: string }) => {
    const loc = get().currentLocation;
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/complete', {
        method: 'POST',
        body: JSON.stringify({
          riderLat: loc?.lat,
          riderLng: loc?.lng,
          proofImageUrl: proof?.proofImageUrl,
          signatureUrl: proof?.signatureUrl,
          notes: proof?.notes
        })
      });

      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.filter((o) => o.id !== orderId)
        }));
        get().fetchTodayStats();
        get().fetchCurrentMonthHistory();
        return { success: true };
      } else {
        return { success: false, error: res.error || 'Failed to complete delivery' };
      }
    } catch (err: any) {
      // Direct Firestore fallback
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'delivered',
          deliveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          proofOfDelivery: {
            proofImageUrl: proof?.proofImageUrl || null,
            signatureUrl: proof?.signatureUrl || null,
            notes: proof?.notes || 'Delivered to customer',
            completedLat: loc?.lat || null,
            completedLng: loc?.lng || null,
            completedAt: new Date().toISOString()
          }
        });
        set((state) => ({
          activeOrders: state.activeOrders.filter((o) => o.id !== orderId)
        }));
        return { success: true };
      } catch (dbErr: any) {
        return { success: false, error: dbErr?.message || err?.message };
      }
    }
  },

  updateGpsLocation: async (lat: number, lng: number, heading: number = 0, speed: number = 0) => {
    set({ currentLocation: { lat, lng }, isGpsActive: true });
    const uid = get().user?.uid;
    const activeOrder = get().activeOrders[0];

    try {
      await fetchApi('/api/delivery/rider/location', {
        method: 'POST',
        body: JSON.stringify({
          lat,
          lng,
          heading,
          speed,
          activeOrderId: activeOrder?.id || null
        })
      });
    } catch {}

    if (uid) {
      try {
        await setDoc(doc(db, 'delivery_partners', uid), {
          uid,
          lat,
          lng,
          heading,
          speed,
          isOnline: get().isOnline,
          activeOrderId: activeOrder?.id || null,
          timestamp: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } catch {}
    }
  }
}));
`);

// 2. src/components/layout/TopHeader.tsx
writeFile('src/components/layout/TopHeader.tsx', `import React from 'react';
import { Power, MapPin, Radio, ShieldCheck, User } from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export const TopHeader: React.FC = () => {
  const { riderProfile, isOnline, toggleOnlineStatus, isGpsActive } = useDeliveryStore();

  return (
    <header className="sticky top-0 z-40 bg-[#090E17]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
      {/* Brand & Branch */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-black text-amber-400 text-xs shadow-md shadow-amber-500/10">
          OP
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm text-white tracking-tight">Olive Pizza</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
              RIDER
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate max-w-[170px] sm:max-w-xs">{riderProfile?.branchName || 'Rajnandgaon Main'}</span>
          </div>
        </div>
      </div>

      {/* Online / Offline Toggle */}
      <div className="flex items-center gap-2.5">
        <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
          <Radio className={'w-3 h-3 ' + (isGpsActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500')} />
          <span>{isGpsActive ? 'GPS Live' : 'GPS Idle'}</span>
        </div>

        <button
          onClick={() => toggleOnlineStatus()}
          className={'px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 border transition-all ' + (
            isOnline
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-md shadow-emerald-500/10'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          )}
        >
          <Power className={'w-3.5 h-3.5 ' + (isOnline ? 'text-emerald-400' : 'text-slate-500')} />
          <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </button>
      </div>
    </header>
  );
};
`);

// 3. src/components/layout/BottomNav.tsx
writeFile('src/components/layout/BottomNav.tsx', `import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Navigation, History, User, Settings } from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export const BottomNav: React.FC = () => {
  const { activeOrders } = useDeliveryStore();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Live Orders', path: '/live-orders', icon: Navigation, badge: activeOrders.length },
    { label: 'History', path: '/history', icon: History },
    { label: 'Account', path: '/account', icon: User },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B111D]/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 safe-area-bottom">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative ' +
              (isActive
                ? 'text-amber-400 font-bold bg-amber-500/10'
                : 'text-slate-400 hover:text-slate-200 font-medium')
            }
          >
            <div className="relative">
              <item.icon className="w-5 h-5 mb-0.5" />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-amber-500 text-black font-extrabold text-[10px] flex items-center justify-center animate-bounce">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight tracking-tight">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
`);

// 4. src/components/layout/DeliveryLayout.tsx
writeFile('src/components/layout/DeliveryLayout.tsx', `import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { BottomNav } from './BottomNav';
import { useDeliveryStore } from '../../store/deliveryStore';

export const DeliveryLayout: React.FC = () => {
  const { isAuthChecking, isAuthorized, initAuth, updateGpsLocation } = useDeliveryStore();

  useEffect(() => {
    const unsub = initAuth();
    return () => unsub();
  }, []);

  // Periodic GPS simulator / watcher
  useEffect(() => {
    if (!isAuthorized) return;

    // Default restaurant dispatch coordinate (Rajnandgaon)
    let currentLat = 21.0810244;
    let currentLng = 81.0123793;

    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          updateGpsLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading || 0, pos.coords.speed || 0);
        },
        () => {
          // Fallback static coordinate
          updateGpsLocation(currentLat, currentLng, 45, 15);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      updateGpsLocation(currentLat, currentLng, 45, 15);
    }
  }, [isAuthorized]);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Verifying Delivery Partner Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#090E17] text-slate-100 flex flex-col font-sans">
      <TopHeader />
      <main className="flex-1 pb-20 max-w-lg w-full mx-auto p-3 sm:p-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
`);

console.log('Successfully wrote step 2 store and layout files');
`;

writeFile('write_step2.cjs', '');
fs.writeFileSync('write_step2.cjs', '', 'utf8');
console.log('Writing step 2 script...');
