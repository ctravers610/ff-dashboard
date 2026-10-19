import { useMe } from './api';
import App from './App';
import { SignIn } from './components/SignIn';

// Decides between the sign-in screen and the dashboard.
export default function Root() {
  const { data: me, isPending, error } = useMe();

  if (isPending) return <p className="mx-auto max-w-6xl px-4 py-8 text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-6xl px-4 py-8 text-rose-700 dark:text-rose-300">
        Couldn't reach the server: {error.message}
      </p>
    );
  }
  if (me.authEnabled && !me.user) return <SignIn />;
  return <App user={me.user} />;
}
