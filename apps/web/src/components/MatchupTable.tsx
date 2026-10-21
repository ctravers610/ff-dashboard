import { winProbability, type LeagueSummary } from '@ffd/shared';
import { useState } from 'react';
import { useWaivers } from '../api';
import { HEALTH_TEXT, lineupHealth } from '../lineupHealth';
import { CLOSE_MARGIN, matchupMargin, matchupStatus, ordinal, PLATFORM_LABEL, pregame, pts, signed } from '../format';
import { ChevronIcon } from './icons';
import { LeagueDetails } from './LeagueDetails';

const leagueKey = (l: LeagueSummary) => `${l.platform}:${l.leagueId}`;


function opponentCell(l: LeagueSummary): string {
  const m = l.matchup;
  if (!m) return '—';
  const before = pregame(m);
  if (before) return pts(before.opponent);
  if (m.allPlay) return `${ordinal(m.allPlay.myRank)} of ${m.allPlay.teams.length}`;
  return m.opponent ? pts(m.opponent.points) : 'Bye';
}

// Every league on one screen, the most uncertain matchup first: closest to a
// 50/50 chance to win, from the live projections and how much of the week is
// left, since that's where your attention matters most. Each row is colored by
// whether its lineup is ready (see lineupHealth) and opens to the league's
// details: what to fix, lineups, standings, roster.
export function MatchupTable({ leagues, onEdit }: { leagues: LeagueSummary[]; onEdit?: (leagueId: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const waivers = useWaivers().data;
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = leagues
    .map((league) => ({
      league,
      key: leagueKey(league),
      // Before kickoff the scores are all 0, so the row shows projections instead (greyed).
      before: pregame(league.matchup),
      margin: pregame(league.matchup)?.margin ?? matchupMargin(league.matchup),
      status: matchupStatus(league.matchup),
      odds: winProbability(league.matchup),
      lineup: lineupHealth(league, waivers?.leagues.find((w) => w.platform === league.platform && w.leagueId === league.leagueId)),
    }))
    .sort((a, b) => (a.odds == null ? Infinity : Math.abs(a.odds - 0.5)) - (b.odds == null ? Infinity : Math.abs(b.odds - 0.5)));
  const widest = Math.max(1, ...rows.map((r) => Math.abs(r.margin ?? 0)));

  // Shared column layout for the header and every row; the opponent and bar columns appear from sm up.
  // Phone: league, score, margin, win %. From sm: plus opponent and the margin bar.
  // From xl (wide enough beside the live feed): plus both sides' PMR.
  const columns =
    'grid grid-cols-[minmax(0,1fr)_auto_auto_2.75rem_1rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1.7fr)_5rem_6rem_minmax(0,1fr)_3.5rem_1rem] xl:grid-cols-[minmax(0,1.7fr)_5rem_5.5rem_minmax(0,1fr)_3.5rem_4.25rem_4.25rem_1rem]';

  return (
    <section aria-label="Matchups" className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className={`${columns} border-b border-slate-800 px-4 py-2 text-xs text-slate-400`} aria-hidden="true">
        <span>League</span>
        <span className="text-right">Me</span>
        <span className="hidden text-right sm:block">Opponent</span>
        <span>Margin</span>
        <span className="text-right">Win %</span>
        {/* Player minutes remaining: 60 per starter, ticking down as each game is played. */}
        <span className="hidden text-right xl:block" title="Your player minutes remaining: 60 per starter, ticking down as each game is played">
          My PMR
        </span>
        <span className="hidden text-right xl:block" title="Your opponent's player minutes remaining">
          Opp. PMR
        </span>
        <span />
      </div>
      {rows.map(({ league, key, before, margin, status, odds, lineup }) => {
        const isOpen = open.has(key);
        const nameId = `league-${key.replace(/\W/g, '-')}`;
        const close = margin != null && Math.abs(margin) < CLOSE_MARGIN;
        const ahead = before ? before.margin > 0 : status.leading;
        const tone = ahead == null ? 'none' : close ? 'close' : ahead ? 'up' : 'down';
        return (
          <article
            key={key}
            aria-labelledby={nameId}
            data-lineup={lineup.health}
            className={`border-b border-l-4 border-b-slate-800 last:border-b-0 ${
              lineup.health === 'red' ? 'border-l-rose-500' : lineup.health === 'yellow' ? 'border-l-amber-400' : 'border-l-emerald-500'
            }`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${nameId}-details`}
              onClick={() => toggle(key)}
              className={`${columns} w-full px-4 py-3 text-left text-sm transition hover:bg-slate-800/60 ${
                lineup.health === 'red' ? 'bg-rose-950/40' : lineup.health === 'yellow' ? 'bg-amber-950/25' : ''
              }`}
            >
              <span className="line-clamp-2 min-w-0 sm:line-clamp-none sm:truncate">
                <span id={nameId} className="font-medium">
                  {league.name}
                </span>
                <span className="text-slate-400">
                  {' · '}
                  {league.matchup?.allPlay ? 'all-play' : PLATFORM_LABEL[league.platform]}
                </span>
                <span className="sr-only">, {HEALTH_TEXT[lineup.health]}</span>
                {lineup.issues.length > 0 && (
                  <span className={`block truncate text-xs ${lineup.health === 'red' ? 'text-rose-300' : 'text-amber-300'}`}>
                    {lineup.issues.map((i) => i.label).join(' · ')}
                  </span>
                )}
              </span>
              {before ? (
                <span className="text-right tabular-nums text-slate-300" title="Projected: no one has played yet">
                  <span className="text-base font-semibold">{pts(before.me)}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-slate-400">proj.</span>
                </span>
              ) : (
                <span
                  className={`text-right text-base font-semibold tabular-nums ${
                    tone === 'none' ? 'text-slate-100' : status.leading ? 'text-emerald-400' : 'text-rose-300'
                  }`}
                >
                  {league.matchup ? pts(league.matchup.me.points) : '—'}
                </span>
              )}
              <span className="hidden text-right tabular-nums text-slate-400 sm:block">{opponentCell(league)}</span>
              <span className="flex items-center gap-2">
                <span className="hidden h-1.5 flex-1 rounded-full bg-track sm:block" aria-hidden="true">
                  {margin != null && (
                    <span
                      className={`block h-1.5 rounded-full ${tone === 'close' ? 'bg-amber-400' : tone === 'up' ? 'bg-emerald-500' : 'bg-rose-500'} ${before ? 'opacity-50' : ''}`}
                      style={{ width: `${Math.max(4, (Math.abs(margin) / widest) * 100)}%` }}
                    />
                  )}
                </span>
                <span className={`w-12 text-right tabular-nums ${tone === 'close' ? 'text-amber-300' : 'text-slate-300'}`}>
                  {margin != null ? signed(margin) : ''}
                </span>
                <span className="sr-only">
                  {tone === 'none' ? 'no matchup' : `${before ? 'projected to ' : ''}${ahead ? (before ? 'win' : 'winning') : before ? 'lose' : 'losing'}${close ? ', close' : ''}`}
                </span>
              </span>
              {/* Chance to win from the live projections and how much of the week is left. */}
              <span className="text-right text-sm tabular-nums text-slate-300">
                {odds != null ? `${Math.round(odds * 100)}%` : '—'}
                <span className="sr-only"> to win</span>
              </span>
              <span className="hidden text-right text-sm tabular-nums text-slate-100 xl:block">
                {league.matchup?.me.minutesLeft ?? '—'}
                <span className="sr-only"> player minutes remaining for you</span>
              </span>
              <span className="hidden text-right text-sm tabular-nums text-slate-400 xl:block">
                {league.matchup?.opponent?.minutesLeft ?? '—'}
                <span className="sr-only"> for your opponent</span>
              </span>
              <ChevronIcon className={`text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div id={`${nameId}-details`} hidden={!isOpen}>
              {isOpen && <LeagueDetails league={league} issues={lineup.issues} onEdit={league.manual && onEdit ? () => onEdit(league.leagueId) : undefined} />}
            </div>
          </article>
        );
      })}
    </section>
  );
}
