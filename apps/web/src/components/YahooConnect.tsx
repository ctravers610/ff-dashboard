import { useQuery } from '@tanstack/react-query';

interface YahooStatus {
  configured: boolean;
  connected: boolean;
}

// Shows a "Connect Yahoo" prompt until you've signed in with Yahoo once.
export function YahooConnect() {
  const { data } = useQuery({
    queryKey: ['yahoo-status'],
    queryFn: async (): Promise<YahooStatus> => (await fetch('/api/auth/yahoo/status')).json(),
  });

  const denied = new URLSearchParams(window.location.search).get('yahoo') === 'denied';
  if (!data?.configured || data.connected) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/40">
      <p className="text-sm text-violet-900 dark:text-violet-200">
        {denied
          ? 'Yahoo access was declined. Connect again to see your Yahoo leagues.'
          : 'Connect your Yahoo account to add your Yahoo leagues.'}
      </p>
      {/* A plain link (not fetch) because the browser itself must visit Yahoo's login page. */}
      <a
        href="/api/auth/yahoo/login"
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        Connect Yahoo
      </a>
    </div>
  );
}
