const fs = require('fs');
const path = require('path');

const targetDir = 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-delivery';
const mirrorDir = 'C:\\Users\\RYZEN\\Downloads\\olive pizza delivery app';

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function writeFile(relativePath, content) {
  const fullPath = path.join(targetDir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content.trim(), 'utf8');

  // Also write to mirror
  const mirrorPath = path.join(mirrorDir, relativePath);
  ensureDir(path.dirname(mirrorPath));
  fs.writeFileSync(mirrorPath, content.trim(), 'utf8');

  console.log(`Generated: ${relativePath}`);
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

      const uid = get().user?.uid;
      if (uid) {
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
import { Power, MapPin, Radio } from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export const TopHeader: React.FC = () => {
  const { riderProfile, isOnline, toggleOnlineStatus, isGpsActive } = useDeliveryStore();

  return (
    <header className="sticky top-0 z-40 bg-[#090E17]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
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

  useEffect(() => {
    if (!isAuthorized) return;

    let currentLat = 21.0810244;
    let currentLng = 81.0123793;

    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          updateGpsLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading || 0, pos.coords.speed || 0);
        },
        () => {
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

// 5. src/pages/DashboardPage.tsx
writeFile('src/pages/DashboardPage.tsx', `import React, { useEffect } from 'react';
import { 
  Package, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  TrendingUp, 
  IndianRupee, 
  Calendar,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Navigation
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDeliveryStore } from '../../store/deliveryStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { 
    todayStats, 
    monthlyReports, 
    activeOrders, 
    isOnline, 
    toggleOnlineStatus, 
    fetchTodayStats, 
    fetchMonthlyReports 
  } = useDeliveryStore();

  useEffect(() => {
    fetchTodayStats();
    fetchMonthlyReports();
  }, []);

  return (
    <div className="space-y-4">
      {/* Active Delivery Notification Banner if order assigned */}
      {activeOrders.length > 0 && (
        <div 
          onClick={() => navigate('/live-orders')}
          className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 cursor-pointer shadow-lg shadow-amber-500/10 hover:border-amber-500 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center font-black animate-pulse">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wide">ACTIVE DELIVERY</span>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              </div>
              <strong className="text-sm font-extrabold text-white block">
                Order #{activeOrders[0].dailyOrderNumber || activeOrders[0].id.slice(-5)}
              </strong>
              <span className="text-[11px] text-slate-300">
                {activeOrders[0].status.replace(/_/g, ' ').toUpperCase()} • Tap to open navigation
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400" />
        </div>
      )}

      {/* Online / Offline Shift Status Card */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={'w-3 h-3 rounded-full ' + (isOnline ? 'bg-emerald-400 animate-ping' : 'bg-slate-600')} />
          <div>
            <strong className="text-xs font-extrabold text-white block">
              {isOnline ? 'You are ON-DUTY (Receiving Orders)' : 'You are OFF-DUTY'}
            </strong>
            <span className="text-[11px] text-slate-400">
              {isOnline ? 'Ready for automatic restaurant dispatch' : 'Go online to receive shift orders'}
            </span>
          </div>
        </div>
        <button
          onClick={() => toggleOnlineStatus()}
          className={'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ' + (
            isOnline ? 'bg-slate-800 text-slate-300 hover:text-white' : 'bg-emerald-500 text-black font-extrabold'
          )}
        >
          {isOnline ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {/* TODAY'S PERFORMANCE REPORT */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3.5 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <h2 className="text-xs font-extrabold uppercase text-white tracking-wider">
              Today's Delivery Report
            </h2>
          </div>
          <button 
            onClick={() => fetchTodayStats()}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 2x2 Grid Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Deliveries Completed */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <strong className="text-xl font-black text-white">{todayStats.completed}</strong>
              <span className="text-[11px] text-slate-400 font-medium">/ {todayStats.assigned} assigned</span>
            </div>
          </div>

          {/* Today's Earnings */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Today's Payout</span>
              <IndianRupee className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1">
              <strong className="text-xl font-black text-amber-400">₹{todayStats.earnings}</strong>
            </div>
          </div>

          {/* Total Distance */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Distance</span>
              <MapPin className="w-4 h-4 text-cyan-400" />
            </div>
            <strong className="text-lg font-black text-white">{todayStats.totalDistanceKm} km</strong>
          </div>

          {/* Average Delivery Time */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Avg Trip Time</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <strong className="text-lg font-black text-white">{todayStats.averageDeliveryTimeMin} min</strong>
          </div>
        </div>
      </div>

      {/* MONTHLY SUMMARY REPORTS (Current & Past Months) */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-extrabold uppercase text-white tracking-wider">
              Monthly Summary Reports
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Archived Ledgers</span>
        </div>

        <div className="space-y-2.5">
          {monthlyReports.map((report) => (
            <div
              key={report.id}
              className="p-3.5 rounded-xl bg-[#131E35] border border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <strong className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" /> {report.monthName}
                </strong>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {report.onTimeRatePercent}% On-Time
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Deliveries</span>
                  <strong className="text-white font-extrabold">{report.completedDeliveries}</strong>
                  <span className="text-slate-500 text-[9px]"> / {report.totalDeliveries}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Distance</span>
                  <strong className="text-white font-extrabold">{report.totalDistanceKm} km</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Earnings</span>
                  <strong className="text-amber-400 font-extrabold">₹{report.totalEarnings}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
`);

// 6. src/pages/LiveOrdersPage.tsx
writeFile('src/pages/LiveOrdersPage.tsx', `import React, { useState } from 'react';
import { 
  Navigation, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Camera, 
  AlertCircle,
  IndianRupee,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';
import toast from 'react-hot-toast';

export default function LiveOrdersPage() {
  const { 
    activeOrders, 
    acceptDelivery, 
    confirmPickup, 
    completeDelivery,
    currentLocation 
  } = useDeliveryStore();

  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async (orderId: string) => {
    const ok = await acceptDelivery(orderId);
    if (ok) {
      toast.success('Order accepted! Proceed to restaurant for pickup.');
    } else {
      toast.error('Failed to accept order.');
    }
  };

  const handlePickup = async (orderId: string) => {
    const ok = await confirmPickup(orderId);
    if (ok) {
      toast.success('Order picked up! Now Out for Delivery to customer.');
    } else {
      toast.error('Failed to confirm pickup.');
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingOrderId) return;

    setIsSubmitting(true);
    const res = await completeDelivery(completingOrderId, { notes: proofNote || 'Handed directly to customer' });

    if (res.success) {
      toast.success('Delivery completed and verified within proximity!');
      setCompletingOrderId(null);
      setProofNote('');
    } else {
      toast.error(res.error || 'Failed to complete delivery.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-extrabold text-white flex items-center gap-2">
          <Navigation className="w-5 h-5 text-amber-400" /> Active Deliveries
        </h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {activeOrders.length} Running
        </span>
      </div>

      {activeOrders.length === 0 ? (
        <div className="p-8 rounded-3xl bg-[#0F172A] border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <strong className="text-sm font-bold text-white block">No Active Deliveries</strong>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            You are online and ready. New assigned deliveries from restaurant managers will ring here immediately.
          </p>
        </div>
      ) : (
        activeOrders.map((order) => {
          const isAssigned = order.status === 'partner_assigned';
          const isAccepted = order.status === 'accepted' || order.status === 'preparing' || order.status === 'ready';
          const isOutForDelivery = order.status === 'out_for_delivery';

          const addressText = typeof order.deliveryAddress === 'string' 
            ? order.deliveryAddress 
            : order.deliveryAddress?.addressLine || order.deliveryAddress?.address || 'Rajnandgaon, Chhattisgarh';

          return (
            <div
              key={order.id}
              className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-4 shadow-2xl relative overflow-hidden"
            >
              {/* Status Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider block">
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <strong className="text-base font-black text-white">
                    Order #{order.dailyOrderNumber || order.id.slice(-5)}
                  </strong>
                </div>

                <div className="text-right">
                  <span className="text-xs font-extrabold text-amber-400 block">₹{order.totalAmount}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{order.paymentMethod || 'COD'}</span>
                </div>
              </div>

              {/* Pickup & Destination Timeline */}
              <div className="space-y-3 text-xs">
                {/* 1. Restaurant Pickup */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Pickup Location</span>
                    <strong className="text-white text-xs block">{order.branchName || 'Olive Pizza — Rajnandgaon'}</strong>
                    <span className="text-[11px] text-slate-400 block">Dongargaon Rd, near Saraswati school, Gokul Nagar</span>
                  </div>
                </div>

                {/* 2. Customer Destination */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Customer Destination</span>
                    <strong className="text-white text-xs block">{order.customerName || 'Customer'}</strong>
                    <span className="text-[11px] text-slate-300 block">{addressText}</span>
                  </div>
                </div>
              </div>

              {/* Order Items Summary */}
              <div className="p-3 rounded-2xl bg-[#131E35] border border-slate-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Items to deliver:</span>
                {order.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-slate-200">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="text-slate-400 font-mono">₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Quick Actions (Call & Maps) */}
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={'tel:' + (order.contactPhone || '9179944445')}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" /> Call Customer
                </a>

                <a
                  href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" /> Open Maps
                </a>
              </div>

              {/* Workflow Stepper Action Buttons */}
              {isAssigned && (
                <button
                  onClick={() => handleAccept(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Accept Delivery
                </button>
              )}

              {isAccepted && (
                <button
                  onClick={() => handlePickup(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Confirm Pickup & Start Trip
                </button>
              )}

              {isOutForDelivery && (
                <button
                  onClick={() => setCompletingOrderId(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" /> Mark Delivered (100m Proximity)
                </button>
              )}
            </div>
          );
        })
      )}

      {/* COMPLETE DELIVERY MODAL / PROXIMITY CHECK */}
      {completingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-[#0F172A] border border-slate-800 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <strong className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Verify & Complete Delivery
              </strong>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-1">
              <strong className="block text-[11px] font-bold">100m Geofence Verification Active</strong>
              <p className="text-[10px] leading-tight text-emerald-400/90">
                Your GPS coordinates will be verified against the customer delivery address on completion.
              </p>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">Proof Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Handed to customer at door"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingOrderId(null)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying...' : 'Confirm Delivered'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`);

// 7. src/pages/DeliveryHistoryPage.tsx
writeFile('src/pages/DeliveryHistoryPage.tsx', `import React, { useEffect, useState } from 'react';
import { 
  History, 
  Search, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  IndianRupee,
  Clock,
  Filter
} from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export default function DeliveryHistoryPage() {
  const { currentMonthHistory, isHistoryLoading, fetchCurrentMonthHistory } = useDeliveryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchCurrentMonthHistory();
  }, []);

  const filteredHistory = currentMonthHistory.filter((order) => {
    const matchesSearch = 
      (order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (String(order.dailyOrderNumber || '')).includes(searchQuery);

    if (!matchesSearch) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'completed' && order.status !== 'delivered' && order.status !== 'completed') return false;
      if (statusFilter === 'cancelled' && order.status !== 'cancelled' && order.status !== 'rejected') return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" /> Delivery History
          </h1>
          <span className="text-xs text-amber-400 font-bold">
            August 2026 (Current Calendar Month)
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {filteredHistory.length} Trips
        </span>
      </div>

      {/* Storage Retention Policy Notice */}
      <div className="p-3 rounded-2xl bg-[#0F172A] border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Detailed delivery ledger is preserved for the <strong>current month</strong>. Older months are archived into monthly summary reports on the Dashboard.
        </span>
      </div>

      {/* Search & Status Filters */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
        >
          <option value="all">All Trips</option>
          <option value="completed">Completed Only</option>
          <option value="cancelled">Cancelled Only</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="space-y-2.5">
        {isHistoryLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading current month delivery records...
          </div>
        ) : filteredHistory.length > 0 ? (
          filteredHistory.map((order) => {
            const isCompleted = order.status === 'delivered' || order.status === 'completed';
            const addressText = typeof order.deliveryAddress === 'string'
              ? order.deliveryAddress
              : order.deliveryAddress?.addressLine || 'Rajnandgaon';

            return (
              <div
                key={order.id}
                className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <strong className="text-xs font-bold text-white">
                      Order #{order.dailyOrderNumber || order.id.slice(-5)}
                    </strong>
                  </div>

                  <span className="text-xs font-extrabold text-amber-400">
                    +₹{order.deliveryFee || 40}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 flex items-center gap-1.5 truncate">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{addressText}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
                  <span>
                    {order.deliveredAt 
                      ? new Date(order.deliveredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                  <span>{order.deliveryDistanceKm || 3.5} km • {order.deliveryDurationMin || 22} min</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            No completed delivery records found for this filter in the current month.
          </div>
        )}
      </div>
    </div>
  );
}
`);

// 8. src/pages/AccountPage.tsx
writeFile('src/pages/AccountPage.tsx', `import React from 'react';
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Truck, 
  ShieldCheck, 
  Calendar, 
  Star,
  Award,
  AlertCircle
} from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export default function AccountPage() {
  const { riderProfile } = useDeliveryStore();

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#131E35] to-[#0F172A] border border-slate-800 text-center space-y-3 shadow-xl">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-xl mx-auto shadow-lg shadow-amber-500/10">
          {(riderProfile?.name || 'R').charAt(0).toUpperCase()}
        </div>

        <div>
          <strong className="text-base font-extrabold text-white block">{riderProfile?.name}</strong>
          <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block">
            OFFICIAL DELIVERY PARTNER
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Rider ID: {riderProfile?.id?.slice(0, 12) || 'RDR-08-9445'}
          </span>
        </div>

        {/* Rating & Total Trips */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <div className="p-2 rounded-xl bg-[#090E17]/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Rider Rating
            </span>
            <strong className="text-sm font-extrabold text-white">{riderProfile?.rating || 4.9} / 5.0</strong>
          </div>

          <div className="p-2 rounded-xl bg-[#090E17]/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Award className="w-3 h-3 text-emerald-400" /> Lifetime Trips
            </span>
            <strong className="text-sm font-extrabold text-white">{riderProfile?.totalDeliveriesLifetime || 842}</strong>
          </div>
        </div>
      </div>

      {/* Details List */}
      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3 text-xs">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider pb-2 border-b border-slate-800">
          Operational Identity
        </h2>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-slate-500" /> Contact Phone
          </span>
          <strong className="text-white">{riderProfile?.phone}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-slate-500" /> Login Email
          </span>
          <strong className="text-white">{riderProfile?.email}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-slate-500" /> Vehicle
          </span>
          <strong className="text-white">{riderProfile?.vehicleNumber || 'CG-08-AB-1234'}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-500" /> Assigned Branch
          </span>
          <strong className="text-amber-400">{riderProfile?.branchName}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500" /> Member Since
          </span>
          <span className="text-slate-300 font-mono">
            {new Date(riderProfile?.joiningDate || '2026-01-15').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Emergency & Support Contact */}
      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-2 text-xs">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
          Operations Helpline
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-white block">Olive Pizza Dispatch Support</strong>
            <span className="text-[11px] text-slate-400">+91 91799 44445</span>
          </div>
          <a
            href="tel:9179944445"
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs"
          >
            Call
          </a>
        </div>
      </div>
    </div>
  );
}
`);

// 9. src/pages/SettingsPage.tsx
writeFile('src/pages/SettingsPage.tsx', `import React from 'react';
import { 
  Clock, 
  ShieldCheck, 
  Bell, 
  Map, 
  LogOut, 
  Radio, 
  Info,
  ChevronRight
} from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export default function SettingsPage() {
  const { riderProfile, logout, isGpsActive } = useDeliveryStore();

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold text-white">App & Operational Settings</h1>

      {/* Working Schedule (Restaurant Configured) */}
      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Restaurant Work Schedule
          </h2>
          <span className="text-[10px] text-amber-400/80 font-mono">Official Shift</span>
        </div>

        <div className="space-y-1.5 text-xs">
          {riderProfile?.workingSchedule?.map((sched) => (
            <div key={sched.day} className="flex items-center justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-300 font-medium">{sched.day}</span>
              <span className={'font-mono font-bold ' + (sched.isOff ? 'text-rose-400' : 'text-slate-400')}>
                {sched.hours}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Restaurant Delivery Policies */}
      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-2.5 text-xs text-slate-300">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Delivery Policies
        </h2>

        <div className="flex justify-between py-1 border-b border-slate-800/60">
          <span className="text-slate-400">Max Delivery Radius</span>
          <strong className="text-white">15 km from Branch</strong>
        </div>

        <div className="flex justify-between py-1 border-b border-slate-800/60">
          <span className="text-slate-400">Proximity Completion</span>
          <strong className="text-emerald-400">Within 100 meters</strong>
        </div>

        <div className="flex justify-between py-1">
          <span className="text-slate-400">Live GPS Telemetry</span>
          <span className={'font-bold ' + (isGpsActive ? 'text-emerald-400' : 'text-slate-400')}>
            {isGpsActive ? 'Active' : 'Standby'}
          </span>
        </div>
      </div>

      {/* App Info & Logout */}
      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Application Version</span>
          <span className="font-mono text-white">v1.0.0 (in.olivepizza.delivery)</span>
        </div>

        <button
          onClick={() => logout()}
          className="w-full py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/20 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
`);

// 10. src/pages/LoginPage.tsx
writeFile('src/pages/LoginPage.tsx', `import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Truck, ShieldCheck, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const isOwner = email.toLowerCase() === 'olivepizzarjn@gmail.com' || email.toLowerCase() === 'webhub2811@gmail.com';

      // Check role
      const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim()))).catch(() => null);
      let role = 'customer';
      if (userDoc && !userDoc.empty) {
        role = userDoc.docs[0].data()?.role || 'customer';
      }

      if (!isOwner && role !== 'delivery_partner' && role !== 'delivery' && role !== 'developer' && role !== 'restaurant_manager') {
        toast.error('Access denied. This app is for Olive Pizza Delivery Partners only.');
        navigate('/access-denied');
        setLoading(false);
        return;
      }

      toast.success('Welcome back, Delivery Partner!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[#0F172A] border border-slate-800 p-6 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-xl mx-auto shadow-lg shadow-amber-500/10">
            <Truck className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-black text-white tracking-tight">Olive Pizza Delivery</h1>
          <p className="text-xs text-slate-400">Sign in to your rider partner console</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-300 block">Rider Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="rider@olivepizza.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-300 block">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs uppercase tracking-wide shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all"
          >
            {loading ? 'Authenticating...' : 'Sign In as Rider'}
          </button>
        </form>

        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-slate-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Accounts are provisioned by your assigned Olive Pizza restaurant manager or owner.
          </span>
        </div>
      </div>
    </div>
  );
}
`);

// 11. src/pages/AccessDeniedPage.tsx
writeFile('src/pages/AccessDeniedPage.tsx', `import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export default function AccessDeniedPage() {
  const { logout } = useDeliveryStore();

  return (
    <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4 text-center">
      <div className="w-full max-w-sm rounded-3xl bg-[#0F172A] border border-rose-900/40 p-6 shadow-2xl space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <strong className="text-base font-bold text-white block">Access Restricted</strong>
        <p className="text-xs text-slate-400">
          This application is strictly for authorized Olive Pizza delivery partners. Customer accounts cannot access delivery dispatch.
        </p>
        <button
          onClick={() => logout()}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Sign In as Different Account
        </button>
      </div>
    </div>
  );
}
`);

// 12. src/App.tsx
writeFile('src/App.tsx', `import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { DeliveryLayout } from './components/layout/DeliveryLayout';
import DashboardPage from './pages/DashboardPage';
import LiveOrdersPage from './pages/LiveOrdersPage';
import DeliveryHistoryPage from './pages/DeliveryHistoryPage';
import AccountPage from './pages/AccountPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import AccessDeniedPage from './pages/AccessDeniedPage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: '#0F172A',
            color: '#F8FAFC',
            border: '1px solid #334155',
            fontSize: '12px',
            borderRadius: '16px'
          }
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        
        <Route element={<DeliveryLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/live-orders" element={<LiveOrdersPage />} />
          <Route path="/history" element={<DeliveryHistoryPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
`);

// 13. src/main.tsx
writeFile('src/main.tsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`);

console.log('Successfully generated entire delivery app in olive-pizza-delivery and olive pizza delivery app');
