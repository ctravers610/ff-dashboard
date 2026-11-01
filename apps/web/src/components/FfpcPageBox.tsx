import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ClipboardEvent, type ReactNode } from 'react';
import { api, useDemo } from '../api';

// A paste box for one of FFPC's pages, closed until you ask for it. FFPC has no
// API, so pasting saves straight away, and the box stays open for the next page.
export function FfpcPageBox<T>({
  url,
  status,
  openLabel,
  help,
  placeholder,
  refresh,
  pastedNotice,
}: {
  url: string;
  status: ReactNode;
  openLabel: string;
  help: string;
  placeholder: string;
  refresh: unknown[][]; // the query keys a paste changes
  pastedNotice: (pasted: T) => string;
}) {
  const queryClient = useQueryClient();
  const demo = useDemo();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (text: string) =>
      api<T>(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }),
    onSuccess: (pasted) => {
      setNotice(pastedNotice(pasted));
      return Promise.all(refresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    setNotice(null);
    save.mutate(text);
  };

  if (demo) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-slate-300">{status}</p>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-md px-3 py-1 font-medium text-violet-300 hover:bg-violet-950">
          {open ? 'Close' : openLabel}
        </button>
      </div>
      {open && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">{help}</span>
          <textarea rows={3} onPaste={onPaste} placeholder={placeholder} className="rounded-lg border border-slate-700 bg-transparent px-3 py-2" disabled={save.isPending} />
        </label>
      )}
      {save.isPending && <p className="text-slate-400">Saving…</p>}
      {notice && <p className="text-emerald-400">{notice}</p>}
      {save.error && (
        <p role="alert" className="text-rose-300">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
