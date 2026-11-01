import type { WinChancePoint } from '@ffd/shared';
import { useState, type MouseEvent } from 'react';
import { clockTime } from '../../format';

// In a 1000 x 100 box, so 50% is the midline; the points are spaced evenly since
// they're recorded about once a minute of game time, skipping the days between.
const x = (i: number, count: number) => ((i / (count - 1)) * 1000).toFixed(1);
const y = (chance: number) => ((1 - chance) * 100).toFixed(1);

/** An area from the midline to the line, clipped to one side of it. */
function area(points: WinChancePoint[], clip: (chance: number) => number) {
  const edge = points.map((p, i) => `L${x(i, points.length)} ${y(clip(p.chance))}`).join(' ');
  return `M0 50 ${edge} L1000 50 Z`;
}

// Win chance so far this week, ending at the chance right now. Above the midline
// you're the favorite; hovering reads the chance at any point.
export function Sparkline({ points, now }: { points: WinChancePoint[]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const series = [...points, { at: new Date().toISOString(), chance: now }];
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i, series.length)} ${y(p.chance)}`).join(' ');
  const hovered = hover != null ? series[hover] : undefined;
  const onMove = (e: MouseEvent<HTMLSpanElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.round(((e.clientX - box.left) / box.width) * (series.length - 1)));
  };

  return (
    <span aria-hidden="true" className="relative block min-h-11 flex-1" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={area(series, (c) => Math.max(0.5, c))} className="fill-emerald-500/30" />
        <path d={area(series, (c) => Math.min(0.5, c))} className="fill-rose-500/30" />
        <line x1="0" y1="50" x2="1000" y2="50" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" className="stroke-slate-600" />
        <path d={line} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className="stroke-slate-100" />
      </svg>
      {hovered && (
        <>
          <span className="absolute inset-y-0 w-px bg-slate-300" style={{ left: `${(hover! / (series.length - 1)) * 100}%` }} />
          <span className="absolute left-0 top-0 rounded bg-slate-950 px-1 text-xs tabular-nums text-slate-200">
            {Math.round(hovered.chance * 100)}% · {clockTime(hovered.at)}
          </span>
        </>
      )}
    </span>
  );
}
