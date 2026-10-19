import type { DashboardResponse, HistoryResponse } from '@ffd/shared';
import { useQuery } from '@tanstack/react-query';

async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch('/api/dashboard');
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
  return res.json();
}

// A custom hook: any component can call useDashboard() to get the data,
// loading state and error, and it refreshes every 60 seconds on its own.
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
  });
}

async function fetchHistory(): Promise<HistoryResponse> {
  const res = await fetch('/api/history');
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
  return res.json();
}

// Weekly results for every league; snapshots only change when the dashboard
// loads, so a slower refresh than the live dashboard is plenty.
export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: fetchHistory,
    refetchInterval: 60_000,
  });
}
