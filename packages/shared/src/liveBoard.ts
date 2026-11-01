// Turns the live feed's events into the board you read. The server logs whatever
// changed every 30 seconds, so one drive arrives in pieces and a site catching up
// arrives as news of its own. Here those become one row per player's recent run,
// with scoring plays kept apart, and each number is the change in your margin.

import type { LiveEvent, LiveEventLeague, Player } from './index';

// Stat changes worth describing, in the order they read best.
export const LIVE_STATS: [key: string, one: string, many: string][] = [
  ['pass_td', 'pass TD', 'pass TDs'],
  ['pass_yd', 'pass yd', 'pass yds'],
  ['pass_int', 'INT thrown', 'INTs thrown'],
  ['rush_td', 'rush TD', 'rush TDs'],
  ['rush_yd', 'rush yd', 'rush yds'],
  ['rec', 'catch', 'catches'],
  ['rec_td', 'rec TD', 'rec TDs'],
  ['rec_yd', 'rec yd', 'rec yds'],
  ['fum_lost', 'fumble lost', 'fumbles lost'],
  ['pass_2pt', '2-pt pass', '2-pt passes'],
  ['rush_2pt', '2-pt run', '2-pt runs'],
  ['rec_2pt', '2-pt catch', '2-pt catches'],
  ['fgm', 'FG made', 'FGs made'],
  ['fgmiss', 'FG missed', 'FGs missed'],
  ['xpm', 'PAT', 'PATs'],
  ['xpmiss', 'PAT missed', 'PATs missed'],
  ['sack', 'sack', 'sacks'],
  ['int', 'INT', 'INTs'],
  ['fum_rec', 'fumble recovery', 'fumble recoveries'],
  ['def_td', 'defensive TD', 'defensive TDs'],
  ['def_st_td', 'return TD', 'return TDs'],
  ['safe', 'safety', 'safeties'],
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "1 catch, 14 rec yds" from stat changes. A negative is a stat correction. */
export function describeStats(changes: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, one, many] of LIVE_STATS) {
    const change = changes[key] ?? 0;
    if (change === 0) continue;
    parts.push(`${change > 0 ? '' : '−'}${Math.abs(change)} ${Math.abs(change) === 1 ? one : many}`);
  }
  return parts.join(', ');
}

const KEY_FOR_LABEL = new Map(LIVE_STATS.flatMap(([key, one, many]) => [[one, key], [many, key]] as [string, string][]));

/** The other way: stat changes from "1 catch, 14 rec yds". Empty for "scoring update". */
function parseStats(description: string): Record<string, number> {
  const changes: Record<string, number> = {};
  for (const stat of description.split(', ')) {
    const [, minus, amount, label] = /^(−?)([\d.]+) (.+)$/.exec(stat) ?? [];
    const key = label && KEY_FOR_LABEL.get(label);
    if (key) changes[key] = (minus ? -1 : 1) * Number(amount);
  }
  return changes;
}

// The stats worth noticing mid-scroll, like the "1 rec TD" in "1 catch, 1 rec TD, 24 rec yds".
const BIG_STAT = /\bTDs?\b|\bINTs?\b|fumble|2-pt|safet|FGs? made/;
/** A negative one is a correction, not a scoring play. */
export const isBigStat = (stat: string) => BIG_STAT.test(stat) && !stat.startsWith('−');

export interface BoardLine {
  leagueKey: string;
  leagueName: string;
  role: LiveEventLeague['role'];
  points: number; // what the player scored; marginChange says what it means for you
  pending: boolean; // that league's site hasn't caught up with his latest stats
}

/** A starter's points add to your margin and an opponent's take away. The bench shows what he scored, though it doesn't count. */
export const marginChange = (line: BoardLine) => (line.role === 'opponent' ? -line.points : line.points);

export interface BoardRow {
  key: number; // the row's first event, so it stays the same row as a run grows
  kind: 'run' | 'scoring' | 'correction' | 'calledBack';
  player: Player;
  stats: string;
  at: string; // the row's latest play
  lines: BoardLine[];
  net: number | null; // the change in your margin across leagues; null when nothing counted has come in yet
  benchOnly: boolean;
}

export interface Board {
  active: BoardRow[]; // runs still going, latest first
  scoring: BoardRow[]; // scoring plays and their corrections, latest first
  earlier: BoardRow[]; // runs that have gone quiet, latest first
  recentNet: number | null; // the change in your margin over RECENT_MINUTES; null when nothing has happened
}

export const RECENT_MINUTES = 5;
// Longer than a play takes, shorter than sitting out the other team's drive, so a run is roughly a drive.
const RUN_GAP_MS = 10 * 60_000;

// A play and the correction that exactly undoes it add up to nothing, so they
// share one crossed-out row. Small plays don't need this: their run just adds up.
function findCalledBack(newestFirst: LiveEvent[]) {
  const undone = new Set<number>();
  const playFor = new Map<number, string>();
  newestFirst.forEach((e, i) => {
    if (undone.has(e.id)) return;
    const stats = e.description.split(', ');
    if (!stats.some((s) => s.startsWith('−') && BIG_STAT.test(s))) return;
    const undoes = stats.map((s) => (s.startsWith('−') ? s.slice(1) : `−${s}`)).join(', ');
    const play = newestFirst.slice(i + 1).find((o) => !undone.has(o.id) && o.player.name === e.player.name && o.description === undoes);
    if (!play) return;
    undone.add(play.id);
    playFor.set(e.id, play.description);
  });
  return { undone, playFor };
}

interface Draft extends Omit<BoardRow, 'stats' | 'net' | 'benchOnly'> {
  stats: string | null; // null for a run, whose stats add up from `changes`
  changes: Record<string, number>;
  hadStats: boolean;
  lastId: number; // the feed's order: plays from one look share a time, but never an id
}

function addPoints(row: Draft, l: LiveEventLeague) {
  let line = row.lines.find((x) => x.leagueKey === l.leagueKey);
  if (!line) row.lines.push((line = { leagueKey: l.leagueKey, leagueName: l.leagueName, role: l.role, points: 0, pending: false }));
  line.pending = l.points == null;
  line.points = round1(line.points + (l.points ?? 0));
}

// What a row says when no stats describe it: a defense's points allowed, or a site revising its score.
function statlessText(row: Draft) {
  if (row.hadStats) return 'No change in stats';
  if (row.player.position !== 'DEF') return 'Scoring update';
  return row.lines.some((l) => l.points < 0) ? 'Gave up more points' : 'Allowed fewer points';
}

function finish(row: Draft): BoardRow {
  const counted = row.lines.filter((l) => l.role !== 'bench');
  const known = counted.filter((l) => !(l.pending && l.points === 0));
  return {
    key: row.key,
    kind: row.kind,
    player: row.player,
    stats: row.stats ?? (describeStats(row.changes) || statlessText(row)),
    at: row.at,
    lines: row.lines,
    net: known.length > 0 ? round1(known.reduce((sum, l) => sum + marginChange(l), 0)) : null,
    benchOnly: row.lines.length > 0 && counted.length === 0,
  };
}

/** The board for these events (newest first, as the feed sends them) at time `now`. */
export function buildBoard(newestFirst: LiveEvent[], now: number): Board {
  const { undone, playFor } = findCalledBack(newestFirst);
  const rows: Draft[] = [];
  const byPlayer = new Map<string, Draft[]>();

  for (const e of [...newestFirst].reverse()) {
    if (undone.has(e.id)) continue;
    const playerKey = `${e.player.name}|${e.player.position}`;
    const mine = byPlayer.get(playerKey) ?? [];
    byPlayer.set(playerKey, mine);

    const open = (kind: BoardRow['kind'], stats: string | null) => {
      const row: Draft = { key: e.id, kind, player: e.player, stats, at: e.at, lines: [], changes: {}, hadStats: false, lastId: e.id };
      rows.push(row);
      mine.push(row);
      return row;
    };
    // The player's run, if he's still on one.
    const runRow = () => {
      const run = mine.filter((r) => r.kind === 'run').pop();
      return run && new Date(e.at).getTime() - new Date(run.at).getTime() < RUN_GAP_MS ? run : open('run', null);
    };

    const play = playFor.get(e.id);
    if (play) {
      open('calledBack', play);
      continue;
    }

    const stats = e.description.split(', ');
    const changes = parseStats(e.description);
    const hasStats = Object.keys(changes).length > 0;
    const standsAlone = stats.some((s) => BIG_STAT.test(s));
    let row = standsAlone ? open(stats.some(isBigStat) ? 'scoring' : 'correction', e.description) : hasStats ? runRow() : undefined;

    for (const l of e.leagues) {
      // A site's total catches up on everything it had missed, so its points go
      // to the play that was waiting on them. That also means a site catching up
      // needs no row of its own, and doesn't count as the player doing something.
      const waiting = l.points == null ? [] : mine.filter((r) => r.lines.some((x) => x.leagueKey === l.leagueKey && x.pending));
      addPoints(waiting[0] ?? row ?? (row = runRow()), l);
      for (const r of waiting) for (const x of r.lines) if (x.leagueKey === l.leagueKey) x.pending = false;
    }
    if (!row) continue;

    row.at = e.at;
    row.lastId = e.id;
    if (!hasStats) continue;
    row.hadStats = true;
    for (const [key, change] of Object.entries(changes)) row.changes[key] = round1((row.changes[key] ?? 0) + change);
  }

  // A run that added up to nothing isn't a row: nothing moved, and nothing is still due.
  const shown = rows.filter((r) => r.kind !== 'run' || describeStats(r.changes) || r.lines.some((l) => l.pending || l.points !== 0));
  const latestFirst = (list: Draft[]) => list.sort((a, b) => b.lastId - a.lastId).map(finish);
  const going = (r: Draft) => now - new Date(r.at).getTime() < RUN_GAP_MS;
  const runs = shown.filter((r) => r.kind === 'run');

  const recent = newestFirst.filter((e) => now - new Date(e.at).getTime() < RECENT_MINUTES * 60_000);
  const recentLines = recent.flatMap((e) => e.leagues).filter((l) => l.role !== 'bench' && l.points != null);
  return {
    active: latestFirst(runs.filter(going)),
    scoring: latestFirst(shown.filter((r) => r.kind !== 'run')),
    earlier: latestFirst(runs.filter((r) => !going(r))),
    recentNet: recentLines.length > 0 ? round1(recentLines.reduce((sum, l) => sum + (l.role === 'opponent' ? -l.points! : l.points!), 0)) : null,
  };
}

/** The latest play that counted in one league, if any: its row on that league's own board. */
export function latestPlay(newestFirst: LiveEvent[], leagueKey: string, now: number): BoardRow | null {
  const events = newestFirst
    .map((e) => ({ ...e, leagues: e.leagues.filter((l) => l.leagueKey === leagueKey && l.role !== 'bench') }))
    .filter((e) => e.leagues.length > 0);
  const { active, scoring, earlier } = buildBoard(events, now);
  const rows = [...active, ...scoring, ...earlier].filter((r) => r.kind !== 'calledBack');
  return rows.reduce<BoardRow | null>((latest, r) => (!latest || r.at > latest.at ? r : latest), null);
}

/** Where a row's points landed, short enough for one line. The row expands to list them. */
export function rowWhere(row: BoardRow): string {
  const { lines } = row;
  const count = (role: BoardLine['role']) => lines.filter((l) => l.role === role).length;
  const [only] = lines;
  if (lines.length === 1 && only) {
    return only.role === 'opponent' ? `vs you in ${only.leagueName}` : only.role === 'bench' ? `${only.leagueName} · bench` : only.leagueName;
  }
  const pending = lines.filter((l) => l.pending).length;
  const parts = row.benchOnly ? [`on your bench in ${lines.length} leagues`] : count('opponent') === lines.length ? [`vs you in ${lines.length} leagues`] : [`${lines.length} leagues`, count('opponent') > 0 && `${count('opponent')} against you`, count('bench') > 0 && `${count('bench')} on your bench`];
  return [...parts, pending > 0 && `${pending} pending`].filter(Boolean).join(', ');
}
