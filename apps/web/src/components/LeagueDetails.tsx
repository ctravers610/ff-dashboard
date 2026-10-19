import type { LeagueSummary } from '@ffd/shared';
import { useState } from 'react';
import { ordinal, pmr, record } from '../format';
import { AllPlaySummary, AllPlayTable } from './AllPlay';
import { LineupTable } from './LineupTable';
import { RosterList } from './RosterList';
import { Scoreboard } from './Scoreboard';
import { StandingsTable } from './StandingsTable';

type Tab = 'allplay' | 'lineup' | 'standings' | 'roster' | null;

// Everything about one league, shown when its row in the matchup table is opened.
export function LeagueDetails({ league, onEdit }: { league: LeagueSummary; onEdit?: () => void }) {
  // Opening a league shows its lineups straight away.
  const [tab, setTab] = useState<Tab>(league.matchup ? 'lineup' : null);
  const me = league.standings.find((t) => t.teamId === league.myTeamId);

  const tabButton = (value: Exclude<Tab, null>, label: string) => (
    <button
      type="button"
      aria-pressed={tab === value}
      onClick={() => setTab(tab === value ? null : value)}
      className={`rounded-md px-3 py-1 text-sm font-medium transition ${
        tab === value ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 border-t border-slate-800 px-4 pb-4 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
        <p className="text-slate-400">
          {league.manual
            ? `${league.manual.leagueName} · entered manually, updated ${new Date(league.manual.updatedAt).toLocaleDateString()}`
            : `${me?.teamName} · @${league.account}`}
        </p>
        <p className="flex flex-wrap gap-x-3 text-slate-400">
          {me && (
            <span>
              Record <span className="font-semibold tabular-nums text-slate-100">{record(me)}</span> · Rank{' '}
              <span className="font-semibold text-slate-100">{ordinal(me.rank)}</span> of {league.standings.length}
            </span>
          )}
          {league.matchup?.me.minutesLeft != null && (
            <span title="Player minutes remaining: 60 per starter, ticking down as each game is played">
              PMR <span className="font-semibold tabular-nums text-slate-100">{pmr(league)}</span>
            </span>
          )}
        </p>
      </div>

      {league.matchup ? (
        <div className="flex flex-col gap-1">
          {league.matchup.allPlay ? <AllPlaySummary allPlay={league.matchup.allPlay} /> : <Scoreboard matchup={league.matchup} />}
          {league.manual?.matchupCapturedAt && (
            <p className="text-xs text-slate-400">
              {league.manual.liveScored ? (
                <>
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />
                  Live from real-time stats scored with FFPC rules; may differ slightly from FFPC's official totals.
                  Lineups as of{' '}
                </>
              ) : (
                'Snapshot as of '
              )}
              {new Date(league.manual.matchupCapturedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              {league.manual.liveScored ? '.' : ', not live. Re-paste the Live Scoring page in Edit roster to update.'}
            </p>
          )}
        </div>
      ) : league.manual ? (
        <p className="text-sm text-slate-400">
          {league.roster.length} players · paste this week's Live Scoring page in Edit roster to see your matchup.
        </p>
      ) : (
        <p className="text-sm text-slate-400">No matchup this week.</p>
      )}

      {league.manual && league.manual.unmatched.length > 0 && (
        <p className="rounded-md bg-amber-950/60 px-3 py-1.5 text-sm text-amber-200">
          Couldn't find: {league.manual.unmatched.join(', ')}. Check the spelling in Edit roster.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {league.matchup?.allPlay && tabButton('allplay', 'All-play')}
        {league.matchup && tabButton('lineup', 'Lineups')}
        {league.standings.length > 0 && tabButton('standings', 'Standings')}
        {league.manual && tabButton('roster', 'Roster')}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto rounded-md px-3 py-1 text-sm font-medium text-violet-300 hover:bg-violet-950"
          >
            Edit roster
          </button>
        )}
      </div>

      {tab === 'allplay' && league.matchup?.allPlay && <AllPlayTable allPlay={league.matchup.allPlay} />}
      {tab === 'roster' && <RosterList roster={league.roster} />}
      {tab === 'lineup' && league.matchup && <LineupTable matchup={league.matchup} />}
      {tab === 'standings' && <StandingsTable standings={league.standings} myTeamId={league.myTeamId} />}
    </div>
  );
}
