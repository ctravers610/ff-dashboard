import type { LeagueSource, SourcesResponse } from '@ffd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';

type Platform = 'sleeper' | 'espn' | 'yahoo' | 'ffpc';

const CHOICES: { id: Platform; name: string; detail: string }[] = [
  { id: 'sleeper', name: 'Sleeper', detail: 'Add an account: all of its leagues' },
  { id: 'espn', name: 'ESPN', detail: 'Add one league by its address or id' },
  { id: 'yahoo', name: 'Yahoo', detail: 'Connect your Yahoo account' },
  { id: 'ffpc', name: 'FFPC', detail: 'Paste a league from its Live Scoring page' },
];

const input = 'w-full rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-sm';
const primary = 'rounded-lg bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50';

// One form for Sleeper and ESPN: the server checks the account or league exists
// (and that you're in it) before saving, and says what's wrong if not.
function SourceForm({ platform, espnCookies }: { platform: 'sleeper' | 'espn'; espnCookies: boolean }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api<LeagueSource>('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, value }) }),
    onSuccess: () => {
      setValue('');
      for (const key of ['sources', 'dashboard', 'waivers', 'history']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) add.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {platform === 'sleeper' ? 'Sleeper username' : 'ESPN league address or id'}
        <input
          className={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={platform === 'sleeper' ? 'BoyntonBoy' : 'https://fantasy.espn.com/football/league?leagueId=13396297'}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {platform === 'espn' && !espnCookies && (
        <p className="text-sm text-amber-200">ESPN leagues need your ESPN cookies in .env (ESPN_S2 and ESPN_SWID) first; the README shows how to find them.</p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className={primary} disabled={add.isPending || !value.trim()}>
          {add.isPending ? 'Checking…' : 'Add'}
        </button>
        {add.isSuccess && (
          <p role="status" className="text-sm text-emerald-300">
            Added {add.data.label}.
          </p>
        )}
      </div>
      {add.error && (
        <p role="alert" className="text-sm text-rose-300">
          {add.error.message}
        </p>
      )}
    </form>
  );
}

function YahooPanel() {
  const { data } = useQuery({
    queryKey: ['yahoo-status'],
    queryFn: () => api<{ configured: boolean; connected: boolean }>('/api/auth/yahoo/status'),
  });
  if (!data) return null;
  if (!data.configured) {
    return <p className="text-sm text-slate-300">Yahoo isn't set up on this server: add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET to .env (see the README).</p>;
  }
  if (data.connected) {
    return <p className="text-sm text-slate-300">Your Yahoo account is connected. Its leagues appear once Yahoo approves the app for Fantasy data.</p>;
  }
  return (
    // A plain link: the browser itself has to visit Yahoo's sign-in page.
    <a href="/api/auth/yahoo/login" className={`${primary} self-start`}>
      Connect Yahoo
    </a>
  );
}

// Everything the dashboard follows, with a remove button for what was added here.
function Connected({ data }: { data: SourcesResponse }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/sources/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const key of ['sources', 'dashboard', 'waivers']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  if (data.sources.length === 0) return null;
  return (
    <section aria-label="Connected accounts and leagues" className="flex flex-col gap-2 border-t border-slate-800 pt-4">
      <h3 className="text-sm font-semibold text-slate-200">On your dashboard</h3>
      <ul className="flex flex-col divide-y divide-slate-800 text-sm">
        {data.sources.map((s) => (
          <li key={`${s.platform}:${s.value}`} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-medium">{s.platform === 'sleeper' ? 'Sleeper' : 'ESPN'}</span>{' '}
              <span className="text-slate-300">{s.label ?? s.value}</span>
            </span>
            {s.fromEnv ? (
              <span className="shrink-0 text-xs text-slate-400">from .env</span>
            ) : (
              <button
                type="button"
                onClick={() => remove.mutate(s.id!)}
                aria-label={`Remove ${s.label ?? s.value}`}
                className="shrink-0 rounded-md px-2 py-0.5 text-rose-300 hover:bg-rose-950"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AddLeagueDialog({ onClose, onFfpc }: { onClose: () => void; onFfpc: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const { data } = useQuery({ queryKey: ['sources'], queryFn: () => api<SourcesResponse>('/api/sources') });

  // A native modal dialog: focus moves into it, Escape closes it, and the page behind is inert.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const choose = (id: Platform) => (id === 'ffpc' ? onFfpc() : setPlatform(id));

  return (
    <dialog
      ref={ref}
      aria-labelledby="add-league-title"
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-slate-900 p-6 text-slate-100 backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-league-title" className="text-lg font-semibold">
            {platform ? `Add ${CHOICES.find((c) => c.id === platform)!.name}` : 'Add a league'}
          </h2>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
            Close
          </button>
        </div>

        {!platform ? (
          <div role="group" aria-label="Platform" className="grid gap-2 sm:grid-cols-2">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c.id)}
                className="flex flex-col items-start gap-0.5 rounded-lg border border-slate-700 px-4 py-3 text-left hover:border-slate-500 hover:bg-slate-800"
              >
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-slate-400">{c.detail}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setPlatform(null)} className="self-start text-sm text-slate-400 hover:text-slate-200">
              ← Choose a different platform
            </button>
            {platform === 'yahoo' ? <YahooPanel /> : <SourceForm platform={platform as 'sleeper' | 'espn'} espnCookies={data?.espnCookies ?? false} />}
          </>
        )}

        {data && <Connected data={data} />}
      </div>
    </dialog>
  );
}
