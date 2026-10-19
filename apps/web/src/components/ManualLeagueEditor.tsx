import { convertFfpcPage, looksLikeFfpcPage, type ManualLeague, type ManualLeagueInput } from '@ffd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';

const PLACEHOLDER = `QB Josh Allen
RB Bijan Robinson
WR Puka Nacua
FLEX Brock Bowers
DEF Bills
BN Najee Harris
IR Jonathon Brooks`;

async function request(method: string, url: string, body?: ManualLeagueInput) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
}

// leagueId = null → creating a new league.
export function ManualLeagueEditor({ leagueId, onClose }: { leagueId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: leagues } = useQuery({
    queryKey: ['manual-leagues'],
    queryFn: async (): Promise<ManualLeague[]> => (await fetch('/api/manual-leagues')).json(),
  });
  const existing = leagues?.find((l) => l.id === leagueId);

  const [form, setForm] = useState<ManualLeagueInput>({ name: '', teamName: '', rosterText: '' });
  useEffect(() => {
    if (existing) setForm({ name: existing.name, teamName: existing.teamName, rosterText: existing.rosterText });
  }, [existing]);

  // After any change, refetch the dashboard so the new roster shows up.
  const onSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['manual-leagues'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      leagueId
        ? request('PUT', `/api/manual-leagues/${leagueId}`, form)
        : request('POST', '/api/manual-leagues', form),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: () => request('DELETE', `/api/manual-leagues/${leagueId}`),
    onSuccess,
  });

  // Pasting a whole FFPC team page (Ctrl+A, Ctrl+C) converts it to clean lines
  // and fills in the league/team names if they're still empty.
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const onRosterPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (!looksLikeFfpcPage(text)) return;
    e.preventDefault();
    const result = convertFfpcPage(text);
    setForm({
      name: form.name || result.leagueName || '',
      teamName: form.teamName || result.teamName || '',
      rosterText: result.rosterText,
    });
    setImportNotice(`Imported ${result.players} players from the FFPC page. Check them, then Save.`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const field =
    'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <h2 className="text-lg font-semibold">{leagueId ? 'Edit FFPC roster' : 'Add FFPC league'}</h2>

        <label className="flex flex-col gap-1 text-sm font-medium">
          League name
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Your team name
          <input
            maxLength={80}
            value={form.teamName}
            onChange={(e) => setForm({ ...form, teamName: e.target.value })}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Roster
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            Quickest: on your FFPC team page press Ctrl+A, Ctrl+C, then paste here. Or type one player per line, with a
            slot (QB, RB, WR, TE, FLEX, SF, K, DEF) for starters, BN for bench, IR for injured reserve.
          </span>
          <textarea
            rows={12}
            placeholder={PLACEHOLDER}
            value={form.rosterText}
            onPaste={onRosterPaste}
            onChange={(e) => setForm({ ...form, rosterText: e.target.value })}
            className={`${field} font-mono`}
          />
        </label>
        {importNotice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{importNotice}</p>}

        {(save.error || remove.error) && (
          <p className="text-sm text-rose-600">{(save.error ?? remove.error)?.message}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          {leagueId ? (
            <button
              type="button"
              onClick={() => confirm('Delete this league?') && remove.mutate()}
              className="text-sm font-medium text-rose-600 hover:underline"
            >
              Delete league
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
