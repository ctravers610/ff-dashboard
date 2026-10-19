import {
  convertFfpcLivePage,
  convertFfpcPage,
  looksLikeFfpcLiveScoring,
  looksLikeFfpcPage,
  type ManualLeague,
  type ManualLeagueInput,
} from '@ffd/shared';
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

  const [form, setForm] = useState<ManualLeagueInput>({ name: '', teamName: '', rosterText: '', matchup: null });
  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        teamName: existing.teamName,
        rosterText: existing.rosterText,
        matchup: existing.matchup ?? null,
      });
    }
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
  const [matchupError, setMatchupError] = useState<string | null>(null);

  // The Live Scoring page has everything: league/team name, your starters and
  // bench, and the matchup. It has no IR section, so keep IR players already listed.
  const importLiveScoring = (text: string) => {
    const result = convertFfpcLivePage(text, form.teamName);
    if (!result) {
      setMatchupError("That doesn't look like an FFPC Live Scoring page.");
      return;
    }
    setMatchupError(null);
    setForm((f) => {
      const irLines = f.rosterText.split(/\r?\n/).filter((l) => /^IR\b/i.test(l.trim()));
      return {
        name: f.name || result.leagueName || '',
        teamName: f.teamName || result.teamName || '',
        rosterText: [result.rosterText, ...irLines].join('\n'),
        matchup: result.matchup,
      };
    });
    setImportNotice(
      `Imported week ${result.matchup.week}: your ${result.players} players and your matchup vs ${result.matchup.opponent.teamName}. Check them, then Save.`,
    );
  };

  const onRosterPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (looksLikeFfpcLiveScoring(text)) {
      e.preventDefault();
      importLiveScoring(text);
      return;
    }
    if (!looksLikeFfpcPage(text)) return;
    e.preventDefault();
    const result = convertFfpcPage(text);
    setForm((f) => ({
      ...f,
      name: f.name || result.leagueName || '',
      teamName: f.teamName || result.teamName || '',
      rosterText: result.rosterText,
    }));
    setImportNotice(`Imported ${result.players} players from the FFPC page. Check them, then Save.`);
  };

  const onMatchupPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    importLiveScoring(e.clipboardData.getData('text'));
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
            Filled in automatically by the Live Scoring paste below. You can also paste your FFPC team page here (Ctrl+A,
            Ctrl+C) or type one player per line, with a slot (QB, RB, WR, TE, FLEX, SF, K, DEF) for starters, BN for
            bench, IR for injured reserve.
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

        <div className="flex flex-col gap-1 text-sm font-medium">
          Weekly Live Scoring paste <span className="font-normal text-slate-500">(recommended)</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            Once a week, after lineups lock: on FFPC's Live Scoring page press Ctrl+A, Ctrl+C, then paste below. It
            fills in the league, your roster and both lineups; scores then update live from real-time stats.
          </span>
          {form.matchup ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 font-normal dark:bg-slate-800">
              <span>
                Week {form.matchup.week}: {form.matchup.me.teamName} {form.matchup.me.points.toFixed(2)} vs{' '}
                {form.matchup.opponent.teamName} {form.matchup.opponent.points.toFixed(2)}
                <span className="ml-1 text-xs text-slate-500">
                  ({form.matchup.me.starters.length} + {form.matchup.opponent.starters.length} starters)
                </span>
              </span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, matchup: null }))}
                className="shrink-0 text-xs font-medium text-rose-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : null}
          <textarea
            rows={2}
            value=""
            onChange={() => {}}
            onPaste={onMatchupPaste}
            placeholder={form.matchup ? 'Paste again after lineup changes' : 'Paste the Live Scoring page here'}
            className={`${field} font-normal`}
          />
          {matchupError && <span className="text-xs font-normal text-rose-600">{matchupError}</span>}
        </div>

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
