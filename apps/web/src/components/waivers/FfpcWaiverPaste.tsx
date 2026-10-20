import type { WaiverLeague } from '@ffd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ClipboardEvent } from 'react';
import { api } from '../../api';

// FFPC has no API, so its waivers come from a copy of the league's add/drop
// page. Pasting saves it straight away; there's nothing else to fill in.
export function FfpcWaiverPaste({ league }: { league: WaiverLeague }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(!league.pastedAt);
  const save = useMutation({
    mutationFn: (text: string) =>
      api(`/api/manual-leagues/${league.leagueId}/waivers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      setOpen(false);
      return queryClient.invalidateQueries({ queryKey: ['waivers'] });
    },
  });

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    save.mutate(text);
  };

  const pastedAt = league.pastedAt
    ? new Date(league.pastedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-slate-300">
          {league.pasteStale && <span className="mr-1 font-semibold text-amber-300">Bids have processed since this paste.</span>}
          {pastedAt
            ? `From FFPC's add/drop page as pasted ${pastedAt}: who's available and your FAAB. Projections and injury tags are live. Paste again after bids process to stay current.`
            : "FFPC has no API, so paste the league's add/drop page to see waivers here."}
        </p>
        {league.pastedAt && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-md px-3 py-1 font-medium text-violet-300 hover:bg-violet-950">
            {open ? 'Cancel' : 'Paste a newer copy'}
          </button>
        )}
      </div>
      {open && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">
            In FFPC, open this league's free agents (Add/Drop) page, press Ctrl+A then Ctrl+C, and paste here.
          </span>
          <textarea
            rows={3}
            onPaste={onPaste}
            placeholder="Paste FFPC's add/drop page here"
            className="rounded-lg border border-slate-700 bg-transparent px-3 py-2"
            disabled={save.isPending}
          />
        </label>
      )}
      {save.isPending && <p className="text-slate-400">Saving…</p>}
      {save.error && (
        <p role="alert" className="text-rose-300">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
