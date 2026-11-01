import { arrangeWall, cardSpans, latestPlay, winProbability, type CardSize, type DashboardResponse, type LeagueSummary, type WallCard } from '@ffd/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useDemo, useLive, useWaivers, useWinChance } from '../../api';
import { leagueLabel, matchupOver } from '../../format';
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

// Spelled out so Tailwind sees them; a card's width in twelfths of the wall.
const MID_SPAN: Record<number, string> = { 6: 'md:col-span-6', 12: 'md:col-span-12' };
const WIDE_SPAN: Record<number, string> = { 3: 'xl:col-span-3', 4: 'xl:col-span-4', 6: 'xl:col-span-6', 8: 'xl:col-span-8', 12: 'xl:col-span-12' };

// Each card's width and the grid's rows: the rows with live matchups share any spare
// height, and the small cards' rows stay as short as they can.
function wallLayout(cards: { key: string; size: CardSize }[], across: number) {
  const spans = new Map<string, number>();
  const rows: string[] = [];
  const place = (group: { key: string }[], widths: number[], row: string) => {
    group.forEach((c, i) => spans.set(c.key, widths[i]!));
    const count = widths.reduce((sum, w) => sum + w, 0) / 12;
    for (let i = 0; i < count; i++) rows.push(row);
  };
  const [focus, regular, small] = (['focus', 'regular', 'small'] as const).map((size) => cards.filter((c) => c.size === size)) as [typeof cards, typeof cards, typeof cards];
  // One toss-up with a card or two beside it, rather than each stretched across its own row.
  const shareRow = across === 3 && focus.length === 1 && (regular.length === 1 || regular.length === 2);
  if (shareRow) place([...focus, ...regular], regular.length === 1 ? [8, 4] : [6, 3, 3], 'auto');
  else {
    place(focus, cardSpans(focus.length, across), 'auto');
    place(regular, cardSpans(regular.length, across), 'auto');
  }
  place(small, cardSpans(small.length, across), 'min-content');
  return { spans, rows: rows.join(' ') };
}

// The home page: a wall of team cards to leave up during the games. The closer a
// matchup, the earlier and bigger its card, and that's worked out afresh with every
// refresh, so a game that gets interesting comes forward and one that's settled gives
// way. The feed and a league's details open beside the wall (over it, on a phone).
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

  const lastCards = useRef<WallCard[]>([]);
  const arranged = useMemo(() => {
    const next = arrangeWall(
      data.leagues.map((l) => ({ key: leagueKey(l), chance: winProbability(l.matchup), over: matchupOver(l.matchup) })),
      lastCards.current,
    );
    lastCards.current = next;
    return next;
  }, [data.leagues]);
  // With nothing left in doubt there's nothing to make room for, so no card needs to shrink.
  const anyInDoubt = arranged.some((c) => c.size !== 'small');
  const cards = useMemo(() => arranged.map((c) => ({ key: c.key, size: anyInDoubt ? c.size : ('regular' as const) })), [arranged, anyInDoubt]);
  const leagueByKey = new Map(data.leagues.map((l) => [leagueKey(l), l]));

  // Three across at most, or two beside the panel.
  const mid = wallLayout(cards, 2);
  const wide = wallLayout(cards, open ? 2 : 3);
  const gridRows = { '--wall-rows-mid': mid.rows, '--wall-rows-wide': wide.rows } as CSSProperties;

  // When the arrangement changes, each card slides from where it was, so you can
  // follow it. This render's DOM is still the old one, so that's where it was.
  const wallRef = useRef<HTMLElement>(null);
  const was = new Map(Array.from(wallRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [], (el) => [el.dataset.card!, el.getBoundingClientRect()]));
  const focused = document.activeElement;
  const arrangement = cards.map((c) => `${c.key}=${c.size}`).join();
  useLayoutEffect(() => {
    // Moving a card in the page can drop the keyboard's place on it.
    if (focused instanceof HTMLElement && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    wallRef.current?.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      const from = was.get(el.dataset.card!);
      if (!from) return;
      const to = el.getBoundingClientRect();
      const [x, y] = [from.left - to.left, from.top - to.top];
      if (x || y) el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: 500, easing: 'ease-in-out' });
    });
    // Only for a new arrangement: a refresh that changes nothing, or opening the panel, shouldn't slide anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangement]);

  const details =openLeague && lineupHealth(openLeague, waivers?.leagues.find((w) => w.platform === openLeague.platform && w.leagueId === openLeague.leagueId));
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
        {/* Clipped so a card sliding to a wider spot can't widen the page; the padding leaves room for focus rings. */}
        <main className="-mx-1 flex min-w-0 flex-1 flex-col gap-3 overflow-x-clip px-1">
          {data.leagues.length > 0 && (
            <section
              ref={wallRef}
              aria-label="Your teams"
              style={gridRows}
              className="grid flex-1 grid-cols-1 content-start gap-3 md:grid-cols-12 md:content-normal md:[grid-template-rows:var(--wall-rows-mid)] xl:[grid-template-rows:var(--wall-rows-wide)]"
            >
              {cards.map(({ key, size }) => {
                const league = leagueByKey.get(key)!;
                const lineup =lineupHealth(league, waivers?.leagues.find((w) => w.platform === league.platform && w.leagueId === league.leagueId));
                const isOpen = shown === key;
                return (
                  <TeamCard
                    key={key}
                    cardKey={key}
                    size={size}
                    span={`${MID_SPAN[mid.spans.get(key)!]} ${WIDE_SPAN[wide.spans.get(key)!]}`}
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
