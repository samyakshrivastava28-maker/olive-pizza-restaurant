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
}

// In-flight GET requests map for deduplication
const inFlightRequests = new Map<string, Promise<any>>();

// In-memory cache with TTL
const memoryCache = new Map<string, { data: any; expiresAt: number }>();

export function invalidateRestaurantCache(pattern?: string | RegExp): void {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      memoryCache.delete(key);
    }
  }
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

  // 1. In-memory TTL cache
  if (isGet && !forceRefresh && ttlMs > 0) {
    const cached = memoryCache.get(cleanKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  // 2. Request deduplication for simultaneous calls
  if (isGet && !forceRefresh && inFlightRequests.has(cleanKey)) {
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
        memoryCache.set(cleanKey, {
          data: result,
          expiresAt: Date.now() + ttlMs,
        });
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

  return executionPromise;
}

// ─── RESTAURANT SMART BOOTSTRAP AGGREGATOR HELPER ─────────────────────────────

export interface RestaurantLiveBootstrapResponse {
  success: boolean;
  activeOrders: any[];
  storeOpen: boolean;
  soundConfig: any;
  alerts: any[];
}

export async function fetchRestaurantLiveBootstrap(
  branchId?: string,
  forceRefresh = false
): Promise<ApiResponse<RestaurantLiveBootstrapResponse>> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return fetchApi<RestaurantLiveBootstrapResponse>(
    `/api/v1/restaurant/live/bootstrap${query}`,
    { method: 'GET' },
    { ttlMs: 15000, forceRefresh }
  );
}

