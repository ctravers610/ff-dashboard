import { latestPlay, type DashboardResponse, type LeagueSummary } from '@ffd/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDemo, useLive, useWaivers, useWinChance } from '../../api';
import { leagueLabel } from '../../format';
import { lineupHealth } from '../../lineupHealth';
import { useShortcut } from '../../shortcuts';
import { DataStatus } from '../DataStatus';
import { LeagueDetails } from '../LeagueDetails';
import { LiveFeed } from '../live/LiveFeed';
import { TeamCard } from './TeamCard';
import { WeekSummary } from './WeekSummary';

const leagueKey = (l: LeagueSummary) => `${l.platform}:${l.leagueId}`;

const FEED_KEY = 'ffd:feed-open';
function feedWasOpen() {
  try {
    return window.localStorage.getItem(FEED_KEY) === '1';
  } catch {
    return false; // storage can be blocked; the feed just starts closed
  }
}
function rememberFeed(open: boolean) {
  try {
    if (open) window.localStorage.setItem(FEED_KEY, '1');
    else window.localStorage.removeItem(FEED_KEY);
  } catch {
    // Not remembered, then.
  }
}

// What's in the panel beside the cards: the live feed, or one league's details.
type Panel = 'feed' | { league: string } | null;

// The home page: a wall of team cards to leave up during the games. Every league
// keeps its spot, so you learn where each one is, and the feed and a league's
// details open beside the wall (over it, on a phone) without moving anything else.
export function Wall({ data, onEdit, onAdd }: { data: DashboardResponse; onEdit?: (leagueId: string) => void; onAdd: () => void }) {
  const demo = useDemo();
  const waivers = useWaivers().data;
  const live = useLive().data;
  const chances = useWinChance().data;
  const [panel, setPanel] = useState<Panel>(() => (feedWasOpen() ? 'feed' : null));
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const openLeague = typeof panel === 'object' && panel ? data.leagues.find((l) => leagueKey(l) === panel.league) : undefined;
  const open = panel === 'feed' || !!openLeague;

  const close = () => {
    if (panel === 'feed') rememberFeed(false);
    setPanel(null);
    returnTo.current?.focus();
  };
  useShortcut((key) => {
    if (key !== 'Escape' || !open) return false;
    close();
    return true;
  });

  // Reading goes on in the panel, so keyboard and screen reader users land there.
  const shown = panel === 'feed' ? 'feed' : (openLeague && leagueKey(openLeague)) ?? null;
  useEffect(() => {
    if (shown) panelRef.current?.focus({ preventScroll: true });
  }, [shown]);

  const plays = useMemo(() => {
    const now = Date.now();
    return new Map(data.leagues.map((l) => [leagueKey(l), latestPlay(live?.events ?? [], leagueKey(l), now)]));
  }, [data.leagues, live?.events]);

  // Three across when there's room for six leagues to fill a screen; two for a few, or beside the panel.
  const columns = open || data.leagues.length <= 4 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3';
  const details = openLeague && lineupHealth(openLeague, waivers?.leagues.find((w) => w.platform === openLeague.platform && w.leagueId === openLeague.leagueId));
  const feedOpen = panel === 'feed';

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {data.leagues.length > 0 && <WeekSummary data={data} />}
        <button
          type="button"
          aria-pressed={feedOpen}
          onClick={(e) => {
            returnTo.current = e.currentTarget;
            rememberFeed(!feedOpen);
            setPanel(feedOpen ? null : 'feed');
          }}
          className={`ml-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${feedOpen ? 'border-slate-100 bg-slate-100 text-slate-900' : 'border-slate-700 text-slate-200 hover:bg-slate-800'}`}
        >
          {live?.live && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />}
          All plays
        </button>
      </div>

      <div className="flex flex-1 items-stretch gap-3">
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          {data.leagues.length > 0 && (
            <section aria-label="Your teams" className={`grid flex-1 grid-cols-1 gap-3 ${columns}`}>
              {data.leagues.map((league) => {
                const key = leagueKey(league);
                const lineup = lineupHealth(league, waivers?.leagues.find((w) => w.platform === league.platform && w.leagueId === league.leagueId));
                const isOpen = shown === key;
                return (
                  <TeamCard
                    key={key}
                    league={league}
                    health={lineup.health}
                    issues={lineup.issues}
                    chances={chances?.week === data.week ? (chances.leagues[key] ?? []) : []}
                    play={plays.get(key) ?? null}
                    open={isOpen}
                    panelId="wall-panel"
                    onOpen={() => {
                      returnTo.current = document.getElementById(`card-${league.platform}-${league.leagueId.replace(/\W/g, '-')}-open`);
                      if (isOpen) close();
                      else setPanel({ league: key });
                    }}
                  />
                );
              })}
            </section>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <DataStatus data={data} />
            {!demo && (
              <button type="button" onClick={onAdd} className="rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100">
                + Add league
              </button>
            )}
          </div>
        </main>

        {open && (
          // Stays in view beside the wall and scrolls on its own; covers the screen on a phone.
          <aside className="fixed inset-0 z-30 flex flex-col bg-slate-950 lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:w-[34rem] lg:shrink-0 lg:self-start">
            <div
              ref={panelRef}
              id="wall-panel"
              tabIndex={-1}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 outline-none"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2">
                {openLeague && <p className="truncate font-semibold">{leagueLabel(openLeague).title}</p>}
                <button type="button" onClick={close} className="ml-auto min-h-9 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-200 hover:bg-slate-800">
                  Close
                </button>
              </div>
              {openLeague && details ? (
                <section aria-label={`${leagueLabel(openLeague).title} details`}>
                  <LeagueDetails key={leagueKey(openLeague)} league={openLeague} issues={details.issues} onEdit={openLeague.manual && onEdit ? () => onEdit(openLeague.leagueId) : undefined} />
                </section>
              ) : (
                <LiveFeed />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
