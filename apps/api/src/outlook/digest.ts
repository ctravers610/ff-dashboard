// The season so far from every finished game: how lucky each team has been,
// and the league's superlatives. Pure functions over the weekly scores; the
// loaders in index.ts add what only some platforms can tell (benches, pickups,
// trades).

import type { Award, LuckRow } from '@ffd/shared';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A finished head-to-head game. */
export interface PlayedGame {
  week: number;
  a: string;
  b: string;
  pa: number;
  pb: number;
}

export interface Named {
  teamId: string;
  name: string;
}

/** Each team's actual and all-play records from the games themselves; luckiest first. */
export function luckTable(teams: Named[], games: PlayedGame[], myTeamId: string): LuckRow[] {
  const rows = new Map<string, LuckRow>(
    teams.map((t) => [
      t.teamId,
      { teamName: t.name, isMe: t.teamId === myTeamId, wins: 0, losses: 0, ties: 0, allPlayWins: 0, allPlayLosses: 0, expectedWins: 0, luck: 0, pointsFor: 0, pointsAgainst: 0 },
    ]),
  );
  const weeks = [...new Set(games.map((g) => g.week))];
  for (const week of weeks) {
    // Everyone who played that week, with their score.
    const scores = new Map<string, number>();
    for (const g of games.filter((x) => x.week === week)) {
      scores.set(g.a, g.pa);
      scores.set(g.b, g.pb);
      const [a, b] = [rows.get(g.a), rows.get(g.b)];
      if (!a || !b) continue;
      a.pointsFor += g.pa;
      a.pointsAgainst += g.pb;
      b.pointsFor += g.pb;
      b.pointsAgainst += g.pa;
      if (g.pa > g.pb) (a.wins++, b.losses++);
      else if (g.pb > g.pa) (b.wins++, a.losses++);
      else (a.ties++, b.ties++);
    }
    // All-play: beat everyone you outscored; a week's expected win is that share of the league.
    for (const [id, score] of scores) {
      const row = rows.get(id);
      if (!row) continue;
      const others = [...scores].filter(([other]) => other !== id);
      const beat = others.filter(([, s]) => s < score).length + others.filter(([, s]) => s === score).length / 2;
      row.allPlayWins += beat;
      row.allPlayLosses += others.length - beat;
      row.expectedWins += others.length ? beat / others.length : 0;
    }
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      allPlayWins: round1(r.allPlayWins),
      allPlayLosses: round1(r.allPlayLosses),
      expectedWins: round1(r.expectedWins),
      luck: round1(r.wins + r.ties / 2 - r.expectedWins),
      pointsFor: round1(r.pointsFor),
      pointsAgainst: round1(r.pointsAgainst),
    }))
    .sort((x, y) => y.luck - x.luck);
}

/** What only some platforms can tell, by team id. */
export interface AwardExtras {
  benchLeft?: Map<string, number>; // points left on the bench, season total
  bestPickup?: { teamId: string; player: string; points: number } | null; // started points since the claim
  worstTrade?: { loser: string; winner: string; margin: number; wins: number } | null; // team names
}

const wins = (n: number) => `${Math.abs(n).toFixed(1)} ${Math.abs(n) === 1 ? 'win' : 'wins'}`;

/** The league's superlatives so far. Needs at least two finished weeks to say anything. */
export function seasonAwards(teams: Named[], games: PlayedGame[], luck: LuckRow[], myTeamId: string, extras: AwardExtras = {}): Award[] {
  if (new Set(games.map((g) => g.week)).size < 2) return [];
  const name = (id: string) => teams.find((t) => t.teamId === id)?.name ?? id;
  const award = (title: string, teamId: string, detail: string): Award => ({ title, teamName: name(teamId), isMe: teamId === myTeamId, detail });
  const byName = (title: string, teamName: string, detail: string): Award => ({ title, teamName, isMe: luck.find((r) => r.teamName === teamName)?.isMe ?? false, detail });
  const out: Award[] = [];

  const luckiest = luck[0];
  const unluckiest = luck.at(-1);
  if (luckiest && luckiest.luck >= 0.5) out.push(byName('Luckiest', luckiest.teamName, `${wins(luckiest.luck)} more than their scoring earned`));
  if (unluckiest && unluckiest.luck <= -0.5) out.push(byName('Unluckiest', unluckiest.teamName, `${wins(unluckiest.luck)} fewer than their scoring earned`));
  const magnet = [...luck].sort((x, y) => y.pointsAgainst - x.pointsAgainst)[0];
  if (magnet) out.push(byName('Opponents’ favorite target', magnet.teamName, `${magnet.pointsAgainst.toFixed(1)} points scored against them`));

  const sides = games.flatMap((g) => [
    { team: g.a, other: g.b, pts: g.pa, opp: g.pb, week: g.week },
    { team: g.b, other: g.a, pts: g.pb, opp: g.pa, week: g.week },
  ]);
  const high = [...sides].sort((x, y) => y.pts - x.pts)[0];
  if (high) out.push(award('Highest score', high.team, `${high.pts.toFixed(1)} in week ${high.week}`));
  const blowout = [...sides].sort((x, y) => y.pts - y.opp - (x.pts - x.opp))[0];
  if (blowout) out.push(award('Biggest blowout', blowout.team, `beat ${name(blowout.other)} by ${(blowout.pts - blowout.opp).toFixed(1)} in week ${blowout.week}`));
  const heartbreak = sides.filter((s) => s.pts < s.opp).sort((x, y) => y.pts - y.opp - (x.pts - x.opp))[0];
  if (heartbreak) out.push(award('Heartbreaker', heartbreak.team, `lost to ${name(heartbreak.other)} by ${(heartbreak.opp - heartbreak.pts).toFixed(1)} in week ${heartbreak.week}`));

  const bench = [...(extras.benchLeft ?? [])].sort((x, y) => y[1] - x[1])[0];
  if (bench && bench[1] > 0) out.push(award('Benchwarmer', bench[0], `${bench[1].toFixed(1)} points left on the bench`));
  if (extras.bestPickup) out.push(award('Best pickup', extras.bestPickup.teamId, `${extras.bestPickup.player}: ${extras.bestPickup.points.toFixed(1)} started points since the claim`));
  if (extras.worstTrade) {
    const t = extras.worstTrade;
    out.push(byName('Worst trade', t.loser, `down ${t.margin.toFixed(0)} points over replacement to ${t.winner} (about ${wins(t.wins)})`));
  }
  return out;
}
