import { useState } from 'react';
import { useHistory, useOutlook, useRecap, useRecapSeason } from '../../api';
import { percent } from '../outlook/UpNext';
import { PLATFORM_LABEL } from '../../format';
import { SideList, WithSideList } from '../SideList';
import { LeagueHistoryCard, type HistoryMode } from './LeagueHistoryCard';
import { RecapPanel } from './LineupRecap';
import { TradesPanel } from './TradesPanel';
import { ResultChip } from './ResultChip';

// League by league: pick a league on the left; on the right, its weekly
// results (chart or table) and the lineup recap for a finished week.
export function HistoryView() {
  const { data, error, isPending, isFetching } = useHistory();
  const [mode, setMode] = useState<HistoryMode>('chart');
  const [selected, setSelected] = useState<string | null>(null);
  const [week, setWeek] = useState<number | null>(null); // null: the latest finished week
  const recap = useRecap(week).data;
  const season = useRecapSeason().data;
  const outlook = useOutlook().data;
  const oddsFor = (h: { platform: string; leagueId: string }) => outlook?.leagues.find((l) => keyOf(l) === keyOf(h)) ?? null;

  if (isPending) return <p className="text-slate-400">Loading history…</p>;
  if (error) return <p role="alert" className="text-rose-300">Couldn't load history: {error.message}</p>;
  if (data.leagues.length === 0) {
    return <p className="text-slate-400">No history yet. Weeks are recorded each time the dashboard loads, so check back after a few games.</p>;
  }

  const keyOf = (h: { platform: string; leagueId: string }) => `${h.platform}:${h.leagueId}`;
  const league = data.leagues.find((h) => keyOf(h) === selected) ?? data.leagues[0]!;
  const recordText = (h: (typeof data.leagues)[number]) => {
    const { wins, losses, ties } = h.record;
    return wins + losses + ties ? `${wins}-${losses}${ties ? `-${ties}` : ''}` : 'no results yet';
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">{data.season} season · results are head-to-head against your opponent each week</p>
      <WithSideList
        list={
          <SideList
            label="League"
            value={keyOf(league)}
            onChange={setSelected}
            items={data.leagues.map((h) => ({
              key: keyOf(h),
              title: h.name,
              optionLabel: `${h.name} · ${recordText(h)}`,
              meta: `${PLATFORM_LABEL[h.platform]} · ${recordText(h)}${h.avgPoints != null ? ` · ${h.avgPoints.toFixed(1)} avg` : ''}${
                oddsFor(h)?.playoffChance != null ? ` · ${percent(oddsFor(h)!.playoffChance!)} playoffs` : ''
              }`,
              extra: (
                <span className="mt-1 flex flex-wrap gap-0.5" aria-hidden="true">
                  {h.weeks.slice(-6).map((w) => (
                    <ResultChip key={w.week} result={w.result} week={w.week} />
                  ))}
                </span>
              ),
            }))}
          />
        }
      >
        {/* Refetching keeps the previous render, just dimmed: no skeleton, no layout jump. */}
        <section aria-label={`History for ${league.name}`} className={`flex flex-col gap-4 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
          <LeagueHistoryCard
            key={keyOf(league)}
            history={league}
            mode={mode}
            onMode={setMode}
            season={season?.leagues.find((l) => keyOf(l) === keyOf(league)) ?? null}
            outlook={oddsFor(league)}
            recap={recap ? { week: recap.week, weeks: recap.weeks } : null}
            onPickWeek={setWeek}
          />
          <RecapPanel leagueKey={keyOf(league)} week={week} onWeek={setWeek} />
          <TradesPanel leagueKey={keyOf(league)} />
        </section>
      </WithSideList>
    </div>
  );
}
