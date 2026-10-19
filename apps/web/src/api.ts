import type { DashboardResponse, HistoryResponse, WaiversResponse } from '@ffd/shared';
import { useQuery } from '@tanstack/react-query';

/** A 401 from the API: the session is missing or expired. The app answers it with the sign-in screen. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Sign in required');
  }
}

/** Calls the API; every request in the app goes through here, so 401s are handled in one place. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `API returned HTTP ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface Me {
  authEnabled: boolean;
  user: { login: string; name: string | null; avatarUrl: string | null } | null;
}

/** Who is signed in. Fetched once; a 401 anywhere else resets it (see main.tsx). */
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/auth/me'), staleTime: Infinity });

// A custom hook: any component can call useDashboard() to get the data,
// loading state and error, and it refreshes every 60 seconds on its own.
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardResponse>('/api/dashboard'),
    refetchInterval: 60_000,
  });
}

// Weekly results for every league; snapshots only change when the dashboard
// loads, so a slower refresh than the live dashboard is plenty.
export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: () => api<HistoryResponse>('/api/history'),
    refetchInterval: 60_000,
  });
}

// Free agents and suggested moves. Waivers change slowly, so every 5 minutes is plenty.
export function useWaivers() {
  return useQuery({
    queryKey: ['waivers'],
    queryFn: () => api<WaiversResponse>('/api/waivers'),
    refetchInterval: 5 * 60_000,
  });
}

export async function signOut() {
  await api<void>('/api/auth/logout', { method: 'POST' });
  window.location.assign('/'); // a fresh page load, so nothing from the session stays in memory
}
