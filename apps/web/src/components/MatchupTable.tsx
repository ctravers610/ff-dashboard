import type { LeagueSummary } from '@ffd/shared';
import { useState } from 'react';
import { CLOSE_MARGIN, matchupMargin, matchupStatus, ordinal, PLATFORM_LABEL, pts, signed } from '../format';
import { ChevronIcon } from './icons';
import { LeagueDetails } from './LeagueDetails';

const leagueKey = (l: LeagueSummary) => `${l.platform}:${l.leagueId}`;

function opponentCell(l: LeagueSummary): string {
  const m = l.matchup;
  if (!m) return '—';
  if (m.allPlay) return `${ordinal(m.allPlay.myRank)} of ${m.allPlay.teams.length}`;
  return m.opponent ? pts(m.opponent.points) : 'Bye';
}

// Every league on one screen, biggest lead first. Each row opens to the
// league's details (lineups, standings, roster).
export function MatchupTable({ leagues, onEdit }: { leagues: LeagueSummary[]; onEdit: (leagueId: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = leagues
    .map((league) => ({ league, key: leagueKey(league), margin: matchupMargin(league.matchup), status: matchupStatus(league.matchup) }))
    .sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity));
  const widest = Math.max(1, ...rows.map((r) => Math.abs(r.margin ?? 0)));

  // Shared column layout for the header and every row; the opponent and bar columns appear from sm up.
  const columns = 'grid grid-cols-[minmax(0,1fr)_auto_auto_1rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1.7fr)_5rem_6rem_minmax(0,1fr)_1rem]';

  return (
    <section aria-label="Matchups" className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className={`${columns} border-b border-slate-800 px-4 py-2 text-xs text-slate-400`} aria-hidden="true">
        <span>League</span>
        <span className="text-right">Me</span>
        <span className="hidden text-right sm:block">Opponent</span>
        <span>Margin</span>
        <span />
      </div>
      {rows.map(({ league, key, margin, status }) => {
        const isOpen = open.has(key);
        const nameId = `league-${key.replace(/\W/g, '-')}`;
        const close = margin != null && Math.abs(margin) < CLOSE_MARGIN;
        const tone = status.leading == null ? 'none' : close ? 'close' : status.leading ? 'up' : 'down';
        return (
          <article key={key} aria-labelledby={nameId} className="border-b border-slate-800 last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${nameId}-details`}
              onClick={() => toggle(key)}
              className={`${columns} w-full px-4 py-3 text-left text-sm transition hover:bg-slate-800/60`}
            >
              <span className="line-clamp-2 min-w-0 sm:line-clamp-none sm:truncate">
                <span id={nameId} className="font-medium">
                  {league.name}
                </span>
                <span className="text-slate-400">
                  {' · '}
                  {league.matchup?.allPlay ? 'all-play' : PLATFORM_LABEL[league.platform]}
                </span>
              </span>
              <span
                className={`text-right text-base font-semibold tabular-nums ${
                  tone === 'none' ? 'text-slate-100' : status.leading ? 'text-emerald-400' : 'text-rose-300'
                }`}
              >
                {league.matchup ? pts(league.matchup.me.points) : '—'}
              </span>
              <span className="hidden text-right tabular-nums text-slate-400 sm:block">{opponentCell(league)}</span>
              <span className="flex items-center gap-2">
                <span className="hidden h-1.5 flex-1 rounded-full bg-track sm:block" aria-hidden="true">
                  {margin != null && (
                    <span
                      className={`block h-1.5 rounded-full ${tone === 'close' ? 'bg-amber-400' : tone === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.max(4, (Math.abs(margin) / widest) * 100)}%` }}
                    />
                  )}
                </span>
                <span className={`w-12 text-right tabular-nums ${tone === 'close' ? 'text-amber-300' : 'text-slate-300'}`}>
                  {margin != null ? signed(margin) : ''}
                </span>
                <span className="sr-only">
                  {tone === 'none' ? 'no matchup' : `${status.leading ? 'winning' : 'losing'}${close ? ', close' : ''}`}
                </span>
              </span>
              <ChevronIcon className={`text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div id={`${nameId}-details`} hidden={!isOpen}>
              {isOpen && <LeagueDetails league={league} onEdit={league.manual ? () => onEdit(league.leagueId) : undefined} />}
            </div>
          </article>
        );
      })}
    </section>
  );
}
