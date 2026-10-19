import type { ReactNode } from 'react';

// The list on the left of a tab (Waivers, History): one row per item, the
// chosen one highlighted. On phones it turns into a dropdown above the content.

export interface SideItem {
  key: string;
  title: string;
  meta?: ReactNode; // a smaller line under the title
  extra?: ReactNode; // e.g. a row of result chips
  mark?: ReactNode; // shown at the right of the title, e.g. "claims not set"
  alert?: boolean; // outlines the row in red
  optionLabel: string; // the dropdown's text on phones
}

export function SideList({ label, items, value, onChange }: { label: string; items: SideItem[]; value: string; onChange: (key: string) => void }) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-slate-300 lg:hidden">
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
          {items.map((i) => (
            <option key={i.key} value={i.key}>
              {i.optionLabel}
            </option>
          ))}
        </select>
      </label>

      <div role="group" aria-label={label} className="hidden flex-col gap-1 lg:flex">
        {items.map((i) => {
          const selected = i.key === value;
          return (
            <button
              key={i.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(i.key)}
              className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition ${
                selected ? 'border-slate-500 bg-slate-800' : i.alert ? 'border-rose-800 hover:bg-slate-900' : 'border-transparent hover:bg-slate-900'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{i.title}</span>
                {i.mark}
              </span>
              {i.meta && <span className="text-xs text-slate-400">{i.meta}</span>}
              {i.extra}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** The two-column frame: the side list, then the content beside it (below it on phones). */
export function WithSideList({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      {list}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2">{children}</div>
    </div>
  );
}
