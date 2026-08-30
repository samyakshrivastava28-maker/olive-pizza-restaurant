import { getCurrentAuthToken } from './firebase';

export const PRODUCTION_BACKEND_URL = "https://olivepizza-owner.onrender.com";
export const DEV_BACKEND_URL = "http://localhost:5000";

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
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (import.meta.env.PROD) {
    return `${PRODUCTION_BACKEND_URL}${clean}`;
  }
  return clean;
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

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const primaryUrl = getApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getCurrentAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
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
        const directUrl = `${DEV_BACKEND_URL}${primaryUrl}`;
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
      return { success: false, error: 'Unauthorized. You do not have permission to manage restaurant operations.' };
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        error: json?.error || json?.message || `Server returned error (${res.status})`
      };
    }

    return json || { success: true };
  } catch (err: any) {
    console.warn(`[fetchApi] Offline or unreachable endpoint ${endpoint}:`, err?.message);
    return {
      success: false,
      error: err?.message || 'Network connection failed. Unable to reach restaurant backend.'
    };
  }
}
