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

// 1. package.json
writeFile('package.json', `{
  "name": "olive-pizza-delivery",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5177",
    "build": "tsc && vite build",
    "preview": "vite preview --port 5177",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "date-fns": "^4.1.0",
    "firebase": "^11.2.0",
    "lucide-react": "^0.475.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hot-toast": "^2.5.2",
    "react-router-dom": "^7.2.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.6",
    "@types/node": "^22.13.4",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.6",
    "typescript": "^5.7.3",
    "vite": "^6.1.0"
  }
}`);

// 2. vite.config.ts
writeFile('vite.config.ts', `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5177,
    proxy: {
      '/api': {
        target: 'http://localhost:5175',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
`);

// 3. tsconfig.json
writeFile('tsconfig.json', `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}`);

// 4. index.html
writeFile('index.html', `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e59500'><path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/></svg>" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Olive Pizza — Delivery Partner</title>
    <meta name="theme-color" content="#090E17" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  </head>
  <body class="bg-[#090E17] text-slate-100 antialiased selection:bg-amber-500/30 overflow-x-hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

// 5. src/index.css
writeFile('src/index.css', `@import "tailwindcss";

:root {
  color-scheme: dark;
  --bg-primary: #090E17;
  --bg-surface: #0F172A;
  --bg-card: #131E35;
  --border-subtle: #1E293B;
  --color-primary: #F59E0B;
  --color-accent: #10B981;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--bg-primary);
  color: #F8FAFC;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

/* Custom scrollbars */
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
::-webkit-scrollbar-track {
  background: #090E17;
}
::-webkit-scrollbar-thumb {
  background: #1E293B;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: #334155;
}
`);

// 6. src/types/delivery.ts
writeFile('src/types/delivery.ts', `export type OrderStatus =
  | 'pending'
  | 'pending_acceptance'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'partner_assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'failed';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  size?: string;
  crust?: string;
}

export interface DeliveryAddress {
  addressLine?: string;
  address?: string;
  city?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  contactName?: string;
  contactPhone?: string;
}

export interface DeliveryOrder {
  id: string;
  orderNumber?: string | number;
  dailyOrderNumber?: number;
  userId: string;
  customerName?: string;
  contactPhone: string;
  deliveryAddress: DeliveryAddress | string;
  items: OrderItem[];
  totalAmount: number;
  deliveryFee: number;
  paymentMethod?: 'COD' | 'ONLINE' | 'UPI' | string;
  paymentStatus?: 'PAID' | 'PENDING' | string;
  status: OrderStatus;
  orderSource?: string;
  fulfillment?: string;
  branchId?: string;
  branchName?: string;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  createdAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  deliveryDistanceKm?: number;
  deliveryDurationMin?: number;
  location?: { lat: number; lng: number };
  proofOfDelivery?: {
    proofImageUrl?: string | null;
    signatureUrl?: string | null;
    notes?: string;
    completedAt?: string;
  };
}

export interface RiderShiftStats {
  assigned: number;
  completed: number;
  active: number;
  cancelled: number;
  totalDistanceKm: number;
  averageDeliveryTimeMin: number;
  earnings: number;
  date: string;
}

export interface MonthlyDeliverySummary {
  id: string;
  riderId: string;
  monthKey: string; // e.g. "2026-08"
  year: number;
  month: number;
  monthName: string;
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  declinedDeliveries: number;
  totalDistanceKm: number;
  averageDeliveryTimeMin: number;
  totalEarnings: number;
  onTimeRatePercent: number;
  organizationId?: string;
  franchiseId?: string;
  branchId?: string;
  generatedAt: string;
  isPurgeEligible?: boolean;
}

export interface RiderProfile {
  uid: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  vehicleType?: string;
  vehicleNumber?: string;
  organizationId?: string;
  franchiseId?: string;
  branchId: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  isOnline: boolean;
  workingSchedule: Array<{ day: string; hours: string; isOff: boolean }>;
  joiningDate?: string;
  emergencyContact?: { name: string; phone: string };
  rating?: number;
  totalDeliveriesLifetime?: number;
}
`);

// 7. src/lib/firebase.ts
writeFile('src/lib/firebase.ts', `import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForBuild1234567890abcdef",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "olivepizza-prod.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "olivepizza-prod",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "olivepizza-prod.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function getCurrentAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
`);

// 8. src/lib/api.ts
writeFile('src/lib/api.ts', `import { getCurrentAuthToken } from './firebase';

export const PRODUCTION_BACKEND_URL = "https://olivepizza-owner.onrender.com";
export const DEV_BACKEND_URL = "http://localhost:5175";

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (import.meta.env.PROD) {
    return PRODUCTION_BACKEND_URL;
  }
  return DEV_BACKEND_URL;
}

export function getApiUrl(endpoint: string = ''): string {
  const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  if (import.meta.env.PROD) {
    return PRODUCTION_BACKEND_URL + clean;
  }
  return clean;
}

export const API_BASE_URL = getApiBaseUrl();

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  rider?: any;
  today?: any;
  reports?: any[];
  orders?: any[];
  currentMonth?: string;
  message?: string;
  error?: string;
  status?: string;
  [key: string]: any;
}

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const primaryUrl = getApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getCurrentAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    let res = await fetch(primaryUrl, config);

    // If proxy failed on local dev, fallback directly to backend URL
    if (!res.ok && primaryUrl.startsWith('/')) {
      try {
        const directUrl = DEV_BACKEND_URL + primaryUrl;
        const fallbackRes = await fetch(directUrl, config);
        if (fallbackRes.ok) {
          res = fallbackRes;
        }
      } catch {}
    }

    if (res.status === 401) {
      return { success: false, error: 'Authentication expired or invalid. Please sign in again.' };
    }

    if (res.status === 403) {
      return { success: false, error: 'Unauthorized. You do not have delivery partner permissions.' };
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        error: json?.error || json?.message || ('Server returned error (' + res.status + ')')
      };
    }

    return json || { success: true };
  } catch (err: any) {
    console.warn('[fetchApi] Backend notice for ' + endpoint + ':', err?.message);
    return {
      success: false,
      error: err?.message || 'Network connection unavailable.'
    };
  }
}
`);

console.log('Finished writing base files');
`;

writeFile('build_delivery_app.cjs', '');
fs.writeFileSync('build_delivery_app.cjs', '', 'utf8');
console.log('Writing build script...');
