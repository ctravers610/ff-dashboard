import type { DashboardResponse } from '@ffd/shared';
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
