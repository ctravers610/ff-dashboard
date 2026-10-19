import type { HistoryWeek } from '@ffd/shared';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ordinal, pts } from '../../format';

interface Point {
  week: number;
  points: number | null; // null = no data for that week
  opponent: number | null; // null in all-play weeks: there is no single opponent to compare with
  detail: HistoryWeek | null;
}

// Round 50-point steps: 0, 50, 100, ... up to the first step above the data.
export function yTicks(max: number): number[] {
  const top = Math.max(50, Math.ceil(max / 50) * 50);
  return Array.from({ length: top / 50 + 1 }, (_, i) => i * 50);
}

const RESULT_TEXT = { win: 'Win', loss: 'Loss', tie: 'Tie', live: 'In progress' } as const;

// Opponent's score as a short horizontal tick. It sits on top of the column, so
// it gets a 2px ring in the card color to stay legible against the bar fill.
function OpponentTick({ cx, cy }: { cx?: number; cy?: number }) {
  if (cx == null || cy == null) return null;
  const half = 14;
  return (
    <g aria-hidden>
      <line x1={cx - half - 2} x2={cx + half + 2} y1={cy} y2={cy} stroke="var(--chart-surface)" strokeWidth={6} strokeLinecap="round" />
      <line x1={cx - half} x2={cx + half} y1={cy} y2={cy} stroke="var(--chart-ink)" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

// Values lead, labels follow; series are keyed with a short stroke of their color.
function WeekTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const point = active ? payload?.[0]?.payload : undefined;
  const w = point?.detail;
  if (!w) return null; // weeks with no data have nothing to show

  return (
    <div className="rounded-lg border px-3 py-2 text-sm shadow-md border-slate-700 bg-slate-900">
      <div className="mb-1 text-xs text-slate-400">
        Week {w.week}
        {w.result && ` · ${RESULT_TEXT[w.result]}`}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-3 rounded" style={{ background: 'var(--chart-series)' }} />
        <span className="font-semibold tabular-nums">{pts(w.points)}</span>
        <span className="text-slate-400">you</span>
      </div>
      {w.allPlay ? (
        <div className="mt-1 text-xs text-slate-400">
          All-play: {ordinal(w.allPlay.rank)} of {w.allPlay.teams} (top {w.allPlay.winSlots} win)
        </div>
      ) : (
        w.opponentPoints != null && (
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded" style={{ background: 'var(--chart-ink)' }} />
            <span className="font-semibold tabular-nums">{pts(w.opponentPoints)}</span>
            <span className="max-w-40 truncate text-slate-400">{w.opponentName ?? 'opponent'}</span>
          </div>
        )
      )}
    </div>
  );
}

export function WeeklyChart({ weeks, label }: { weeks: HistoryWeek[]; label: string }) {
  // Span week 1 to the latest week so gaps read as "no data" instead of a
  // lone bar floating in the middle.
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  const lastWeek = Math.max(...weeks.map((w) => w.week), 1);
  const data: Point[] = Array.from({ length: lastWeek }, (_, i) => {
    const w = byWeek.get(i + 1) ?? null;
    return { week: i + 1, points: w?.points ?? null, opponent: w && !w.allPlay ? w.opponentPoints : null, detail: w };
  });
  const ticks = yTicks(Math.max(...weeks.map((w) => Math.max(w.points, w.opponentPoints ?? 0)), 0));

  return (
    // The container includes the x-axis band, so nothing scrolls or clips.
    <div className="h-52 w-full" role="img" aria-label={`${label}: your points each week. Use the table view for exact values.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickMargin={6}
          />
          <YAxis
            width={34}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]!]}
          />
          <Tooltip content={<WeekTooltip />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.6 }} isAnimationActive={false} />
          <Bar dataKey="points" maxBarSize={24} radius={[4, 4, 0, 0]} fill="var(--chart-series)" isAnimationActive={false}>
            {data.map((d) => (
              // A week still being played is drawn lighter, so it doesn't read as a final score.
              <Cell key={d.week} fillOpacity={d.detail?.result === 'live' ? 0.5 : 1} />
            ))}
          </Bar>
          <Line dataKey="opponent" stroke="none" dot={<OpponentTick />} activeDot={false} isAnimationActive={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
