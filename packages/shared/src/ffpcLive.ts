// Reads a copied FFPC Live Scoring page (Ctrl+A, Ctrl+C) into a matchup
// snapshot (both teams' names, scores and starters with points) and, via
// convertFfpcLivePage, your roster and league name too, so one weekly paste
// covers everything.
//
// The page lists two score blocks ("Club 223 / In Play: … / Projected Points: … / 140.45"),
// then team 1's starters as groups (slot line, "Drake Maye NE", stats, "26.15"),
// then a "Pos  Bench  Status…" table, then team 2's starters and bench table.

import { parseFfpcHeader } from './ffpc';
import type { ManualMatchup, ManualMatchupSide } from './index';

const SLOT_LINE = /^(QB|RB|WR|TE|Flex|FLEX|SF|SFLEX|SuperFlex|SUPERFLEX|OP|PK|K|DST|DEF)$/;
const POINTS = /^-?\d+(?:\.\d+)?$/;
const PLAYER_LINE = /^(.+?)\s+([A-Z]{2,3})$/; // "Drake Maye NE"
const BENCH_HEADER = /^Pos\s+Bench\s+Status/;
const BENCH_ROW = /^(?:QB|RB|WR|TE|PK|K|DST)\t([^\t,]+),\s*([A-Z]{2,3})(?:\t|$)/; // "QB\tBryce Young, CAR\tPHI"

const SLOT_OUT: Record<string, string> = { Flex: 'FLEX', SuperFlex: 'SUPERFLEX', PK: 'K', DST: 'DEF' };

export function looksLikeFfpcLiveScoring(text: string): boolean {
  return /Player Min Remaining:/.test(text) && /^Pos\s+Bench\s+Status/m.test(text);
}

// Defenses read "SEA Team Defense SEA" (starters) or "SEA Team Defense, SEA" (bench).
const defenseOr = (name: string, team: string) => (/Team Defense$/.test(name) ? `${team} DST` : name);

function starterName(line: string): string {
  const m = PLAYER_LINE.exec(line);
  return m ? defenseOr(m[1]!, m[2]!) : line;
}

interface LiveTeam extends ManualMatchupSide {
  bench: string[];
}

function parseLivePage(text: string): { week: number; teams: LiveTeam[] } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const week = Number(/Week\s+(\d+)\s*\(Current\)/.exec(text)?.[1] ?? 0);

  // Score blocks: a team name line followed by "In Play:".
  const teams: LiveTeam[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i + 1]!.startsWith('In Play:')) continue;
    const projIdx = lines.findIndex((l, j) => j > i && l.startsWith('Projected Points:'));
    const score = lines.slice(projIdx + 1).find((l) => POINTS.test(l));
    teams.push({ teamName: lines[i]!, points: Number(score ?? 0), starters: [], bench: [] });
  }
  if (teams.length < 2) return null;

  // Team index advances each time a slot group follows a bench table.
  let team = 0;
  let inBench = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (BENCH_HEADER.test(line)) {
      inBench = true;
      continue;
    }
    const slot = SLOT_LINE.exec(line)?.[1];
    if (!slot) {
      const benchRow = inBench && BENCH_ROW.exec(line);
      if (benchRow) teams[team]?.bench.push(defenseOr(benchRow[1]!.trim(), benchRow[2]!));
      continue;
    }
    if (inBench) {
      team++;
      inBench = false;
    }
    const side = teams[team];
    const nameLine = lines.slice(i + 1).find((l) => l !== '');
    if (!side || !nameLine) continue;
    const pointsLine = lines.slice(i + 2).find((l) => POINTS.test(l));
    side.starters.push({ slot: SLOT_OUT[slot] ?? slot, name: starterName(nameLine), points: Number(pointsLine ?? 0) });
  }
  return { week, teams };
}

// Which of the two teams is yours: by name (yours, or the page header's), else the first.
function splitTeams(teams: LiveTeam[], myTeamName: string | null | undefined): [LiveTeam, LiveTeam] {
  const [a, b] = teams as [LiveTeam, LiveTeam];
  const mine = myTeamName?.trim().toLowerCase();
  return mine && b.teamName.toLowerCase() === mine ? [b, a] : [a, b];
}

const toSide = ({ teamName, points, starters }: LiveTeam): ManualMatchupSide => ({ teamName, points, starters });

export function convertFfpcLiveScoring(
  text: string,
  myTeamName?: string,
  capturedAt = new Date().toISOString(),
): ManualMatchup | null {
  return convertFfpcLivePage(text, myTeamName, capturedAt)?.matchup ?? null;
}

export interface FfpcLiveImport {
  leagueName: string | null;
  teamName: string | null;
  matchup: ManualMatchup;
  rosterText: string; // your starters and bench (the Live Scoring page has no IR section)
  players: number;
}

export function convertFfpcLivePage(
  text: string,
  myTeamName?: string,
  capturedAt = new Date().toISOString(),
): FfpcLiveImport | null {
  const parsed = parseLivePage(text);
  if (!parsed) return null;
  const header = parseFfpcHeader(text);
  const [me, opponent] = splitTeams(parsed.teams, myTeamName || header?.teamName);
  if (me.starters.length === 0) return null;

  const roster = [...me.starters.map((s) => `${s.slot} ${s.name}`), ...me.bench.map((name) => `BN ${name}`)];
  return {
    leagueName: header?.leagueName ?? null,
    teamName: header?.teamName ?? me.teamName,
    matchup: { week: parsed.week, capturedAt, me: toSide(me), opponent: toSide(opponent) },
    rosterText: roster.join('\n'),
    players: roster.length,
  };
}
