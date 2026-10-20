import type { ByeWeeksResponse, DashboardResponse, DefenseResponse, HistoryResponse, OutlookResponse, TradesResponse, RecapResponse, RecapSeasonResponse, LiveFeedResponse, WaiversResponse } from '@ffd/shared';
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

// Free agents, suggested moves and your ESPN claims. Every 30 seconds, so a claim
// you just made on ESPN shows up within a minute (the API asks ESPN at most every 30 seconds).
export function useWaivers() {
  return useQuery({
    queryKey: ['waivers'],
    queryFn: () => api<WaiversResponse>('/api/waivers'),
    refetchInterval: 30_000,
  });
}

// Who's on bye in each week left; the schedule hardly ever changes.
export function useByeWeeks() {
  return useQuery({
    queryKey: ['byes'],
    queryFn: () => api<ByeWeeksResponse>('/api/byes'),
    staleTime: 60 * 60_000,
  });
}

// One finished week's lineup recap for every league; null asks for the latest.
export const useRecap = (week: number | null) =>
  useQuery({ queryKey: ['recap', week], queryFn: () => api<RecapResponse>(`/api/recap${week ? `?week=${week}` : ''}`) });

// The season so far, per league: losses a better lineup would have won.
export const useRecapSeason = () =>
  useQuery({ queryKey: ['recap', 'season'], queryFn: () => api<RecapSeasonResponse>('/api/recap/season'), staleTime: 10 * 60_000 });

// Playoff odds and next-opponent previews; they move only when games finish.
export const useOutlook = () =>
  useQuery({ queryKey: ['outlook'], queryFn: () => api<OutlookResponse>('/api/outlook'), staleTime: 10 * 60_000 });

// One league's trades, scored; they change only when a week finishes or a trade goes through.
export const useTrades = (leagueKey: string) =>
  useQuery({
    queryKey: ['trades', leagueKey],
    queryFn: () => api<TradesResponse>(`/api/trades?league=${encodeURIComponent(leagueKey)}`),
    staleTime: 10 * 60_000,
  });

// Points each NFL defense allows by position; it moves only when games finish.
export const useDefense = () =>
  useQuery({ queryKey: ['defense'], queryFn: () => api<DefenseResponse>('/api/defense'), staleTime: 60 * 60_000 });

// The live scoring feed; checked often since it changes play by play.
export function useLive() {
  return useQuery({
    queryKey: ['live'],
    queryFn: () => api<LiveFeedResponse>('/api/live'),
    refetchInterval: 15_000,
  });
}

export async function signOut() {
  await api<void>('/api/auth/logout', { method: 'POST' });
  window.location.assign('/'); // a fresh page load, so nothing from the session stays in memory
}
