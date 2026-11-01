import { winProbability, type BoardRow, type LeagueSummary, type MatchupSide, type WinChancePoint } from '@ffd/shared';
import { allPlayGap, clockTime, gamesLeft, leagueLabel, leagueSubtitle, matchupOver, matchupStatus, ordinal, PLATFORM_LABEL, pregame, pts, shortName, signed, verdict, type Tone } from '../../format';
import { HEALTH_TEXT, type Health, type LineupIssue } from '../../lineupHealth';
import { Sparkline } from './Sparkline';

const WASH: Record<Tone, string> = { win: 'bg-win-wash', toss: 'bg-toss-wash', lose: 'bg-lose-wash', none: 'bg-slate-900' };
const INK: Record<Tone, string> = { win: 'text-emerald-400', toss: 'text-amber-300', lose: 'text-rose-300', none: 'text-slate-300' };

function ScoreRow({ name, points, projected, mine, title }: { name: string; points: number; projected: number | null | undefined; mine: boolean; title?: string }) {
  return (
    <>
      <span className="truncate text-sm text-slate-300">{name}</span>
      <span title={title} className={`text-right text-2xl tabular-nums ${mine ? 'font-bold' : 'font-medium text-slate-300'}`}>
        {pts(points)}
      </span>
      <span className="whitespace-nowrap text-right text-xs tabular-nums text-slate-300">{projected != null ? `proj ${pts(projected)}` : ''}</span>
    </>
  );
}

// One dot per starter: done, playing right now, or yet to play.
function GamesLeft({ who, side }: { who: string; side: MatchupSide }) {
  const left = gamesLeft(side);
  if (!left) return null;
  const dots = [...Array<string>(left.done).fill('bg-slate-600'), ...Array<string>(left.live).fill('bg-slate-100 motion-safe:animate-pulse'), ...Array<string>(left.pre).fill('border-[1.5px] border-slate-400')];
  const text = left.live + left.pre === 0 ? 'all done' : `${left.live} live, ${left.pre} to come`;
  return (
    <>
      <span>{who}</span>
      <span aria-hidden="true" className="flex gap-[3px]">
        {dots.map((dot, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        ))}
      </span>
      <span className="truncate">{text}</span>
    </>
  );
}

function LastPlay({ play }: { play: BoardRow }) {
  const net = play.net == null ? 'pending' : signed(play.net);
  const tone = play.net == null || play.net === 0 ? 'text-slate-300' : play.net > 0 ? 'text-emerald-400' : 'text-rose-300';
  const fresh = Date.now() - new Date(play.at).getTime() < 60_000;
  return (
    // A new key restarts the flash whenever the play changes.
    <span key={`${play.key}:${play.at}`} className={`mt-auto flex min-w-0 items-baseline gap-2 rounded border-t border-slate-700 px-0.5 pt-2 text-sm ${fresh ? 'play-flash' : ''}`}>
      <span className="tabular-nums text-slate-300">{clockTime(play.at)}</span>
      <span className={`whitespace-nowrap font-semibold tabular-nums ${tone}`}>
        {shortName(play.player.name)} {net}
      </span>
      <span className="truncate text-slate-300">{play.stats}</span>
    </span>
  );
}

const ISSUE_INK: Record<Exclude<Health, 'green'>, string> = { red: 'border-rose-400 text-rose-200', yellow: 'border-amber-300 text-amber-200' };

// One league at a glance, from across the room: the chance to win is the biggest
// thing on it, and the only thing that sets its color. The card stays in the same
// spot all game, and opens to the league's details.
export function TeamCard({
  league,
  health,
  issues,
  chances,
  play,
  open,
  panelId,
  onOpen,
}: {
  league: LeagueSummary;
  health: Health;
  issues: LineupIssue[];
  chances: WinChancePoint[];
  play: BoardRow | null;
  open: boolean;
  panelId: string;
  onOpen: () => void;
}) {
  const m = league.matchup;
  const label = leagueLabel(league);
  const chance = winProbability(m);
  const { word, tone } = verdict(chance, matchupOver(m));
  const before = pregame(m);
  const { leading } = matchupStatus(m);
  const nameId = `card-${league.platform}-${league.leagueId.replace(/\W/g, '-')}`;
  const snapshot = league.manual?.matchupCapturedAt && !league.manual.liveScored;
  const gap = m?.allPlay ? allPlayGap(m.allPlay) : null;

  return (
    <article aria-labelledby={nameId} data-lineup={health} className="flex min-w-0">
      <button
        type="button"
        id={`${nameId}-open`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onOpen}
        className={`flex w-full min-w-0 cursor-pointer flex-col gap-2.5 rounded-2xl border p-4 text-left transition ${WASH[tone]} ${open ? 'border-slate-100' : 'border-slate-700 hover:border-slate-400'}`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span id={nameId} className="block truncate text-lg font-semibold">
              {label.title}
            </span>
            <span className="block truncate text-xs text-slate-300">
              {leagueSubtitle(label, m?.allPlay ? 'all-play' : PLATFORM_LABEL[league.platform])}
            </span>
            {snapshot && <span className="block text-xs text-slate-300">Snapshot, not live</span>}
          </span>
          <span className="shrink-0 text-right">
            {chance != null && (
              <span className={`block text-5xl font-bold leading-none tracking-tight tabular-nums ${INK[tone]}`}>
                {Math.round(chance * 100)}%<span className="sr-only"> to win</span>
              </span>
            )}
            <span className={`mt-1 block text-sm font-semibold ${INK[tone]}`}>{word}</span>
          </span>
        </span>

        {/* Yours to fix, so it stands apart from how the game is going. */}
        <span className="sr-only">, {HEALTH_TEXT[health]}</span>
        {issues.length > 0 && health !== 'green' && (
          <span className={`block truncate border-l-2 pl-2 text-xs font-medium ${ISSUE_INK[health]}`}>{issues.map((i) => i.label).join(' · ')}</span>
        )}

        {m?.allPlay ? (
          <span className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3.5 gap-y-0.5">
            <ScoreRow name="You" points={m.me.points} projected={m.me.projected} mine />
            <span className="col-span-3 text-sm text-slate-300">
              {ordinal(m.allPlay.myRank)} of {m.allPlay.teams.length} · top {m.allPlay.winSlots} win
              {gap != null && ` · ${pts(Math.abs(gap))} ${gap >= 0 ? 'above' : 'below'} the line`}
            </span>
          </span>
        ) : m?.opponent ? (
          <span className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3.5 gap-y-0.5">
            {/* Before kickoff the scores are all 0, so the projections stand in for them. */}
            <ScoreRow name="You" points={before?.me ?? m.me.points} projected={before ? null : m.me.projected} mine title={before ? 'Projected: no one has played yet' : undefined} />
            <ScoreRow name={m.opponent.teamName} points={before?.opponent ?? m.opponent.points} projected={before ? null : m.opponent.projected} mine={false} title={before ? 'Projected: no one has played yet' : undefined} />
            {before && <span className="col-span-3 text-xs text-slate-300">Projected: no one has played yet</span>}
            <span className="sr-only">{!before && (leading ? ', leading' : ', trailing')}</span>
          </span>
        ) : (
          <span className="text-sm text-slate-300">{league.manual ? 'Paste this week’s Live Scoring page to see your matchup' : 'No matchup this week'}</span>
        )}

        {chance != null && <Sparkline points={chances} now={chance} />}

        {m && (
          <span className="grid grid-cols-[2.6rem_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-xs text-slate-300">
            <GamesLeft who="You" side={m.me} />
            {m.opponent && <GamesLeft who="Them" side={m.opponent} />}
          </span>
        )}

        {play && <LastPlay play={play} />}
      </button>
    </article>
  );
}
