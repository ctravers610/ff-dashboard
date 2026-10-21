import type { DashboardResponse } from '@ffd/shared';
import { PLATFORM_LABEL } from '../format';

// Which error sources belong to which platform: "espn:123" to ESPN, the
// hand-entered leagues and their live scoring to FFPC.
const platformOf = (source: string) => (source === 'manual' || source === 'live-scoring' ? 'ffpc' : source.split(':')[0]!);

/** One line under the matchups: whether each platform loaded, and when. */
export function DataStatus({ data }: { data: DashboardResponse }) {
  const platforms = [...new Set([...data.leagues.map((l) => l.platform as string), ...data.errors.map((e) => platformOf(e.source))])].filter(
    (p) => p in PLATFORM_LABEL,
  );
  if (platforms.length === 0) return null;
  const at = new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <p aria-label="Data sources" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
      {platforms.map((p) => {
        const problems = data.errors.filter((e) => platformOf(e.source) === p);
        const loaded = data.leagues.some((l) => l.platform === p);
        const tone = problems.length === 0 ? 'bg-emerald-500' : loaded ? 'bg-amber-400' : 'bg-rose-500';
        const note = problems.length === 0 ? 'loaded' : problems.some((e) => e.code === 'espn-cookies') ? 'cookies refused' : loaded ? 'partly loaded' : 'failed';
        return (
          <span key={p} className="flex items-center gap-1.5" title={problems.map((e) => e.message).join('\n') || undefined}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone}`} />
            {PLATFORM_LABEL[p]} {note}
          </span>
        );
      })}
      <span>· updated {at}</span>
    </p>
  );
}
