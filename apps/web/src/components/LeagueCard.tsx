import type { LeagueSummary } from '@ffd/shared';
import { useState } from 'react';
import { ordinal, PLATFORM_LABEL, record } from '../format';
import { LineupTable } from './LineupTable';
import { RosterList } from './RosterList';
import { Scoreboard } from './Scoreboard';
import { StandingsTable } from './StandingsTable';

type Tab = 'lineup' | 'standings' | 'roster' | null;

export function LeagueCard({ league, onEdit }: { league: LeagueSummary; onEdit?: () => void }) {
  const [tab, setTab] = useState<Tab>(null);
  const me = league.standings.find((t) => t.teamId === league.myTeamId);

  const tabButton = (value: Exclude<Tab, null>, label: string) => (
    <button
      type="button"
      onClick={() => setTab(tab === value ? null : value)}
      className={`rounded-md px-3 py-1 text-sm font-medium transition ${
        tab === value
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{league.name}</h2>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {league.manual
              ? `${league.manual.teamName || 'My team'} · entered manually, updated ${new Date(league.manual.updatedAt).toLocaleDateString()}`
              : `${me?.teamName} · @${league.account}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {PLATFORM_LABEL[league.platform]}
        </span>
      </header>

      {me && (
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Record</div>
            <div className="text-base font-semibold tabular-nums">{record(me)}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Rank</div>
            <div className="text-base font-semibold">
              {ordinal(me.rank)} <span className="font-normal text-slate-400">of {league.standings.length}</span>
            </div>
          </div>
        </div>
      )}

      {league.matchup ? (
        <Scoreboard matchup={league.matchup} />
      ) : league.manual ? (
        <p className="text-sm text-slate-500">
          {league.roster.length} players · no live scores or standings for manually entered leagues.
        </p>
      ) : (
        <p className="text-sm text-slate-500">No matchup this week.</p>
      )}

      {league.manual && league.manual.unmatched.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          Couldn't find: {league.manual.unmatched.join(', ')}. Check the spelling in Edit roster.
        </p>
      )}

      {league.alerts.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {league.alerts.map((a, i) => (
            <li
              key={i}
              className={`rounded-md px-3 py-1.5 text-sm ${
                a.reason === 'empty' || a.detail === 'Out' || a.detail === 'IR'
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
              }`}
            >
              <span className="font-medium">{a.slot}</span> · {a.playerName ? `${a.playerName} is ${a.detail}` : a.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1">
        {league.matchup && tabButton('lineup', 'Lineups')}
        {league.standings.length > 0 && tabButton('standings', 'Standings')}
        {league.manual && tabButton('roster', 'Roster')}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto rounded-md px-3 py-1 text-sm font-medium text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950"
          >
            Edit roster
          </button>
        )}
      </div>

      {tab === 'roster' && <RosterList roster={league.roster} />}
      {tab === 'lineup' && league.matchup && <LineupTable matchup={league.matchup} />}
      {tab === 'standings' && <StandingsTable standings={league.standings} myTeamId={league.myTeamId} />}
    </article>
  );
}
