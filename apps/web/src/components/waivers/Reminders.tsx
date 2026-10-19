import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api';

// Turns waiver reminders on for this browser: ask for permission, register
// the service worker (public/sw.js), subscribe with the server's public key,
// and hand the subscription to the server, which pushes reminders to it.

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// The VAPID public key arrives base64url-encoded; the Push API wants raw bytes.
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function Reminders() {
  const { data: key } = useQuery({ queryKey: ['push-key'], queryFn: () => api<{ publicKey: string | null }>('/api/push/key'), staleTime: Infinity });
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (supported()) void currentSubscription().then((s) => setSubscribed(Boolean(s)));
  }, []);

  const turnOn = useMutation({
    mutationFn: async () => {
      setProblem(null);
      const permission = await Notification.requestPermission();
      if (permission === 'default') {
        throw new Error('The permission prompt was closed without an answer. Click Turn on reminders again and choose Allow.');
      }
      if (permission === 'denied') {
        throw new Error(
          'Notifications are blocked for this site. Click the icon at the left of the address bar, set Notifications to Allow, reload, and try again.',
        );
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key!.publicKey!) });
      await api('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
    },
    onSuccess: () => setSubscribed(true),
    onError: (e) => setProblem(e.message),
  });

  const turnOff = useMutation({
    mutationFn: async () => {
      const subscription = await currentSubscription();
      if (!subscription) return;
      await api('/api/push/subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    },
    onSuccess: () => setSubscribed(false),
  });

  const test = useMutation({
    mutationFn: () => api<{ sent: number }>('/api/push/test', { method: 'POST' }),
  });

  if (!key) return null;
  const box = 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm';

  if (!key.publicKey) return null; // not set up on this server
  if (!supported()) {
    return <p className={box}>This browser can't show reminders. On an iPhone, add the dashboard to your home screen first, then open it from there.</p>;
  }

  return (
    <section aria-label="Waiver reminders" className={box}>
      <p className="text-slate-300">
        {subscribed
          ? 'Reminders are on for this browser: 9 PM ET before overnight runs, 2 hours before the rest, unless your claims are set.'
          : 'Get a reminder before each waiver run that still needs your claims.'}
      </p>
      <div className="flex gap-1">
        {subscribed ? (
          <>
            <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className="rounded-md px-3 py-1 font-medium text-slate-200 hover:bg-slate-800">
              {test.isSuccess ? 'Test sent' : 'Send a test'}
            </button>
            <button type="button" onClick={() => turnOff.mutate()} className="rounded-md px-3 py-1 font-medium text-slate-400 hover:bg-slate-800">
              Turn off
            </button>
          </>
        ) : (
          subscribed === false && (
            <button type="button" onClick={() => turnOn.mutate()} disabled={turnOn.isPending} className="rounded-md bg-slate-100 px-3 py-1 font-medium text-slate-900">
              Turn on reminders
            </button>
          )
        )}
      </div>
      {(problem || test.error) && (
        <p role="alert" className="w-full text-rose-300">
          {problem ?? test.error?.message}
        </p>
      )}
    </section>
  );
}
