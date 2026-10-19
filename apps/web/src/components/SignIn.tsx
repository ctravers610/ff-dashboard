// Shown instead of the dashboard when sign-in is required.

const MESSAGES: Record<string, { text: string; tone: 'error' | 'info' }> = {
  denied: { text: "That GitHub account isn't allowed to view this dashboard.", tone: 'error' },
  cancelled: { text: 'Sign-in was cancelled.', tone: 'info' },
};

export function SignIn() {
  const reason = new URLSearchParams(window.location.search).get('login');
  const message = reason ? MESSAGES[reason] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fantasy Dashboard</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">This dashboard is private. Sign in with GitHub to continue.</p>
      </div>

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-lg p-3 text-sm ${
            message.tone === 'error'
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          {message.text}
        </p>
      )}

      {/* A plain link, not fetch: the browser itself has to visit GitHub's sign-in page. */}
      <a
        href="/api/auth/github/login"
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        Sign in with GitHub
      </a>
    </main>
  );
}
