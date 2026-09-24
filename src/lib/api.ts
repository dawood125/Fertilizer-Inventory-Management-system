/**
 * Frontend API client for the local Express server (offline).
 */

const DEFAULT_PORT = 3847;

function computeInitialApiBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    // If running in browser on Vite dev server (port 5173), target local Express backend
    if (window.location.port === '5173') {
      return `http://${window.location.hostname}:${DEFAULT_PORT}`;
    }
    // If accessed over VPS or production web port, use current origin
    return window.location.origin;
  }
  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

let apiBase = computeInitialApiBase();
let authToken: string | null = null;

const TOKEN_KEY = 'ims_auth_token';
const USER_KEY = 'ims_auth_user';

export function getStoredToken(): string | null {
  if (authToken) return authToken;
  try {
    authToken = localStorage.getItem(TOKEN_KEY);
  } catch {
    authToken = null;
  }
  return authToken;
}

export function setAuthSession(token: string | null, user?: unknown) {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function getStoredUser<T = any>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function initApiBase() {
  const w = window as any;
  if (w.electronAPI?.getApiPort) {
    try {
      const port = await w.electronAPI.getApiPort();
      apiBase = `http://127.0.0.1:${port}`;
      return apiBase;
    } catch {
      // fall through
    }
  }
  apiBase = computeInitialApiBase();
  return apiBase;
}

export function getApiBase() {
  return apiBase;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
};

export async function apiRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {} } = options;
  const token = getStoredToken();

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      setAuthSession(null);
      window.dispatchEvent(new CustomEvent('ims:unauthorized'));
    }
    const msg = (data && data.error) || res.statusText || 'Request failed';
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string) => apiRequest<T>(path),
  post: <T = any>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T = any>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T = any>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  uploadLogo: async (file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch(`${apiBase}/api/settings/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error || 'Upload failed', res.status);
    return data;
  },
  uploadFile: async (file: File): Promise<{ ok: boolean; url: string; filename: string }> => {
    const token = getStoredToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${apiBase}/api/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error || 'Upload failed', res.status);
    return data;
  },
};

export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${getApiBase()}${url.startsWith('/') ? url : `/${url}`}`;
}

