import { Capacitor } from '@capacitor/core';
import { getCurrentAuthToken } from './firebase';

export const PRODUCTION_BACKEND_URL = "https://olivepizza-owner.onrender.com";
export const DEV_BACKEND_URL = "http://localhost:5000";

export function getApiBaseUrl(): string {
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.protocol !== 'file:' &&
    window.location.protocol !== 'capacitor:' &&
    window.location.protocol !== 'ionic:' &&
    !navigator.userAgent.includes('Electron')
  ) {
    return "";
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }
  if (
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && (
      window.location.protocol === 'file:' ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      navigator.userAgent.includes('Electron')
    ))
  ) {
    return PRODUCTION_BACKEND_URL;
  }
  return PRODUCTION_BACKEND_URL;
}

export function getApiUrl(endpoint: string = ''): string {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const baseUrl = getApiBaseUrl();
  if (baseUrl) {
    return baseUrl.replace(/\/+$/, '') + clean;
  }
  return clean;
}

export function getWebSocketUrl(): string {
  const base = getApiBaseUrl() || PRODUCTION_BACKEND_URL;
  if (base.startsWith('https://')) {
    return base.replace('https://', 'wss://') + '/ws';
  }
  if (base.startsWith('http://')) {
    return base.replace('http://', 'ws://') + '/ws';
  }
  if (typeof window !== 'undefined' && window.location.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return PRODUCTION_BACKEND_URL.replace('https://', 'wss://') + '/ws';
}

export const API_BASE_URL = getApiBaseUrl();

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  manager?: any;
  managers?: any[];
  notifications?: any[];
  logs?: any[];
  status?: string;
  orderId?: string;
  message?: string;
  error?: string;
  [key: string]: any;
}

export interface CacheOptions {
  ttlMs?: number;
  forceRefresh?: boolean;
  persist?: boolean;
  swr?: boolean;
  onFreshData?: (data: any) => void;
}

// Canonical TTLs in milliseconds matching Backend Redis Layerbase cache
export const CLIENT_CACHE_TTL = {
  RESTAURANT_STATUS: 60 * 1000,    // 60s (1 min)
  LIVE_BOOTSTRAP: 15 * 1000,       // 15s
  INVENTORY: 120 * 1000,           // 120s (2 min)
  BRANCH_MENU: 300 * 1000,         // 300s (5 min)
  MASTER_CATALOG: 300 * 1000,      // 300s (5 min)
  APP_CONFIG: 600 * 1000,          // 600s (10 min)
};

const STORAGE_PREFIX = 'op_rest_mgr_cache_';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  timestamp: number;
}

// In-flight GET requests map for deduplication
const inFlightRequests = new Map<string, Promise<any>>();

// In-memory cache with TTL
const memoryCache = new Map<string, CacheEntry<any>>();

function getCachedEntry<T>(key: string): CacheEntry<T> | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch {}
  }
  return null;
}

function setCachedEntry<T>(key: string, data: T, ttlMs: number, persist: boolean = true): void {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    data,
    timestamp: now,
    expiresAt: now + ttlMs,
  };
  memoryCache.set(key, entry);

  if (persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {}
  }
}

export function invalidateRestaurantCache(pattern?: string | RegExp): void {
  if (!pattern) {
    memoryCache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
    return;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          const bare = k.replace(STORAGE_PREFIX, '');
          if (regex.test(bare)) keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }
}

export function invalidateMenuCache(branchId?: string): void {
  if (branchId) {
    invalidateRestaurantCache(new RegExp(`menu.*${branchId}`));
  } else {
    invalidateRestaurantCache(/menu/);
  }
}

export function invalidateStatusCache(): void {
  invalidateRestaurantCache(/(status|settings|live\/bootstrap)/);
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {},
  cacheOptions?: CacheOptions
): Promise<ApiResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const cleanKey = `GET:${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const ttlMs = cacheOptions?.ttlMs ?? 0;
  const forceRefresh = cacheOptions?.forceRefresh ?? false;
  const persist = cacheOptions?.persist ?? true;
  const enableSwr = cacheOptions?.swr ?? true;

  // 1. Check multi-tier cache
  const cachedEntry = isGet && ttlMs > 0 ? getCachedEntry<ApiResponse<T>>(cleanKey) : null;
  const isFresh = cachedEntry ? Date.now() < cachedEntry.expiresAt : false;

  // 1a. Fresh cache hit -> immediate return
  if (isGet && !forceRefresh && cachedEntry && isFresh) {
    return cachedEntry.data;
  }

  // 2. Request deduplication for simultaneous calls
  if (isGet && !forceRefresh && inFlightRequests.has(cleanKey)) {
    if (cachedEntry && enableSwr) {
      return cachedEntry.data;
    }
    return inFlightRequests.get(cleanKey);
  }

  const executionPromise = (async () => {
    try {
      const primaryUrl = getApiUrl(endpoint);
      const headers = new Headers(options.headers || {});

      if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }

      if (!headers.has('X-App-Target')) {
        headers.set('X-App-Target', 'RESTAURANT_MANAGER');
      }
      if (!headers.has('X-App-Source')) {
        headers.set('X-App-Source', 'RESTAURANT_MANAGER');
      }

      const managerDeviceId = localStorage.getItem('restaurant_device_id') || 'dev_rest_manager_01';
      if (!headers.has('X-Device-Id')) {
        headers.set('X-Device-Id', managerDeviceId);
      }

      const token = await getCurrentAuthToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const config: RequestInit = {
        ...options,
        headers,
      };

      let res = await fetch(primaryUrl, config);

      // If proxy failed on local dev, fallback directly to backend URL
      if (!res.ok && primaryUrl.startsWith('/')) {
        try {
          const directUrl = `${DEV_BACKEND_URL}${primaryUrl}`;
          const fallbackRes = await fetch(directUrl, config);
          if (fallbackRes.ok) {
            res = fallbackRes;
          }
        } catch {}
      }

      const json = await res.json().catch(() => null);

      if (res.status === 401) {
        return { success: false, error: json?.error || 'Authentication expired or invalid. Please sign in again.' };
      }

      if (!res.ok) {
        return {
          success: false,
          status: res.status,
          code: json?.code,
          reason: json?.reason,
          error: json?.error || json?.message || json?.reason || (res.status === 403 ? 'Unauthorized: You do not have permission for this restaurant action.' : `Server returned error (${res.status})`),
          ...(json || {})
        };
      }

      const result = json || { success: true };

      if (isGet && ttlMs > 0) {
        setCachedEntry(cleanKey, result, ttlMs, persist);
        if (cacheOptions?.onFreshData) {
          try {
            cacheOptions.onFreshData(result);
          } catch (e) {
            console.warn(`[fetchApi] onFreshData handler error for ${cleanKey}:`, e);
          }
        }
      }

      return result;
    } catch (err: any) {
      console.warn(`[fetchApi] Offline or unreachable endpoint ${endpoint}:`, err?.message);
      return {
        success: false,
        error: err?.message || 'Network connection failed. Unable to reach restaurant backend.'
      };
    } finally {
      inFlightRequests.delete(cleanKey);
    }
  })();

  if (isGet) {
    inFlightRequests.set(cleanKey, executionPromise);
  }

  // 3. Stale-While-Revalidate: Return stale cached data immediately (0ms) while background fetch updates
  if (isGet && !forceRefresh && cachedEntry && enableSwr) {
    return cachedEntry.data;
  }

  return executionPromise;
}

// ─── RESTAURANT SMART BOOTSTRAP & MENU AGGREGATOR HELPERS ─────────────────────

export interface RestaurantLiveBootstrapResponse {
  success: boolean;
  activeOrders: any[];
  storeOpen: boolean;
  soundConfig: any;
  alerts: any[];
}

export async function fetchRestaurantLiveBootstrap(
  branchId?: string,
  forceRefresh = false,
  onFreshData?: (data: ApiResponse<RestaurantLiveBootstrapResponse>) => void
): Promise<ApiResponse<RestaurantLiveBootstrapResponse>> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return fetchApi<RestaurantLiveBootstrapResponse>(
    `/api/v1/restaurant/live/bootstrap${query}`,
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.LIVE_BOOTSTRAP, // 15s
      forceRefresh,
      swr: true,
      onFreshData,
    }
  );
}

export async function fetchBranchMenuManagement(
  branchId: string,
  forceRefresh = false,
  onFreshData?: (data: any) => void
): Promise<ApiResponse<any>> {
  return fetchApi(
    `/api/menu/branch/${encodeURIComponent(branchId)}/management`,
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.BRANCH_MENU, // 300s (5 min) matching Redis Layerbase
      forceRefresh,
      swr: true,
      onFreshData,
    }
  );
}

export async function fetchRestaurantStatus(forceRefresh = false): Promise<ApiResponse<any>> {
  return fetchApi(
    '/api/restaurant/status',
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.RESTAURANT_STATUS, // 60s (1 min) matching Redis Layerbase
      forceRefresh,
      swr: true,
    }
  );
}

export async function fetchAppConfig(appName: string, forceRefresh = false): Promise<ApiResponse<any>> {
  return fetchApi(
    `/api/config/${encodeURIComponent(appName)}`,
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.APP_CONFIG, // 600s (10 min) matching Redis Layerbase
      forceRefresh,
      swr: true,
    }
  );
}


